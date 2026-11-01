#!/usr/bin/env python3
"""PreToolUse hook: tell the Sit & Watch panel in the Herdr app what this Claude Code session is doing
right now ("Editing main.js", "Running npm test"), so its desk's speech bubble shows real activity.
Never blocks or fails anything.

Sends `herdr-app do sitandwatch.act-<terminal>-<text>`, where <terminal> is the Herdr terminal this
session runs in (HC_TERMINAL_ID) and <text> is the phrase in base64url (letters, digits, - and _ only,
so file names and spaces can't break the command). The phrase is printable ASCII, at most 40 characters."""
import base64
import json
import os
import re
import shutil
import subprocess
import sys

MAX = 40


def _base(path: str) -> str:
    return os.path.basename(str(path or "").rstrip("/")) or str(path or "")


def describe(tool: str, args: dict) -> str:
    """A short phrase for this tool call."""
    a = args if isinstance(args, dict) else {}
    if tool in ("Read", "NotebookRead"):
        return f"Reading {_base(a.get('file_path') or a.get('notebook_path'))}"
    if tool in ("Edit", "MultiEdit", "Write", "NotebookEdit"):
        return f"Editing {_base(a.get('file_path') or a.get('notebook_path'))}"
    if tool == "Bash":
        words = str(a.get("command") or "").split()
        return "Running " + " ".join(words[:3]) if words else "Running a command"
    if tool == "Grep":
        return f"Searching {a.get('pattern') or ''}"
    if tool == "Glob":
        return f"Looking for {a.get('pattern') or ''}"
    if tool in ("Task", "Agent"):
        return f"Delegating: {a.get('description') or 'a sub-agent'}"
    if tool == "WebFetch":
        return "Reading the web"
    if tool == "WebSearch":
        return f"Searching the web: {a.get('query') or ''}"
    if tool == "TodoWrite":
        return "Planning"
    return tool or ""


def phrase(text: str) -> str:
    """Printable ASCII on one line, at most MAX characters (cut at a word, with ...)."""
    t = re.sub(r"[^\x20-\x7e]", "", re.sub(r"\s+", " ", text)).strip()
    if len(t) <= MAX:
        return t
    cut = t[:MAX - 3]
    space = cut.rfind(" ")
    return (cut[:space] if space >= 12 else cut) + "..."


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


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = command(data, os.environ.get("HC_TERMINAL_ID", ""))
    herdr = shutil.which("herdr-app")
    if cmd and herdr:
        subprocess.run([herdr, "do", cmd], capture_output=True, timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
