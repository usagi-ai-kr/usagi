#!/usr/bin/env node
/**
 * Dependency-free repository checks.
 *
 * Run: node scripts/validate.mjs
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGlossary, renderIndex } from "./lib/glossary.mjs";

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
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "docs/glossary.md",
  "docs/glossary/categories.json",
  "docs/wiki/Home.md",
  "docs/wiki/_Sidebar.md",
  ".agents/skills/glossary/SKILL.md",
  ".github/labels.json",
  ".github/branch-protection.json",
  ".github/workflows/ci.yml",
  "scripts/build-glossary-index.mjs",
  "scripts/lib/glossary.mjs",
  "scripts/sync-labels.sh",
  "scripts/sync-wiki.sh",
  "scripts/apply-repo-policy.sh",
];

for (const path of requiredFiles) existingFile(path);

for (const path of [
  "scripts/build-glossary-index.mjs",
  "scripts/sync-labels.sh",
  "scripts/sync-wiki.sh",
  "scripts/apply-repo-policy.sh",
]) {
  if (!existsSync(join(root, path))) continue;
  const mode = statSync(join(root, path)).mode;
  if ((mode & 0o111) === 0) fail(`script is not executable: ${path}`);
}

const claudePath = join(root, "CLAUDE.md");
if (existsSync(claudePath)) {
  const claudeStat = lstatSync(claudePath);
  if (!claudeStat.isSymbolicLink()) {
    fail("CLAUDE.md must be a symlink to AGENTS.md");
  } else if (readlinkSync(claudePath) !== "AGENTS.md") {
    fail(`CLAUDE.md must point to AGENTS.md, got ${readlinkSync(claudePath)}`);
  }
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

function checkGlossary() {
  const glossary = loadGlossary(root);
  for (const error of glossary.errors) fail(error);

  if (glossary.errors.length > 0) return glossary.terms.length;

  const path = join(root, "docs/glossary.md");
  if (!existsSync(path)) {
    fail("docs/glossary.md: missing generated index");
    return glossary.terms.length;
  }

  const expected = renderIndex(glossary);
  if (read(path) !== expected) {
    fail(
      "docs/glossary.md: index is out of date; run node scripts/build-glossary-index.mjs",
    );
  }

  return glossary.terms.length;
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

function checkSkill() {
  const path = join(root, ".agents/skills/glossary/SKILL.md");
  if (!existsSync(path)) return;
  const text = read(path);

  if (!text.startsWith("---\n")) {
    fail(".agents/skills/glossary/SKILL.md: missing frontmatter");
  }
  if (!text.includes("\nname: glossary\n")) {
    fail(".agents/skills/glossary/SKILL.md: missing name: glossary");
  }
  if (!text.includes("\ndescription: ")) {
    fail(".agents/skills/glossary/SKILL.md: missing description");
  }
}

const glossaryCount = checkGlossary();
const labelCount = checkLabels();
checkBranchProtection();
checkWorkflow();
checkSkill();

if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `✓ ${markdownFiles.length} markdown files, ${glossaryCount} glossary terms, ${labelCount} labels`,
);
