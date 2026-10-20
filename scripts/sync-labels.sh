#!/usr/bin/env bash
# Sync .github/labels.json to GitHub labels.
# Usage: ./scripts/sync-labels.sh [path/to/labels.json]
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${REPO:-${GITHUB_REPOSITORY:-usagi-ai-kr/usagi}}"
config="${1:-"$root/.github/labels.json"}"

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

jq -e '.labels | type == "array" and length > 0' "$config" >/dev/null

count=0
while IFS=$'\t' read -r name color description; do
  gh label create "$name" \
    --repo "$repo" \
    --color "$color" \
    --description "$description" \
    --force >/dev/null
  count=$((count + 1))
done < <(jq -r '.labels[] | [.name, .color, .description] | @tsv' "$config")

echo "synced $count labels to $repo"
