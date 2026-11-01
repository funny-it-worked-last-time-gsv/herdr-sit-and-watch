#!/usr/bin/env python3
"""PreToolUse hook: tell the Sit & Watch panel in the Herdr app what this Claude Code session is doing
right now ("Edit main.js", "Run npm test"), so its desk's speech bubble shows real activity.
Never blocks or fails anything.

Sends `herdr-app do sitandwatch.act-<terminal>-<text>`, where <terminal> is the Herdr terminal this
session runs in (HC_TERMINAL_ID) and <text> is the phrase in base64url (letters, digits, - and _ only,
so file names and spaces can't break the command). The phrase is printable ASCII, at most 40 characters."""
from __future__ import annotations  # `str | None` annotations on Python 3.9

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import stat
import time

# The bubble shows at most 20 characters (sayText in rules.js), so the hook sends no more: what can't be
# shown never leaves the hook (not in herdr-app's arguments, not in the cache).
MAX = 20

# Programs whose second word is a subcommand worth showing ("git push", "npm test"). For anything else the
# second word is an argument (`printf <token>`, `cd <client-folder>`), so only the program shows.
SUBCOMMANDS = {"git", "npm", "pnpm", "yarn", "bun", "deno", "gh", "glab", "docker", "podman", "kubectl", "helm",
               "terraform", "cargo", "go", "pip", "pip3", "uv", "poetry", "make", "brew", "vercel", "herdr-app",
               "hc", "swift", "dotnet", "mvn", "gradle", "flutter", "rails", "bundle", "mix", "composer"}

# Words that look like a secret: known key prefixes, or 6+ characters mixing letters with digits
# (API keys, tokens, most passwords). They show as ***. Costs the odd "sha256" or "user123", on purpose.
SECRET_PREFIX = re.compile(r"^(sk[-_]|pk[-_]|rk[-_]|ghp_|gho_|ghs_|ghu_|github_pat_|glpat-|xox[a-z]-|AKIA|ASIA|AIza|eyJ|-----BEGIN)")
# A repeat of the phrase this terminal last sent is skipped for this long. Under the panel's one
# minute (ACT_FRESH_MS), so a desk that keeps doing the same thing never goes stale.
REPEAT_S = 30


def _base(path: str) -> str:
    return os.path.basename(str(path or "").rstrip("/")) or str(path or "")


def program(cmd: str) -> str:
    """A command's program and subcommand only ("npm test", "git push"): leading VAR=value assignments
    are skipped and a path becomes its last part, and nothing else of the command is shown (arguments can
    hold paths and secrets)."""
    words = [w for w in cmd.split()]
    while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
        words.pop(0)
    if not words:
        return "a command"
    name = _base(words[0])
    sub = words[1] if name in SUBCOMMANDS and len(words) > 1 and re.match(r"^[a-z][a-z-]{0,19}$", words[1]) else ""
    return f"{name} {sub}".strip()


def secretish(word: str) -> bool:
    w = word.strip("'\"`()[]{}<>,;:")
    return bool(SECRET_PREFIX.match(w)) or (len(w) >= 6 and bool(re.search(r"[A-Za-z]", w)) and bool(re.search(r"[0-9]", w)))


def redact(text: str) -> str:
    """Free text the session typed (a search pattern, a query, a sub-agent's task), with secret-shaped words
    as ***."""
    return " ".join("***" if secretish(w) else w for w in str(text or "").split(" "))


def describe(tool: str, args: dict) -> str:
    """A short phrase for this tool call: a plain verb or the tool's own name, then what it's on."""
    a = args if isinstance(args, dict) else {}
    if tool in ("Read", "NotebookRead"):
        return f"Read {_base(a.get('file_path') or a.get('notebook_path'))}"
    if tool in ("Edit", "MultiEdit", "Write", "NotebookEdit"):
        return f"Edit {_base(a.get('file_path') or a.get('notebook_path'))}"
    if tool == "Bash":
        return "Run " + program(str(a.get("command") or ""))
    if tool == "Grep":
        return f"Grep {redact(a.get('pattern'))}"
    if tool == "Glob":
        return f"Glob {redact(a.get('pattern'))}"
    if tool in ("Task", "Agent"):
        return f"> {redact(a.get('description') or 'a sub-agent')}"
    if tool == "WebFetch":
        return "Read the web"
    if tool == "WebSearch":
        return f"Search {redact(a.get('query'))}"
    if tool == "TodoWrite":
        return "Plan"
    if tool.startswith("mcp__"):
        return f"Use {mcp_service(tool)}"
    return tool or ""


def mcp_service(tool: str) -> str:
    """The service behind an MCP tool, for "Use <service>": mcp__claude_ai_Gmail__search_threads -> Gmail,
    mcp__plugin_vercel_vercel__list_projects -> vercel. Not the tool's own name, which is long and says
    more than the bubble needs."""
    server = tool.split("__")[1] if tool.count("__") >= 2 else tool[5:]
    return server.split("_")[-1] or server


def phrase(text: str) -> str:
    """Printable ASCII on one line, at most MAX characters (cut at a word, with ...)."""
    t = re.sub(r"[^\x20-\x7e]", "", re.sub(r"\s+", " ", text)).strip()
    if len(t) <= MAX:
        return t
    cut = t[:MAX - 2]   # one past the 17 that fit before "...", so a word ending right at 17 is kept whole
    space = cut.rfind(" ")
    # At a word, unless that leaves only the verb ("Read..."): then mid-word ("Read a-very-long-..."). Safe,
    # since secret-shaped words are *** by now.
    return (cut[:space] if space > t.find(" ") else cut[:MAX - 3]).rstrip() + "..."


def enabled() -> bool:
    """The panel's "Activity bubbles" option (Options dialog, or `herdr-app do sitandwatch.activity`), read
    from Herdr's shared state. Off: send nothing, so turning it off costs nothing. Unreadable: on."""
    home = os.environ.get("HERDR_APP_HOME") or os.path.join(os.path.expanduser("~"), ".config", "herdr-app")
    try:
        with open(os.path.join(home, "shared.json")) as f:
            opts = json.load(f).get("sitandwatch.options") or {}
        return opts.get("activity") is not False
    except Exception:
        return True


def command(data: dict, terminal: str) -> str | None:
    """The panel command for this hook input, or None when there's nothing to send."""
    if (data.get("hook_event_name") or "") != "PreToolUse":
        return None
    term = re.sub(r"[^A-Za-z0-9]", "", terminal or "")[:16]
    text = phrase(describe(str(data.get("tool_name") or ""), data.get("tool_input") or {}))
    if not (term and text):
        return None
    enc = base64.urlsafe_b64encode(text.encode("ascii")).decode("ascii").rstrip("=")
    return f"sitandwatch.act-{term}-{enc}"


def _cache(cmd: str) -> str:
    """The file that remembers what this terminal last sent: one per terminal, in ~/.cache/sitandwatch
    (or SITANDWATCH_ACT_DIR, which the offline checks set so runs don't see each other). Not the temp
    folder: without TMPDIR that's the shared /tmp, where another account could plant a link or read the
    phrase. The folder is created owner-only and must be a real folder this user owns, not a link."""
    term = cmd.split("-")[1]   # sitandwatch.act-<term>-<text>; <term> is letters and digits only
    folder = os.environ.get("SITANDWATCH_ACT_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "sitandwatch")
    os.makedirs(folder, mode=0o700, exist_ok=True)
    st = os.lstat(folder)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        raise OSError("cache folder isn't a folder of ours")
    return os.path.join(folder, f"sitandwatch-act-{term}")


def is_repeat(cmd: str, now: float) -> bool:
    """True when this terminal sent exactly this command less than REPEAT_S ago. Each send costs a
    herdr-app process and Herdr's dispatch, and a busy session repeats itself a lot. Any trouble with
    the cache counts as not a repeat, so the worst case is sending."""
    try:
        fd = os.open(_cache(cmd), os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd) as f:
            at, last = f.read().split("\t", 1)
        return last == cmd and now - float(at) < REPEAT_S
    except Exception:
        return False


def remember(cmd: str, now: float) -> None:
    """Owner-only (0600), and never through a link: O_NOFOLLOW refuses one planted at the cache's path."""
    try:
        fd = os.open(_cache(cmd), os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(f"{now}\t{cmd}")
    except Exception:
        pass


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = command(data, os.environ.get("HC_TERMINAL_ID", ""))
    if not cmd or not enabled():
        return
    herdr = shutil.which("herdr-app")
    now = time.time()
    if cmd and herdr and not is_repeat(cmd, now):
        remember(cmd, now)
        subprocess.run([herdr, "do", cmd], capture_output=True, timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
