import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

function parseCategoryDoc(text, relPath, category, errors) {
  const lines = text.split(/\r?\n/);
  const terms = [];
  let index = 0;

  while (index < lines.length) {
    const anchorMatch = lines[index].trim().match(/^<a id="([^"]+)"><\/a>$/);
    if (!anchorMatch) {
      index += 1;
      continue;
    }

    const anchor = anchorMatch[1];
    index += 1;
    while (index < lines.length && lines[index].trim() === "") index += 1;

    if (index >= lines.length || !lines[index].startsWith("## ")) {
      errors.push(`${relPath}: anchor "${anchor}" must be followed by a "## term" heading`);
      continue;
    }

    const title = lines[index].slice(3).trim();
    index += 1;

    const body = [];
    while (
      index < lines.length &&
      !/^<a id="[^"]+"><\/a>$/.test(lines[index].trim())
    ) {
      body.push(lines[index]);
      index += 1;
    }

    const expectedAnchor = slugify(title);
    if (anchor !== expectedAnchor) {
      errors.push(
        `${relPath}: anchor "${anchor}" does not match "${title}" (expected "${expectedAnchor}")`,
      );
    }

    const trimmed = trimBlank(body);
    let korean = "";
    let rest = trimmed;
    if (trimmed.length > 0 && /^\*\*.+\*\*$/.test(trimmed[0].trim())) {
      korean = trimmed[0].trim().slice(2, -2).trim();
      rest = trimmed.slice(1);
    }

    const referenceIndex = rest.findIndex((line) =>
      /^(?:참고|Source):\s*/.test(line.trim()),
    );
    if (referenceIndex === -1) {
      errors.push(`${relPath}: missing "참고:" line for "${title}"`);
      continue;
    }

    const reference = rest[referenceIndex]
      .trim()
      .replace(/^(?:참고|Source):\s*/, "");
    const definition = trimBlank(rest.slice(0, referenceIndex)).join("\n").trim();

    if (korean === "") errors.push(`${relPath}: missing Korean gloss for "${title}"`);
    if (definition === "") errors.push(`${relPath}: empty definition for "${title}"`);
    if (reference === "") errors.push(`${relPath}: empty reference for "${title}"`);

    terms.push({
      key: anchor,
      title,
      korean,
      definition,
      reference,
      category,
      file: category.file,
    });
  }

  return terms;
}

export function loadGlossary(root) {
  const errors = [];
  const configPath = join(root, "docs/glossary/categories.json");
  let config;

  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    errors.push(`docs/glossary/categories.json: ${error.message}`);
    return { categories: [], terms: [], errors };
  }

  if (!Array.isArray(config.categories) || config.categories.length === 0) {
    errors.push("docs/glossary/categories.json: categories must be a non-empty array");
    return { categories: [], terms: [], errors };
  }

  const categories = [];
  const seenIds = new Set();
  const seenFiles = new Set();
  const seenWikis = new Set();

  for (const [index, category] of config.categories.entries()) {
    const label = `docs/glossary/categories.json: categories[${index}]`;
    for (const field of ["id", "file", "title", "korean", "wiki", "description"]) {
      if (typeof category?.[field] !== "string" || category[field].trim() === "") {
        errors.push(`${label}: missing string field "${field}"`);
      }
    }
    if (typeof category?.id !== "string") continue;
    if (seenIds.has(category.id)) errors.push(`${label}: duplicate id "${category.id}"`);
    seenIds.add(category.id);
    if (typeof category.file === "string") {
      if (seenFiles.has(category.file)) {
        errors.push(`${label}: duplicate file "${category.file}"`);
      }
      seenFiles.add(category.file);
      if (category.file.includes("/") || category.file.includes("\\")) {
        errors.push(`${label}: file must be a basename, got "${category.file}"`);
      }
    }
    if (typeof category.wiki === "string") {
      if (seenWikis.has(category.wiki)) {
        errors.push(`${label}: duplicate wiki page "${category.wiki}"`);
      }
      seenWikis.add(category.wiki);
    }
    categories.push({ ...category, terms: [] });
  }

  if (existsSync(join(root, "docs/glossary"))) {
    for (const file of readdirSync(join(root, "docs/glossary"))) {
      if (file.endsWith(".md") && !seenFiles.has(file)) {
        errors.push(`docs/glossary/${file}: not listed in categories.json`);
      }
    }
  }

  const allTerms = [];
  const seenKeys = new Map();

  for (const category of categories) {
    if (typeof category.file !== "string") continue;
    const path = join(root, "docs/glossary", category.file);
    if (!existsSync(path)) {
      errors.push(`missing category document: docs/glossary/${category.file}`);
      continue;
    }

    const parsed = parseCategoryDoc(
      readFileSync(path, "utf8"),
      `docs/glossary/${category.file}`,
      category,
      errors,
    );

    for (let i = 1; i < parsed.length; i += 1) {
      if (parsed[i - 1].key >= parsed[i].key) {
        errors.push(
          `docs/glossary/${category.file}: not alphabetical: "${parsed[i - 1].title}" must come after "${parsed[i].title}"`,
        );
      }
    }

    if (parsed.length === 0) {
      errors.push(`docs/glossary/${category.file}: no terms found`);
    }

    for (const term of parsed) {
      if (seenKeys.has(term.key)) {
        errors.push(
          `duplicate term anchor "${term.key}" in docs/glossary/${category.file} and ${seenKeys.get(term.key)}`,
        );
      } else {
        seenKeys.set(term.key, `docs/glossary/${category.file}`);
      }
      category.terms.push(term);
      allTerms.push(term);
    }
  }

  const terms = allTerms.sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  return { categories, terms, errors };
}

export function renderIndex(glossary) {
  const { categories, terms } = glossary;
  const lines = [];

  lines.push("# Glossary Index (용어 인덱스)");
  lines.push("");
  lines.push(
    "이 문서는 용어집의 **인덱스**입니다. 정의는 카테고리별 문서에 있고, 이 페이지는 전체 용어를 알파벳순으로 나열합니다.",
  );
  lines.push("");
  lines.push(
    "- 저장소 원본: [docs/glossary/](https://github.com/usagi-ai-kr/usagi/tree/main/docs/glossary)",
  );
  lines.push(
    "- 위키 게시본: [Glossary](https://github.com/usagi-ai-kr/usagi/wiki/Glossary)",
  );
  lines.push(
    "- 사람이 읽는 안내: [하네스 엔지니어링이란?](https://github.com/usagi-ai-kr/usagi/wiki/What-is-Harness-Engineering) · [운영 플로우](https://github.com/usagi-ai-kr/usagi/wiki/Workflows)",
  );
  lines.push("");
  lines.push("## 카테고리");
  lines.push("");
  lines.push("| 카테고리 | 문서 | 용어 수 |");
  lines.push("| --- | --- | --- |");
  for (const category of categories) {
    lines.push(
      `| ${category.korean} | [${category.title}](glossary/${category.file}) | ${category.terms.length} |`,
    );
  }
  lines.push("");
  for (const category of categories) {
    lines.push(`- **${category.korean}** — ${category.description}`);
  }
  lines.push("");
  lines.push("## 전체 용어 A–Z");
  lines.push("");

  let currentLetter = "";
  for (const term of terms) {
    const letter = /^[a-z]/.test(term.key)
      ? term.key[0].toUpperCase()
      : "#";
    if (letter !== currentLetter) {
      if (currentLetter !== "") lines.push("");
      lines.push(`### ${letter}`);
      lines.push("");
      currentLetter = letter;
    }
    const category = categories.find((item) => item.korean === term.category.korean);
    lines.push(
      `- [${term.title}](glossary/${category.file}#${term.key}) — ${category.korean}`,
    );
  }

  lines.push("");
  lines.push("## 용어 추가하기");
  lines.push("");
  lines.push(
    "1. `docs/glossary/`의 해당 카테고리 문서에 `<a id=\"term\"></a>` + `## term` 형식으로 추가합니다.",
  );
  lines.push(
    "2. `node scripts/build-glossary-index.mjs`로 이 인덱스를 다시 생성합니다.",
  );
  lines.push(
    "3. `node scripts/validate.mjs`와 `./scripts/sync-wiki.sh`를 실행합니다.",
  );
  lines.push("");
  lines.push(
    "이 파일은 `scripts/build-glossary-index.mjs`가 생성합니다. 직접 편집하지 마세요.",
  );
  lines.push("");

  return lines.join("\n");
}
