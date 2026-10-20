#!/usr/bin/env bash
# Publish docs/glossary.md and docs/wiki/*.md to the GitHub wiki.
# Usage:
#   ./scripts/sync-wiki.sh           # publish
#   ./scripts/sync-wiki.sh --check   # fail if the wiki differs
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${REPO:-${GITHUB_REPOSITORY:-usagi-ai-kr/usagi}}"
mode="${1:-publish}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

case "$mode" in
  publish|--check) ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac

git clone --depth 1 "https://github.com/${repo}.wiki.git" "$tmp/wiki" >/dev/null 2>&1 || {
  echo "error: could not clone https://github.com/${repo}.wiki.git" >&2
  echo "       check that the wiki is enabled and the repository exists" >&2
  exit 1
}

mkdir -p "$tmp/generated"

# docs/wiki/*.md -> wiki root.
while IFS= read -r -d '' source; do
  cp "$source" "$tmp/generated/$(basename "$source")"
done < <(find "$root/docs/wiki" -maxdepth 1 -type f -name '*.md' -print0)

# Glossary is generated from the canonical glossary in docs/.
{
  printf '%s\n' '<!-- Generated from docs/glossary.md by scripts/sync-wiki.sh. Do not edit directly. -->'
  cat "$root/docs/glossary.md"
} > "$tmp/generated/Glossary.md"

if [ "$mode" = "--check" ]; then
  status=0
  for generated in "$tmp/generated"/*.md; do
    name="$(basename "$generated")"
    current="/dev/null"
    [ -f "$tmp/wiki/$name" ] && current="$tmp/wiki/$name"
    if ! diff -u "$current" "$generated" >/dev/null 2>&1; then
      echo "wiki is out of date: $name" >&2
      diff -u "$current" "$generated" | sed -n '1,40p' >&2 || true
      status=1
    fi
  done

  if [ "$status" -eq 0 ]; then
    echo "wiki is in sync with docs/"
  fi
  exit "$status"
fi

cp "$tmp/generated"/*.md "$tmp/wiki/"

cd "$tmp/wiki"
git add Home.md _Sidebar.md Glossary.md
if git diff --cached --quiet; then
  echo "wiki already up to date"
  exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-usagi-bot}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-usagi-bot@users.noreply.github.com}" \
    commit -m "docs: sync glossary and wiki home"

git pull --rebase origin HEAD >/dev/null 2>&1 || true
git push origin HEAD

echo "published wiki for $repo"
