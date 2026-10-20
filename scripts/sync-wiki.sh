#!/usr/bin/env bash
# Publish the glossary index, category documents and wiki home to GitHub wiki.
# Usage:
#   ./scripts/sync-wiki.sh           # publish
#   ./scripts/sync-wiki.sh --check   # fail if the wiki differs
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="${REPO:-${GITHUB_REPOSITORY:-usagi-ai-kr/usagi}}"
mode="${1:-publish}"
config="$root/docs/glossary/categories.json"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

case "$mode" in
  publish|--check) ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac

command -v jq >/dev/null || {
  echo "error: jq is required" >&2
  exit 1
}
[ -f "$config" ] || {
  echo "error: missing $config" >&2
  exit 1
}

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

# The index links to docs/glossary/*.md; rewrite those to wiki page names.
index_sed=()
while IFS=$'\t' read -r file wiki; do
  index_sed+=(-e "s#](glossary/${file}#](${wiki}#g")
done < <(jq -r '.categories[] | [.file, .wiki] | @tsv' "$config")

sed "${index_sed[@]}" "$root/docs/glossary.md" > "$tmp/generated/Glossary.md"

# Category documents link back to ../glossary.md; rewrite to the wiki index.
while IFS=$'\t' read -r file wiki; do
  sed 's#](\.\./glossary\.md#](Glossary#g' \
    "$root/docs/glossary/$file" > "$tmp/generated/$wiki.md"
done < <(jq -r '.categories[] | [.file, .wiki] | @tsv' "$config")

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
git add --all
if git diff --cached --quiet; then
  echo "wiki already up to date"
  exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-usagi-bot}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-usagi-bot@users.noreply.github.com}" \
    commit -m "docs: sync glossary index and categories"

git pull --rebase origin HEAD >/dev/null 2>&1 || true
git push origin HEAD

echo "published wiki for $repo"
