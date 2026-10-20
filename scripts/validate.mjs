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
  "DESIGN.md",
  "VERSION",
  "CHANGELOG.md",
  "PROMPTS.md",
  "docs/glossary.md",
  "docs/glossary/categories.json",
  "docs/human-writing-contract.md",
  "docs/design-references.md",
  "docs/design-decision-template.md",
  "docs/toolchain-contract.md",
  "docs/architecture-contract.md",
  "docs/architecture-map.example.json",
  "docs/rule-file-guidelines.md",
  "docs/harness-starter/README.md",
  "docs/harness-starter/templates/AGENTS.md",
  "docs/harness-starter/templates/CONTRIBUTING.md",
  "docs/harness-starter/templates/ci.yml",
  "docs/harness-starter/templates/labels.json",
  "docs/harness-starter/templates/branch-protection.json",
  "docs/wiki/Home.md",
  "docs/wiki/_Sidebar.md",
  "docs/wiki/Harness-Starter.md",
  "docs/wiki/What-is-Harness-Engineering.md",
  "docs/wiki/Workflows.md",
  ".agents/skills/glossary/SKILL.md",
  ".agents/skills/human-doc/SKILL.md",
  ".agents/skills/architecture-review/SKILL.md",
  ".agents/skills/design-review/SKILL.md",
  ".github/labels.json",
  ".github/branch-protection.json",
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  "scripts/build-glossary-index.mjs",
  "scripts/check-human-doc.mjs",
  "scripts/check-human-doc.test.mjs",
  "scripts/doctor.mjs",
  "scripts/doctor.test.mjs",
  "scripts/check-layer-deps.mjs",
  "scripts/check-layer-deps.test.mjs",
  "scripts/lib/glossary.mjs",
  "scripts/sync-labels.sh",
  "scripts/sync-wiki.sh",
  "scripts/apply-repo-policy.sh",
];

for (const path of requiredFiles) existingFile(path);

for (const path of [
  "scripts/build-glossary-index.mjs",
  "scripts/check-human-doc.mjs",
  "scripts/doctor.mjs",
  "scripts/check-layer-deps.mjs",
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
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "tmp") continue;
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
  // Template files intentionally contain unresolved placeholder links.
  if (rel.startsWith("docs/harness-starter/templates/")) continue;

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
    "skills-ref@0.1.5",
    "for skill in .agents/skills/*",
    "node --test scripts/check-human-doc.test.mjs",
    "node --test scripts/doctor.test.mjs",
    "node --test scripts/check-layer-deps.test.mjs",
    "node scripts/check-human-doc.mjs --require-metadata docs/human-writing-contract.md",
    "@google/design.md@0.4.0 lint DESIGN.md",
    "permissions:",
    "contents: read",
  ]) {
    if (!text.includes(expected)) {
      fail(`.github/workflows/ci.yml: missing "${expected}"`);
    }
  }
}

function checkSkill() {
  const skillsDirectory = join(root, ".agents/skills");
  if (!existsSync(skillsDirectory)) return;

  for (const entry of readdirSync(skillsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rel = `.agents/skills/${entry.name}/SKILL.md`;
    const path = join(root, rel);
    if (!existsSync(path)) continue;

    const text = read(path);
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) {
      fail(`${rel}: missing YAML frontmatter`);
      continue;
    }

    const field = (name) => {
      const match = frontmatter[1].match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
      return match ? match[1].trim() : "";
    };
    const name = field("name");
    const description = field("description");
    const compatibility = field("compatibility");
    const body = text.slice(frontmatter[0].length);

    if (name !== entry.name) {
      fail(`${rel}: name must be "${entry.name}", got "${name}"`);
    }
    if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      fail(`${rel}: name must be 1-64 lowercase alphanumeric/hyphen characters`);
    }
    if (description.length < 1 || description.length > 1024) {
      fail(`${rel}: description must be 1-1024 characters`);
    }
    if (compatibility && (compatibility.length < 1 || compatibility.length > 500)) {
      fail(`${rel}: compatibility must be 1-500 characters`);
    }
    if (body.trim() === "") {
      fail(`${rel}: empty instructions body`);
    }
    if (body.split(/\r?\n/).length > 500) {
      fail(`${rel}: body should stay under 500 lines`);
    }
  }
}

function checkDesign() {
  const path = join(root, "DESIGN.md");
  if (!existsSync(path)) return;
  const text = read(path);
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!frontmatter) {
    fail("DESIGN.md: missing YAML frontmatter");
  } else {
    for (const key of [
      "name:",
      "colors:",
      "typography:",
      "rounded:",
      "spacing:",
      "components:",
    ]) {
      if (!frontmatter[1].includes(key)) {
        fail(`DESIGN.md: missing frontmatter key "${key}"`);
      }
    }
  }

  const sections = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
  const canonical = [
    "Overview",
    "Colors",
    "Typography",
    "Layout",
    "Elevation & Depth",
    "Shapes",
    "Components",
    "Do's and Don'ts",
  ];

  for (const required of canonical) {
    if (!sections.includes(required)) {
      fail(`DESIGN.md: missing section "## ${required}"`);
    }
  }

  let last = -1;
  for (const section of sections) {
    const index = canonical.indexOf(section);
    if (index === -1) continue;
    if (index < last) {
      fail(`DESIGN.md: section "${section}" is out of canonical order`);
    }
    last = index;
  }
}

function checkReadme() {
  const path = join(root, "README.md");
  if (!existsSync(path)) return;
  const text = read(path);

  for (const expected of [
    "https://github.com/usagi-ai-kr/usagi/wiki",
    "docs/glossary.md",
    "docs/harness-starter/README.md",
    "PROMPTS.md",
    "CHANGELOG.md",
  ]) {
    if (!text.includes(expected)) {
      fail(`README.md: reader entry point must mention "${expected}"`);
    }
  }
  if (text.includes("```text")) {
    fail("README.md: keep copy-paste prompts in CONTRIBUTING.md");
  }
}

function checkContributing() {
  const path = join(root, "CONTRIBUTING.md");
  if (!existsSync(path)) return;
  const text = read(path);

  for (const expected of [
    "```text",
    "https://github.com/usagi-ai-kr/usagi",
    "AGENTS.md",
    "docs/glossary.md",
    "node scripts/validate.mjs",
    "squash merge",
    "type:*",
    "status:*",
    "VERSION",
    "CHANGELOG.md",
    "외부 에이전트",
  ]) {
    if (!text.includes(expected)) {
      fail(`CONTRIBUTING.md: AI contribution guide must mention "${expected}"`);
    }
  }
}

function checkSectionNumbers() {
  for (const rel of ["AGENTS.md", "CONTRIBUTING.md"]) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const numbers = [...read(path).matchAll(/^## (\d+)\./gm)].map((match) => match[1]);
    const seen = new Set();
    for (const number of numbers) {
      if (seen.has(number)) {
        fail(`${rel}: duplicate top-level section number ${number}`);
      }
      seen.add(number);
    }
  }
}

function checkPromptLibrary() {
  const path = join(root, "PROMPTS.md");
  if (!existsSync(path)) return;
  const text = read(path);
  const promptCount = (text.match(/```text/g) ?? []).length;

  if (promptCount > 1) {
    fail(
      `PROMPTS.md: found ${promptCount} prompt blocks; keep it a reference index, not a prompt collection`,
    );
  }
  for (const expected of [
    "https://github.com/usagi-ai-kr/usagi",
    "docs/harness-starter/README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/glossary.md",
    "DESIGN.md",
    "docs/architecture-contract.md",
    "docs/toolchain-contract.md",
    "docs/multi-agent-orchestration-contract.md",
  ]) {
    if (!text.includes(expected)) {
      fail(`PROMPTS.md: must mention "${expected}"`);
    }
  }
}

function checkHarnessStarter() {
  const path = join(root, "docs/harness-starter/README.md");
  if (!existsSync(path)) return;
  const text = read(path);

  for (const expected of [
    "templates/AGENTS.md",
    "templates/CONTRIBUTING.md",
    "templates/labels.json",
    "templates/branch-protection.json",
    "templates/ci.yml",
    "PROMPTS.md",
  ]) {
    if (!text.includes(expected)) {
      fail(`docs/harness-starter/README.md: must mention "${expected}"`);
    }
  }
}

function checkAgentsBudget() {
  const path = join(root, "AGENTS.md");
  if (!existsSync(path)) return;
  const text = read(path);
  const lineCount = text.split(/\r?\n/).length;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  if (lineCount > 100) {
    fail(`AGENTS.md: ${lineCount} lines exceeds the 100-line limit`);
  }
  if (wordCount > 800) {
    fail(`AGENTS.md: ${wordCount} words exceeds the 800-word limit`);
  }
  for (const expected of [
    "CONTRIBUTING.md",
    "docs/glossary.md",
    "DESIGN.md",
    ".agents/skills/glossary/SKILL.md",
    "docs/human-writing-contract.md",
    ".agents/skills/human-doc/SKILL.md",
    "docs/rule-file-guidelines.md",
    "docs/harness-starter/README.md",
    "PROMPTS.md",
  ]) {
    if (!text.includes(expected)) {
      fail(`AGENTS.md: navigation file must link "${expected}"`);
    }
  }
}

function checkVersion() {
  const versionPath = join(root, "VERSION");
  const changelogPath = join(root, "CHANGELOG.md");
  if (!existsSync(versionPath) || !existsSync(changelogPath)) return;

  const version = read(versionPath).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`VERSION: expected SemVer major.minor.patch, got "${version}"`);
    return;
  }

  const changelog = read(changelogPath);
  if (!changelog.includes("## [Unreleased]")) {
    fail("CHANGELOG.md: missing [Unreleased] section");
  }
  if (!changelog.includes(`## [${version}]`)) {
    fail(`CHANGELOG.md: missing section for VERSION ${version}`);
  }
}

function checkReleaseWorkflow() {
  const path = join(root, ".github/workflows/release.yml");
  if (!existsSync(path)) return;
  const text = read(path);

  for (const expected of [
    "tags:",
    "contents: write",
    "gh release create",
    "CHANGELOG.md",
    "actions/checkout@v7",
  ]) {
    if (!text.includes(expected)) {
      fail(`.github/workflows/release.yml: missing "${expected}"`);
    }
  }
}

const glossaryCount = checkGlossary();
const labelCount = checkLabels();
checkBranchProtection();
checkWorkflow();
checkReleaseWorkflow();
checkSkill();
checkDesign();
checkReadme();
checkContributing();
checkSectionNumbers();
checkPromptLibrary();
checkHarnessStarter();
checkAgentsBudget();
checkVersion();

if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `✓ ${markdownFiles.length} markdown files, ${glossaryCount} glossary terms, ${labelCount} labels`,
);
