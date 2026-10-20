#!/usr/bin/env node
/**
 * Dependency-free repository checks.
 *
 * Run: node scripts/validate.mjs
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function existingFile(relPath) {
  const path = join(root, relPath);
  if (!existsSync(path)) {
    fail(`missing required file: ${relPath}`);
    return false;
  }
  return true;
}

const requiredFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/glossary.md",
  "docs/wiki/Home.md",
  "docs/wiki/_Sidebar.md",
  ".github/labels.json",
  ".github/branch-protection.json",
  ".github/workflows/ci.yml",
  "scripts/sync-labels.sh",
  "scripts/sync-wiki.sh",
  "scripts/apply-repo-policy.sh",
];

for (const path of requiredFiles) existingFile(path);

for (const path of [
  "scripts/sync-labels.sh",
  "scripts/sync-wiki.sh",
  "scripts/apply-repo-policy.sh",
]) {
  if (!existsSync(join(root, path))) continue;
  const mode = statSync(join(root, path)).mode;
  if ((mode & 0o111) === 0) fail(`script is not executable: ${path}`);
}

function walkMarkdown(dir, output = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(path, output);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      output.push(path);
    }
  }
  return output;
}

const markdownFiles = walkMarkdown(root);
const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

for (const file of markdownFiles) {
  const rel = relative(root, file);
  const text = read(file)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (
      target === "" ||
      target.startsWith("#") ||
      /^(?:https?:|mailto:|tel:)/i.test(target)
    ) {
      continue;
    }

    const withoutAnchor = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (withoutAnchor === "") continue;

    // GitHub wiki links are extensionless and resolve inside the wiki repo.
    if (rel.startsWith("docs/wiki/") && extname(withoutAnchor) === "") {
      continue;
    }

    const resolved = withoutAnchor.startsWith("/")
      ? join(root, withoutAnchor)
      : resolve(dirname(file), withoutAnchor);

    if (!existsSync(resolved)) {
      fail(`${rel}: broken relative link -> ${target}`);
    }
  }
}

function normalizeTerm(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function checkGlossary() {
  const path = join(root, "docs/glossary.md");
  if (!existsSync(path)) return;

  const allowedCategories = new Set([
    "오케스트레이션",
    "신뢰성",
    "Git·CI",
    "테스트·품질",
    "문서·운영",
  ]);
  const lines = read(path).split(/\r?\n/);
  const rows = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    if (!inTable) {
      if (
        trimmed.includes("용어") &&
        trimmed.includes("분류") &&
        trimmed.includes("뜻")
      ) {
        inTable = true;
      }
      continue;
    }
    if (/^\|\s*:?-{3,}/.test(trimmed)) continue;

    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length !== 4) {
      fail(`docs/glossary.md: expected 4 columns, got ${cells.length}: ${trimmed}`);
      continue;
    }

    const [termCell, category, definition, reference] = cells;
    const termMatch = termCell.match(/^\*\*(.+?)\*\*(?:\s*\(([^)]*)\))?$/);
    if (!termMatch) {
      fail(`docs/glossary.md: term must be bold: ${termCell}`);
      continue;
    }

    const english = termMatch[1].trim();
    const korean = termMatch[2]?.trim() ?? "";
    const key = normalizeTerm(english);

    if (key === "") fail(`docs/glossary.md: empty term: ${termCell}`);
    if (!allowedCategories.has(category)) {
      fail(`docs/glossary.md: unknown category "${category}" for ${english}`);
    }
    if (definition === "") fail(`docs/glossary.md: empty definition for ${english}`);
    if (reference === "") fail(`docs/glossary.md: empty reference for ${english}`);

    rows.push({ key, english, korean });
  }

  if (rows.length < 30) {
    fail(`docs/glossary.md: expected at least 30 terms, got ${rows.length}`);
  }

  const seen = new Map();
  for (const row of rows) {
    if (seen.has(row.key)) {
      fail(`docs/glossary.md: duplicate term: ${row.english} (${seen.get(row.key)})`);
    }
    seen.set(row.key, row.english);
  }

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].key >= rows[index].key) {
      fail(
        `docs/glossary.md: not alphabetical: "${rows[index - 1].english}" must come after "${rows[index].english}"`,
      );
    }
  }

  return rows.length;
}

function checkLabels() {
  const path = join(root, ".github/labels.json");
  if (!existsSync(path)) return 0;

  let data;
  try {
    data = JSON.parse(read(path));
  } catch (error) {
    fail(`.github/labels.json: invalid JSON: ${error.message}`);
    return 0;
  }

  if (!data.dimensions || typeof data.dimensions !== "object") {
    fail(".github/labels.json: missing dimensions object");
    return 0;
  }
  if (!Array.isArray(data.labels)) {
    fail(".github/labels.json: missing labels array");
    return 0;
  }

  const dimensions = data.dimensions;
  const prefixes = Object.keys(dimensions);
  for (const required of ["type", "status"]) {
    if (!prefixes.includes(required)) {
      fail(`.github/labels.json: missing dimension "${required}"`);
    }
  }

  const labelsByName = new Map();
  for (const label of data.labels) {
    if (
      !label ||
      typeof label.name !== "string" ||
      typeof label.color !== "string" ||
      typeof label.description !== "string"
    ) {
      fail(".github/labels.json: every label needs name, color and description");
      continue;
    }
    if (labelsByName.has(label.name)) {
      fail(`.github/labels.json: duplicate label name: ${label.name}`);
    }
    labelsByName.set(label.name, label);

    if (!/^[0-9a-f]{6}$/i.test(label.color)) {
      fail(`.github/labels.json: invalid color for ${label.name}: ${label.color}`);
    }
    if (label.description.trim() === "" || label.description.length > 100) {
      fail(`.github/labels.json: description must be 1-100 chars for ${label.name}`);
    }

    const colon = label.name.indexOf(":");
    if (colon <= 0) {
      fail(`.github/labels.json: label must be prefixed with a dimension: ${label.name}`);
      continue;
    }
    const prefix = label.name.slice(0, colon);
    if (!prefixes.includes(prefix)) {
      fail(`.github/labels.json: unknown dimension in label: ${label.name}`);
    }
  }

  const expected = [];
  for (const [dimension, names] of Object.entries(dimensions)) {
    if (!Array.isArray(names) || names.length < 2) {
      fail(`.github/labels.json: dimension "${dimension}" needs at least two values`);
      continue;
    }
    if (new Set(names).size !== names.length) {
      fail(`.github/labels.json: duplicate value in dimension "${dimension}"`);
    }
    for (const name of names) {
      if (typeof name !== "string" || !name.startsWith(`${dimension}:`)) {
        fail(`.github/labels.json: "${name}" does not belong to "${dimension}"`);
        continue;
      }
      if (!labelsByName.has(name)) {
        fail(`.github/labels.json: dimension value missing label definition: ${name}`);
      }
      expected.push(name);
    }
  }

  const actual = [...labelsByName.keys()];
  const expectedSorted = [...expected].sort();
  const actualSorted = [...actual].sort();
  if (JSON.stringify(expectedSorted) !== JSON.stringify(actualSorted)) {
    fail(
      `.github/labels.json: labels and dimensions differ (expected ${expectedSorted.length}, got ${actualSorted.length})`,
    );
  }

  return actual.length;
}

function checkBranchProtection() {
  const path = join(root, ".github/branch-protection.json");
  if (!existsSync(path)) return;

  let data;
  try {
    data = JSON.parse(read(path));
  } catch (error) {
    fail(`.github/branch-protection.json: invalid JSON: ${error.message}`);
    return;
  }

  if (data.required_status_checks?.strict !== true) {
    fail(".github/branch-protection.json: required_status_checks.strict must be true");
  }
  const contexts = data.required_status_checks?.contexts;
  if (!Array.isArray(contexts) || !contexts.includes("validate")) {
    fail(".github/branch-protection.json: required check must include \"validate\"");
  }
  if (data.enforce_admins !== true) {
    fail(".github/branch-protection.json: enforce_admins must be true");
  }
  if (data.required_linear_history !== true) {
    fail(".github/branch-protection.json: required_linear_history must be true");
  }
  if (data.required_conversation_resolution !== true) {
    fail(".github/branch-protection.json: required_conversation_resolution must be true");
  }
  if (data.allow_force_pushes !== false) {
    fail(".github/branch-protection.json: force pushes must be disabled");
  }
  if (data.allow_deletions !== false) {
    fail(".github/branch-protection.json: branch deletion must be disabled");
  }
}

function checkWorkflow() {
  const path = join(root, ".github/workflows/ci.yml");
  if (!existsSync(path)) return;
  const text = read(path);

  for (const expected of [
    "pull_request:",
    "push:",
    "name: validate",
    "node scripts/validate.mjs",
    "permissions:",
    "contents: read",
  ]) {
    if (!text.includes(expected)) {
      fail(`.github/workflows/ci.yml: missing "${expected}"`);
    }
  }
}

const glossaryCount = checkGlossary();
const labelCount = checkLabels();
checkBranchProtection();
checkWorkflow();

if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `✓ ${markdownFiles.length} markdown files, ${glossaryCount} glossary terms, ${labelCount} labels`,
);
