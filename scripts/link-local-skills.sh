#!/usr/bin/env bash
#
# Make the hand-authored skills under skills/ discoverable by Claude Code by
# symlinking each into .claude/skills/ (which is gitignored — see skills-lock.json).
# Idempotent: safe to re-run. Run after a fresh clone or after adding a skill.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${ROOT}/.claude/skills"

for dir in "${ROOT}"/skills/*/; do
  [ -f "${dir}SKILL.md" ] || continue
  name="$(basename "${dir}")"
  ln -sfn "../../skills/${name}" "${ROOT}/.claude/skills/${name}"
  echo "linked ${name}"
done
