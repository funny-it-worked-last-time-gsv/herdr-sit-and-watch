#!/usr/bin/env python3
"""PostToolUse hook (Bash): when a command actually ships something, set off the
Sit & Watch explosion in the Herdr app. Never blocks or fails the tool call."""
import json
import re
import shutil
import subprocess
import sys


def is_ship(cmd: str) -> bool:
    """True when this shell command counts as shipping."""
    if re.search(r"--dry-run|\s-n\b", cmd):
        return False
    return bool(re.search(
        r"\bgit\s+push\b"                    # pushed a branch
        r"|\bgh\s+pr\s+merge\b"              # merged a PR
        r"|\bvercel\b.*(--prod|\bpromote\b)",  # production deploy
        cmd,
    ))


def ship_kind(cmd: str) -> str:
    """What shipped, for the banner: the panel shows PR MERGED, DEPLOYED or IT'S LIVE."""
    if re.search(r"\bgh\s+pr\s+merge\b", cmd):
        return "merged"
    if re.search(r"\bvercel\b", cmd):
        return "deployed"
    return "pushed"


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    if not is_ship(cmd):
        return
    herdr = shutil.which("herdr-app")
    if herdr:
        subprocess.run([herdr, "do", f"sitandwatch.ship-{ship_kind(cmd)}"], capture_output=True, timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
