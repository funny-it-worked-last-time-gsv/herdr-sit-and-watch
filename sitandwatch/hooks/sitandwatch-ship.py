#!/usr/bin/env python3
"""PostToolUse hook (Bash): when a command actually ships something, set off the
Sit & Watch explosion in the Herdr app. Never blocks or fails the tool call."""
from __future__ import annotations  # `str | None` annotations on Python 3.9

import json
import re
import shutil
import subprocess
import sys


# One part of a compound command (split on &&, ||, ;, | and newlines) at a time, so a dry-run flag
# only cancels the push it belongs to, not a `grep -n` or `head -n` elsewhere in the same command.
PARTS = re.compile(r"&&|\|\||;|\||\n")


def ship_part(part: str) -> str | None:
    """What this one command ships ("merged", "deployed", "pushed"), or None."""
    if re.search(r"\bgh\s+pr\s+merge\b", part):
        return "merged"
    if re.search(r"\bvercel\b.*(--prod|\bpromote\b)", part):
        return "deployed"
    if re.search(r"\bgit\s+push\b", part) and not re.search(r"--dry-run|\s-n\b|\s-\w*n\w*\b", part.split("push", 1)[1]):
        return "pushed"
    return None


def ship_kind(cmd: str) -> str | None:
    """The biggest thing this shell command ships, for the banner (PR MERGED > DEPLOYED > IT'S LIVE), or None."""
    kinds = {k for k in (ship_part(p) for p in PARTS.split(cmd)) if k}
    for k in ("merged", "deployed", "pushed"):
        if k in kinds:
            return k
    return None


def is_ship(cmd: str) -> bool:
    """True when this shell command counts as shipping."""
    return ship_kind(cmd) is not None


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    cmd = (data.get("tool_input") or {}).get("command") or ""
    kind = ship_kind(cmd)
    herdr = shutil.which("herdr-app")
    if kind and herdr:
        subprocess.run([herdr, "do", f"sitandwatch.ship-{kind}"], capture_output=True, timeout=5)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
