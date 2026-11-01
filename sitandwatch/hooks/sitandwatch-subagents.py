#!/usr/bin/env python3
"""SubagentStart / SubagentStop hook: tell the Sit & Watch panel in the Herdr app when one of this
Claude Code session's sub-agents (the Agent tool) starts and stops, so it shows on the session's desk
as done/total (2/5), counts as working and sets off the welcome and the finish. Never blocks or fails
anything.

Sends `herdr-app do sitandwatch.sub-start-<terminal>-<agent id>` (or sub-stop-...), where <terminal> is
the Herdr terminal this session runs in (HC_TERMINAL_ID) and the agent id pairs the start with its stop."""
from __future__ import annotations  # `str | None` annotations on Python 3.9

import json
import os
import re
import shutil
import subprocess
import sys

EVENTS = {"SubagentStart": "sub-start", "SubagentStop": "sub-stop"}


def command(data: dict, terminal: str) -> str | None:
    """The panel command for this hook input, or None when there's nothing to send."""
    verb = EVENTS.get(data.get("hook_event_name") or "")
    agent = re.sub(r"[^A-Za-z0-9]", "", str(data.get("agent_id") or ""))[:24]
    term = re.sub(r"[^A-Za-z0-9]", "", terminal or "")[:16]
    if not (verb and agent and term):
        return None
    return f"sitandwatch.{verb}-{term}-{agent}"


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
