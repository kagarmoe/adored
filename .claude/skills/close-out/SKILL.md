---
name: close-out
description: Use IMMEDIATELY AFTER merging a PR — close the bead, harvest durable lessons to bd memory (chat-first), and delete this branch's .git/sdd scratch. Never before merge is confirmed.
---

# /close-out

Run **right after `gh pr merge` succeeds.** Nothing here is destructive-before-merge: the bead and the sdd scratch must survive the whole review→fix→merge loop.

## Steps (any order)
1. **Close the bead(s):** `bd close <id> --reason "merged in #<PR>"` for the problem this PR resolved. (Skip if no bead.)
2. **Harvest lessons → memory:** scan the **conversation first**, then the ledger, for durable lessons / recurring problems (gotchas, non-obvious decisions). For each: `bd remember --key <slug> "<lesson>"`. Dedupe against `bd memories`; update in place if present. Skip session-only trivia and anything the code/CLAUDE.md already states.
3. **Delete this branch's scratch:**
   ```sh
   scope=$(git branch --show-current | tr '/' '-')
   [ -n "$scope" ] && rm -rf "$(git rev-parse --git-path sdd)/$scope"
   ```
   (The empty-`scope` guard prevents ever `rm -rf`-ing the whole `.git/sdd`.)

## Rules
- Chat is the primary lesson source (never clobbered); the ledger is supplementary.
- Never close a bead or delete scratch for work that has NOT merged.
- Idempotent: re-running after everything's closed is a no-op.
