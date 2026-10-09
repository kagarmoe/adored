#!/usr/bin/env python3
"""PreToolUse nudge: point Claude at graphify before raw search/reads.

Fires at most once per session (marker file keyed on session_id), so the
reminder isn't re-injected before every Bash/Read/Glob call.
Usage: graphify-nudge.py bash|read   (reads hook JSON on stdin)
"""
import json, os, sys, tempfile

SEARCH = ("grep", "rg ", "ripgrep", "find ", "fd ", "ack ", "ag ")
EXTS = (".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".rs", ".java", ".rb", ".c", ".h",
        ".cpp", ".hpp", ".cc", ".cs", ".kt", ".swift", ".php", ".scala", ".lua", ".sh",
        ".md", ".rst", ".txt", ".mdx")
MSG = ("graphify-out/graph.json exists. Before grepping or reading source files, orient with "
       '`graphify query "<question>"`, `graphify explain "<concept>"`, or '
       '`graphify path "<A>" "<B>"`; then read raw files to modify/debug specific lines. '
       "Mention this in subagent prompts that explore code.")


def main():
    d = json.load(sys.stdin)
    t = d.get("tool_input", d)
    if sys.argv[1] == "bash":
        hit = any(s in t.get("command", "") for s in SEARCH)
    else:
        s = " ".join(str(t.get(k) or "") for k in ("file_path", "pattern", "path")).lower().replace("\\", "/")
        hit = "graphify-out/" not in s and any(e in s for e in EXTS)
    if not hit or not os.path.exists("graphify-out/graph.json"):
        return
    marker = os.path.join(tempfile.gettempdir(), "graphify-nudge-" + str(d.get("session_id", "none")))
    if os.path.exists(marker):
        return
    open(marker, "w").close()
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": MSG}}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # a nudge must never block a tool call
