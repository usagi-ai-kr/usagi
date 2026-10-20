#!/usr/bin/env bash
# Apply repository merge settings and main branch protection.
# Usage: ./scripts/apply-repo-policy.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${REPO:-${GITHUB_REPOSITORY:-usagi-ai-kr/usagi}}"
branch="${BRANCH:-main}"
check="${CHECK_NAME:-validate}"
config="$root/.github/branch-protection.json"
payload="$(mktemp)"
trap 'rm -f "$payload"' EXIT

command -v gh >/dev/null || {
  echo "error: gh is required" >&2
  exit 1
}
command -v jq >/dev/null || {
  echo "error: jq is required" >&2
  exit 1
}
[ -f "$config" ] || {
  echo "error: missing $config" >&2
  exit 1
}

jq --arg check "$check" \
  '.required_status_checks.contexts = [$check]' \
  "$config" > "$payload"

echo "configuring merge settings for $repo..."
gh api --method PATCH "repos/$repo" \
  -F allow_merge_commit=false \
  -F allow_squash_merge=true \
  -F allow_rebase_merge=true \
  -F delete_branch_on_merge=true >/dev/null

echo "applying branch protection to $repo@$branch..."
gh api --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/$repo/branches/$branch/protection" \
  --input "$payload" >/dev/null

echo "applied: squash/rebase only, delete branch on merge, protected $branch (required check: $check)"
