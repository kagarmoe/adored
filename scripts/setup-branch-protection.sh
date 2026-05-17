#!/usr/bin/env bash
# Configures branch protection on `main` to require the CI checks defined in
# .github/workflows/ci.yml. Idempotent — re-running it overwrites the
# protection ruleset with the same configuration.
#
# Why a script instead of doing it in the GitHub UI: the required check names
# must match the workflow job names exactly. Keeping them in code next to
# the workflow means renaming a job here forces an update here too — they
# can't silently drift.
#
# Why a separate script instead of a workflow that configures itself: the
# default GITHUB_TOKEN cannot edit repository administration settings; that
# requires a PAT with `repo` scope. Running this once locally as the repo
# owner (via `gh`, already authenticated) is simpler than provisioning a PAT
# into Actions secrets.
#
# Prereqs:
#   - `gh` is authenticated as a repo admin (`gh auth status`).
#   - The CI workflow has run at least once on `main`, so GitHub recognizes
#     the check names below. If it hasn't, this command will succeed but
#     PRs will block on a check that has never reported.
#
# Verify after running:
#   gh api repos/:owner/:repo/branches/main/protection | jq .required_status_checks

set -euo pipefail

OWNER_REPO=$(gh repo view --json owner,name -q '"\(.owner.login)/\(.name)"')
BRANCH=main

# Required checks. When adding a job to .github/workflows/ci.yml, add its
# name here. When the e2e gate (purses-chh.1) lands, add "e2e".
CHECKS=("lint" "typecheck" "test")

# Build the contexts JSON array.
contexts_json=$(printf '%s\n' "${CHECKS[@]}" | jq -R . | jq -s .)

echo "Configuring branch protection for ${OWNER_REPO}@${BRANCH}"
echo "Required checks: ${CHECKS[*]}"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER_REPO}/branches/${BRANCH}/protection" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": $(echo "$contexts_json")
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
JSON

echo
echo "Done. Verify with:"
echo "  gh api repos/${OWNER_REPO}/branches/${BRANCH}/protection | jq .required_status_checks"
