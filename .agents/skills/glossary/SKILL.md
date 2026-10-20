---
name: glossary
description: Look up unfamiliar terms in the usagi glossary, or add a new term to the correct category document and regenerate the index. Use when the user asks about terminology in this repository or wants to extend the glossary.
compatibility: Requires Node.js, git, jq, and a repository checkout. Run commands from the repository root.
metadata:
  version: "1.0"
---

# Glossary

## Lookup

1. Open `docs/glossary.md` for the A–Z index.
2. Follow the link to `docs/glossary/<category>.md#<anchor>`.
3. If the term is missing, search the category documents and the source issues/PRs before adding it.

## Add or update a term

1. Pick the category from `docs/glossary/categories.json`.
2. Add the block to `docs/glossary/<category>.md`, keeping anchors alphabetical:

```md
<a id="term-slug"></a>
## term

**한국어 표기**

정의. 이 저장소에서의 쓰임을 포함합니다.

참고: [Issue #N](https://github.com/usagi-ai-kr/usagi/issues/N)
```

3. Regenerate the index:

```bash
node scripts/build-glossary-index.mjs
```

4. Validate:

```bash
node scripts/validate.mjs
```

5. Publish the wiki if you have access:

```bash
./scripts/sync-wiki.sh
```

6. Commit with a `docs:` prefix.

## Rules

- Never edit `docs/glossary.md` by hand; it is generated.
- Never edit wiki pages directly; they are overwritten by `scripts/sync-wiki.sh`.
- Every term needs a Korean gloss, a definition, and a `참고:` source.
- The `<a id>` must match the slugified heading.
- Keep category documents and the index free of agent operating rules; those belong in `AGENTS.md`.
