#!/usr/bin/env python3
"""PostToolUse hook (Bash): tell the Sit & Watch panel in the Herdr app when a command ships something
(the explosion: a PR merged, a production deploy, a push to the main branch), opens a PR, or pushes a
branch (smaller reactions). Never blocks or fails the tool call."""
from __future__ import annotations  # `str | None` annotations on Python 3.9

import json
import os
import re
import shlex
import shutil
import subprocess
import sys


HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")


def strip_heredocs(cmd: str) -> str:
    """The command without its here-document bodies (<<EOF ... EOF): they're data, like a commit message,
    and their apostrophes ("isn't") would otherwise read as quotes. Not `<<<`, a one-word here-string."""
    lines, out, i = cmd.split("\n"), [], 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        for m in HEREDOC.finditer(line):
            while i < len(lines) and lines[i].strip() != m.group(2):
                i += 1
            i += 1                                           # the closing delimiter line
    return "\n".join(out)


def steps(cmd: str) -> list:
    """The steps of a compound command, split on &&, ||, ;, | and newlines like the shell: never inside
    quotes, so a long quoted argument (a PR body, a commit message in "$(cat <<EOF ...)") stays one step
    and its lines aren't read as commands. One step at a time, so a dry-run flag only cancels the push
    it belongs to, not a `grep -n` elsewhere in the same command."""
    cmd = strip_heredocs(cmd)
    out, cur, quote, i = [], [], None, 0
    while i < len(cmd):
        c = cmd[i]
        if quote:
            cur.append(c)
            if c == "\\" and quote == '"' and i + 1 < len(cmd):
                cur.append(cmd[i + 1])
                i += 1
            elif c == quote:
                quote = None
        elif c in "'\"":
            quote = c
            cur.append(c)
        elif cmd.startswith(("&&", "||"), i):
            out.append("".join(cur))
            cur = []
            i += 1
        elif c in ";|\n":
            out.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    out.append("".join(cur))
    return [p for p in out if p.strip()]


# Pushing a feature branch (say, to open a PR) isn't shipping: only a push that updates the main branch is.
MAIN_BRANCHES = {"main", "master"}


def _git(cwd: str, *args: str) -> str:
    try:
        r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=3)
        return r.stdout.strip() if r.returncode == 0 else ""
    except Exception:
        return ""


def main_branches(cwd: str) -> set:
    """main and master, and whatever the remote's default branch is (origin/HEAD)."""
    head = _git(cwd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")   # "origin/trunk"
    return MAIN_BRANCHES | ({head.split("/", 1)[-1]} if head else set())


def _current(cwd: str) -> str:
    return _git(cwd, "symbolic-ref", "--short", "HEAD")   # works before the first commit, unlike rev-parse


def command_words(part: str) -> list:
    """One step's words, read like the shell (quotes kept together, so quoted text is one word), with
    leading VAR=value assignments and an npx/bunx runner dropped. The first word is the command."""
    try:
        words = shlex.split(part)
    except ValueError:
        words = part.split()
    while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
        words.pop(0)
    if words and words[0] in ("npx", "bunx"):
        words.pop(0)
    return words


def git_push(part: str, cwd: str):
    """(arguments after `push`, the folder it runs in) when this part is `git [options] push ...`, else None.
    Read like the shell would (quotes kept together), so `git -c credential.helper='!gh auth x' push` counts
    and `git log --grep push` doesn't. `-C <dir>` moves the folder."""
    words = command_words(part)
    if not words or os.path.basename(words[0]) != "git":
        return None                                          # git must be the command: not `echo git push`
    rest, where = words[1:], cwd
    while rest:
        w = rest.pop(0)
        if w in ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"):
            value = rest.pop(0) if rest else ""
            if w == "-C":
                where = _resolve(where, value)
        elif w.startswith("-"):
            continue
        else:
            return (rest, where) if w == "push" else None
    return None


def push_targets(args: list, cwd: str) -> set:
    """The branches `git push <args>` updates on the remote. Empty for a dry run, a delete or tags alone.
    No branch named: the current one (what a plain `git push` sends)."""
    if any(a in ("--dry-run", "--delete", "-d") or re.match(r"^-[a-zA-Z]*n[a-zA-Z]*$", a) for a in args):
        return set()
    skip, positional = False, []
    for a in args:
        if skip:
            skip = False
        elif a in ("-o", "--push-option", "--repo", "--receive-pack", "--exec"):
            skip = True                                      # an option with its value in the next word
        elif not a.startswith("-"):
            positional.append(a)
    refspecs = positional[1:]                                # the first is the remote
    if not refspecs:
        return set() if "--tags" in args else {_current(cwd)}
    dests = set()
    for spec in refspecs:
        src, colon, dst = spec.lstrip("+").partition(":")
        if colon and not src:
            continue                                         # ":branch" deletes it
        dst = dst or src
        dests.add(_current(cwd) if dst == "HEAD" else re.sub(r"^refs/heads/", "", dst))
    return dests


def ship_part(part: str, cwd: str = ".") -> str | None:
    """What this one command does: ships ("merged", "deployed", "pushed": to main), opens a PR ("pr"),
    pushes another branch ("push"), or None."""
    # The command itself, not words in quoted text: a PR body that says "gh pr merge" merges nothing.
    words = command_words(part)
    cmd = os.path.basename(words[0]) if words else ""
    if cmd == "gh" and words[1:3] == ["pr", "merge"]:
        return "merged"
    if cmd == "vercel" and ("--prod" in words or "promote" in words[1:2]):
        return "deployed"
    if cmd == "gh" and words[1:3] == ["pr", "create"]:
        return "pr"
    push = git_push(part, cwd)
    if push:
        targets = push_targets(*push)
        if targets & main_branches(push[1]):
            return "pushed"
        if targets - {""}:
            return "push"
    return None


def _resolve(cwd: str, path: str) -> str:
    path = os.path.expanduser(path.strip("'\""))
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(cwd, path))


def ship_kind(cmd: str, cwd: str = ".") -> str | None:
    """The biggest thing this shell command ships, for the banner (PR MERGED > DEPLOYED > IT'S LIVE), or None.
    cwd is where the session runs; a `cd <dir>` step earlier in the command moves it, as the shell would."""
    kinds = set()
    for p in steps(cmd):
        c = re.match(r"\s*cd\s+(\S+)\s*$", p)
        if c:
            cwd = _resolve(cwd, c.group(1))
        elif (k := ship_part(p, cwd)):
            kinds.add(k)
    for k in KINDS:
        if k in kinds:
            return k
    return None


# Biggest first: one command that opens a PR usually pushes its branch too, and that's the PR.
KINDS = ("merged", "deployed", "pushed", "pr", "push")
SHIPS = ("merged", "deployed", "pushed")


def is_ship(cmd: str, cwd: str = ".") -> bool:
    """True when this shell command ships (the explosion), not just a branch push or a new PR."""
    return ship_kind(cmd, cwd) in SHIPS


def pr_number(response) -> str:
    """The PR number from gh pr create's output (it prints the PR's URL), or "" when there isn't one."""
    m = re.search(r"/pull/(\d{1,6})\b", json.dumps(response) if not isinstance(response, str) else response)
    return m.group(1) if m else ""


def panel_command(kind: str, response) -> str:
    """The `herdr-app do` command for this kind: ship-<kind>, pr-<number> (or pr), push."""
    if kind in SHIPS:
        return f"sitandwatch.ship-{kind}"
    if kind == "pr":
        n = pr_number(response)
        return f"sitandwatch.pr-{n}" if n else "sitandwatch.pr"
    return "sitandwatch.push"


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    kind = ship_kind(cmd, data.get("cwd") or os.getcwd())
    herdr = shutil.which("herdr-app")
    if kind and herdr:
        subprocess.run([herdr, "do", panel_command(kind, data.get("tool_response"))], capture_output=True, timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
