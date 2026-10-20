import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-human-doc.mjs", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "usagi-human-doc-"));

after(() => {
  rmSync(directory, { recursive: true, force: true });
});

function fixture(name, content) {
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function paragraphs(count, length) {
  return Array.from({ length: count }, () => "가".repeat(length)).join("\n\n") + "\n";
}

test("accepts a short document", () => {
  const path = fixture("short.md", "# 제목\n\n짧은 문장입니다.\n");
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /within budgets/);
});

test("warns on a long sentence but exits 0", () => {
  const path = fixture("sentence.md", `${"가".repeat(80)}\n`);
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /sentence 80\/64/);
});

test("warns on a long paragraph and sentence", () => {
  const path = fixture("paragraph.md", `${"가".repeat(300)}\n`);
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /paragraph 300\/256/);
  assert.match(result.stderr, /sentence 300\/64/);
});

test("warns on a long document without paragraph false positives", () => {
  const path = fixture("document.md", paragraphs(20, 60));
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /document 1200\/1024/);
  assert.doesNotMatch(result.stderr, /paragraph/);
  assert.doesNotMatch(result.stderr, /sentence/);
});

test("measures list items separately", () => {
  const path = fixture(
    "list.md",
    Array.from({ length: 5 }, () => `- ${"가".repeat(60)}`).join("\n") + "\n",
  );
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /within budgets/);
  assert.doesNotMatch(result.stderr, /paragraph/);
  assert.doesNotMatch(result.stderr, /sentence/);
});

test("excludes frontmatter, code, links and inline code from length", () => {
  const path = fixture(
    "excluded.md",
    [
      "---",
      `description: ${"가".repeat(2000)}`,
      "---",
      "",
      "# 제목",
      "",
      `[링크](https://example.com/${"a".repeat(2000)})`,
      "",
      "```js",
      `const x = "${"가".repeat(2000)}";`,
      "```",
      "",
      `\`${"가".repeat(2000)}\``,
      "",
      "짧은 문장입니다.",
      "",
    ].join("\n"),
  );
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /within budgets/);
  assert.doesNotMatch(result.stderr, /document/);
});

test("accepts valid proposal metadata", () => {
  const path = fixture(
    "proposal.md",
    ["---", "doc_type: proposal", "audience: maintainers", "evaluation: 2026-Q4", "---", "", "짧은 문장입니다.", ""].join("\n"),
  );
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /within budgets/);
});

test("rejects a proposal without evaluation", () => {
  const path = fixture(
    "proposal-missing.md",
    ["---", "doc_type: proposal", "audience: maintainers", "---", "", "짧은 문장입니다.", ""].join("\n"),
  );
  const result = run([path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evaluation/);
});

test("rejects an unsupported doc_type", () => {
  const path = fixture(
    "type.md",
    ["---", "doc_type: essay", "audience: maintainers", "---", "", "짧은 문장입니다.", ""].join("\n"),
  );
  const result = run([path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported doc_type/);
});

test("requires metadata with --require-metadata", () => {
  const path = fixture("missing.md", "짧은 문장입니다.\n");
  const result = run(["--require-metadata", path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /metadata/);
});

test("exempts reference documents from the document budget", () => {
  const path = fixture(
    "reference.md",
    ["---", "doc_type: reference", "audience: agents", "---", "", paragraphs(20, 60)].join("\n"),
  );
  const result = run([path]);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /document/);
  assert.match(result.stdout, /within budgets/);
});

test("prints JSON with stable fields", () => {
  const path = fixture("json.md", `${"가".repeat(80)}\n`);
  const result = run(["--json", path]);
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.files[0].path, path);
  assert.equal(payload.files[0].warnings.some((warning) => warning.kind === "sentence"), true);
  assert.equal(payload.summary.read_errors, 0);
});

test("returns exit code 2 for a missing file", () => {
  const result = run([join(directory, "does-not-exist.md")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read file/);
});

test("handles multiple files and aggregates warnings", () => {
  const short = fixture("multi-short.md", "짧은 문장입니다.\n");
  const long = fixture("multi-long.md", `${"가".repeat(80)}\n`);
  const result = run([short, long]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 advisory warning/);
});
