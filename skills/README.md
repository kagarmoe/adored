# Project-local skills

Hand-authored skills for this repo. The source lives here (version-controlled);
discovery happens through symlinks in `.claude/skills/`, which is **gitignored**
(that directory is managed by the skills package manager — see `skills-lock.json`).

So after a fresh clone, make the local skills discoverable:

```bash
bash scripts/link-local-skills.sh
```

This symlinks each `skills/<name>/` into `.claude/skills/<name>` (idempotent),
the same shape the package-manager skills use. Re-run it after adding a new
local skill.

## Skills

- **adversarial-review** — a six-persona (QA/Test, Security, Architect,
  Craftsman/simplicity, Graphic Design, UX) guilty-until-proven review that
  defeats rubber-stamping. Invoke before merging substantial work, or when
  asked to red-team / find holes.
