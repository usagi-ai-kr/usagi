import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const checkerPath = fileURLToPath(
  new URL("./check-requirement-trace.mjs", import.meta.url),
);
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDocs(files) {
  const dir = mkdtempSync(join(tmpdir(), "trace-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function runChecker(args = []) {
  return spawnSync(process.execPath, [checkerPath, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
}

function runJson(dir, extraArgs = []) {
  const result = runChecker(["--docs", dir, "--json", ...extraArgs]);
  return { result, report: JSON.parse(result.stdout) };
}

const COMPLETE_SRS = `# SRS

- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.

| 요구사항 | 테스트 | 결정 |
| --- | --- | --- |
| REQ-F-001 | tests/auth.test.ts | ADR-001 |
`;

const ADR_DOC = `# ADR-001: 로그인 오류 메시지 표시

결정 기록입니다.
`;

test("light mode with no requirement ids passes with a warning", () => {
  const dir = makeDocs({
    "note.md": "# 메모\n\n요구사항 ID가 없는 문서입니다.\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.equal(report.mode, "light");
  assert.deepEqual(report.requirements, []);
  assert.equal(report.errors.length, 0);
  assert.ok(
    report.warnings.some((warning) => warning.code === "no_requirement_ids"),
  );
});

test("full mode passes when a requirement has a mapping and an ADR reference", () => {
  const dir = makeDocs({
    "srs.md": COMPLETE_SRS,
    "adr/ADR-001.md": ADR_DOC,
  });
  const { result, report } = runJson(dir, ["--mode", "full"]);
  assert.equal(result.status, 0);
  assert.deepEqual(report.errors, []);
  const [requirement] = report.requirements;
  assert.equal(requirement.id, "REQ-F-001");
  assert.equal(requirement.declared, true);
  assert.equal(requirement.mapped, true);
  assert.deepEqual(requirement.adr_refs, ["ADR-001"]);
  assert.ok(requirement.files.includes("srs.md"));
});

test("duplicate requirement declaration exits 1", () => {
  const dir = makeDocs({
    "srs.md": "- REQ-F-001: 첫 번째 선언\n",
    "other.md": "- REQ-F-001: 두 번째 선언\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  const duplicate = report.errors.find(
    (error) => error.code === "duplicate_requirement",
  );
  assert.ok(duplicate);
  assert.equal(duplicate.id, "REQ-F-001");
});

test("full mode fails when a requirement has no mapping row", () => {
  const dir = makeDocs({
    "srs.md": "- REQ-F-001: 매핑 행이 없습니다.\n",
  });
  const { result, report } = runJson(dir, ["--mode", "full"]);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "requirement_without_mapping" && error.id === "REQ-F-001",
    ),
  );
});

test("full mode fails when a requirement has no ADR reference", () => {
  const dir = makeDocs({
    "srs.md": `# SRS

- REQ-F-001: 결정 링크가 없습니다.

| 요구사항 | 테스트 |
| --- | --- |
| REQ-F-001 | tests/auth.test.ts |
`,
  });
  const { result, report } = runJson(dir, ["--mode", "full"]);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "requirement_without_adr" && error.id === "REQ-F-001",
    ),
  );
});

test("unknown requirement and ADR references are reported", () => {
  const dir = makeDocs({
    "note.md":
      "REQ-F-999는 아직 정의되지 않았습니다. ADR-999도 마찬가지입니다.\n",
  });
  const { result, report } = runJson(dir, ["--mode", "full"]);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "unknown_requirement" && error.id === "REQ-F-999",
    ),
  );
  assert.ok(report.errors.some((error) => error.code === "unknown_adr"));

  const light = runJson(dir);
  assert.equal(light.result.status, 1);
  assert.ok(
    light.report.warnings.some((warning) => warning.code === "unknown_adr"),
  );
});

test("light mode fails when a mapping row points to an undeclared requirement", () => {
  const dir = makeDocs({
    "trace.md": `# 추적성

| 요구사항 | 테스트 |
| --- | --- |
| REQ-F-999 | tests/ghost.test.ts |
`,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) =>
        error.code === "mapped_not_declared" && error.id === "REQ-F-999",
    ),
  );
});

test("an ADR declared by a heading is not reported as an unknown ADR", () => {
  const dir = makeDocs({
    "srs.md": COMPLETE_SRS,
    "decisions.md": `# 결정 기록

## ADR-001: 로그인 오류 메시지 표시

결정 내용입니다.
`,
  });
  const { result, report } = runJson(dir, ["--mode", "full"]);
  assert.equal(result.status, 0);
  assert.ok(!report.errors.some((error) => error.code === "unknown_adr"));
  const [requirement] = report.requirements;
  assert.deepEqual(requirement.adr_refs, ["ADR-001"]);
});

test("an unreadable docs root exits 2", (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root bypasses file permissions");
    return;
  }
  const dir = makeDocs({ "srs.md": "- REQ-F-001: 선언\n" });
  const mode = statSync(dir).mode & 0o777;
  try {
    chmodSync(dir, 0o000);
    const result = runChecker(["--docs", dir]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot read directory/);
  } finally {
    chmodSync(dir, mode);
  }
});

test("an unreadable subdirectory exits 2", (t) => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root bypasses file permissions");
    return;
  }
  const dir = makeDocs({
    "srs.md": "- REQ-F-001: 선언\n",
    "locked/inner.md": "- REQ-F-001: 숨겨진 중복 선언\n",
  });
  const locked = join(dir, "locked");
  const mode = statSync(locked).mode & 0o777;
  try {
    chmodSync(locked, 0o000);
    const result = runChecker(["--docs", dir]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot read directory/);
  } finally {
    chmodSync(locked, mode);
  }
});

test("fenced code blocks are excluded from the scan", () => {
  const dir = makeDocs({
    "srs.md": `# SRS

- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.

| 요구사항 | 테스트 | 결정 |
| --- | --- | --- |
| REQ-F-001 | tests/auth.test.ts | ADR-001 |

## 예시

\`\`\`markdown
- REQ-F-002: 코드펜스 안의 예시 선언
| REQ-F-001 | tests/example.test.ts | ADR-002 |
\`\`\`

~~~markdown
- REQ-F-003: 물결표 펜스 안의 예시 선언
~~~
`,
    "adr/ADR-001.md": ADR_DOC,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(
    report.requirements.map((requirement) => requirement.id),
    ["REQ-F-001"],
  );
  const [requirement] = report.requirements;
  assert.deepEqual(requirement.adr_refs, ["ADR-001"]);
});

test("--json reports schema, mode, docs, requirements, errors, warnings and summary", () => {
  const dir = makeDocs({
    "srs.md": COMPLETE_SRS,
    "adr/ADR-001.md": ADR_DOC,
  });
  const { report } = runJson(dir, ["--mode", "full"]);
  assert.equal(report.schema_version, 1);
  assert.equal(report.mode, "full");
  assert.equal(report.docs, dir);
  assert.ok(Array.isArray(report.requirements));
  assert.ok(Array.isArray(report.errors));
  assert.ok(Array.isArray(report.warnings));
  assert.equal(typeof report.summary.requirements, "number");
  assert.equal(typeof report.summary.mapped, "number");
  assert.equal(typeof report.summary.errors, "number");
  assert.equal(typeof report.summary.warnings, "number");
  assert.equal(report.summary.status, "ok");
});

test("missing --docs, invalid mode, unknown option and missing directory exit 2", () => {
  const missing = runChecker([]);
  assert.equal(missing.status, 2);

  const dir = makeDocs({ "note.md": "# 메모\n" });
  const invalidMode = runChecker(["--docs", dir, "--mode", "strict"]);
  assert.equal(invalidMode.status, 2);

  const unknownOption = runChecker(["--docs", dir, "--bogus"]);
  assert.equal(unknownOption.status, 2);

  const missingDirectory = runChecker(["--docs", join(dir, "nope")]);
  assert.equal(missingDirectory.status, 2);
});

test("--help exits 0 and prints usage", () => {
  const help = runChecker(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});

test("scanner skips .git, node_modules and tmp directories", () => {
  const dir = makeDocs({
    "srs.md": "- REQ-F-001: 선언\n",
    ".git/hooks.md": "- REQ-F-002: 숨김\n",
    "node_modules/pkg/readme.md": "- REQ-F-003: 숨김\n",
    "tmp/draft.md": "- REQ-F-004: 숨김\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.requirements.map((requirement) => requirement.id),
    ["REQ-F-001"],
  );
});

// ---------------------------------------------------------------------------
// #59 follow-up: template linkage, speculation markers, ADR superseded links
// ---------------------------------------------------------------------------

const REGISTRY_DOC = `# 문서 템플릿

## 템플릿 레지스트리

| ID | template |
| --- | --- |
| PRD | PRD 템플릿 |
| SRS | SRS 템플릿 |
| ADR | ADR 템플릿 |

## SRS 템플릿

\`\`\`markdown
- REQ-F-001: <검증 가능한 한 문장>

| 요구사항 | 테스트/증거 |
| --- | --- |
| REQ-F-001 | <테스트 이름 또는 수용 증거> |
\`\`\`
`;

const TEMPLATE_SRS = `---
template: SRS
---
# SRS

- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.

| 요구사항 | 테스트 | 결정 |
| --- | --- | --- |
| REQ-F-001 | tests/auth.test.ts | ADR-001 |
`;

test("a template declared in frontmatter is accepted when the registry lists it", () => {
  const dir = makeDocs({
    "document-templates.md": REGISTRY_DOC,
    "srs.md": TEMPLATE_SRS,
    "adr/ADR-001.md": ADR_DOC,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.errors.filter((error) => error.code.startsWith("template")),
    [],
  );
  assert.ok(
    !report.warnings.some(
      (warning) => warning.code === "template_registry_unavailable",
    ),
  );
});

test("an unknown template id is an error", () => {
  const dir = makeDocs({
    "document-templates.md": REGISTRY_DOC,
    "srs.md": "---\ntemplate: NOPE\n---\n# SRS\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  const error = report.errors.find((item) => item.code === "unknown_template");
  assert.ok(error, "unknown_template must be reported");
  assert.equal(error.id, "NOPE");
  assert.equal(error.file, "srs.md");
});

test("a template declaration without a registry warns instead of failing", () => {
  const dir = makeDocs({
    "srs.md": TEMPLATE_SRS,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  const warning = report.warnings.find(
    (item) => item.code === "template_registry_unavailable",
  );
  assert.ok(warning, "template_registry_unavailable must be reported");
  assert.ok(
    !report.errors.some((error) => error.code === "unknown_template"),
  );
});

test("fenced template examples stay examples", () => {
  const dir = makeDocs({
    "document-templates.md": REGISTRY_DOC,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(report.requirements, []);
});

test("speculation markers in a declaration line are an error", () => {
  const dir = makeDocs({
    "srs.md": "- REQ-F-001: 로그인 오류 문구는 TBD\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  const error = report.errors.find(
    (item) => item.code === "speculation_marker",
  );
  assert.ok(error, "speculation_marker must be reported");
  assert.equal(error.id, "REQ-F-001");
  assert.equal(error.file, "srs.md");
  assert.equal(error.line, 1);
  assert.ok(error.message.includes("TBD"));
});

test("speculation markers in ordinary prose are not scanned", () => {
  const dir = makeDocs({
    "note.md": "# 메모\n\n이 문서에는 TODO 목록이 있습니다. FIXME 도 마찬가지입니다.\n",
    "srs.md": "- REQ-F-001: 로그인 실패 시 오류 메시지를 표시한다.\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.errors.filter((error) => error.code === "speculation_marker"),
    [],
  );
});

test("speculation markers inside fenced examples are not scanned", () => {
  const dir = makeDocs({
    "srs.md":
      "# SRS\n\n```markdown\n- REQ-F-001: 오류 문구는 FIXME\n```\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.errors.filter((error) => error.code === "speculation_marker"),
    [],
  );
});

test("a superseded ADR with a matching back-link passes", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\nsuperseded_by: ADR-003\n---\n# ADR-002: 옛 결정\n",
    "adr/ADR-003.md":
      "---\nadr: ADR-003\nsupersedes: [ADR-002]\n---\n# ADR-003: 새 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.errors.filter((error) => error.code.startsWith("adr_supersede")),
    [],
  );
});

test("status superseded without superseded_by is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\n---\n# ADR-002: 옛 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) => error.code === "adr_supersede_missing_link",
    ),
  );
});

test("a superseded_by target that does not exist is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\nsuperseded_by: ADR-009\n---\n# ADR-002: 옛 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) => error.code === "adr_supersede_missing_link",
    ),
  );
});

test("a supersede relation without a back-link is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\nsuperseded_by: ADR-003\n---\n# ADR-002: 옛 결정\n",
    "adr/ADR-003.md": "---\nadr: ADR-003\n---\n# ADR-003: 새 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) => error.code === "adr_supersede_missing_link",
    ),
  );
});

test("a supersede cycle is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\nsuperseded_by: ADR-003\nsupersedes: [ADR-003]\n---\n# ADR-002: 옛 결정\n",
    "adr/ADR-003.md":
      "---\nadr: ADR-003\nstatus: superseded\nsuperseded_by: ADR-002\nsupersedes: [ADR-002]\n---\n# ADR-003: 새 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  const codes = report.errors.map((error) => error.code);
  assert.ok(codes.includes("adr_supersede_cycle"), codes.join(","));
  assert.ok(!codes.includes("adr_supersede_missing_link"), codes.join(","));
});

test("a self-referencing supersede is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nstatus: superseded\nsuperseded_by: ADR-002\n---\n# ADR-002: 옛 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some((error) => error.code === "adr_supersede_self"),
  );
});

test("superseded_by without status superseded is reported", () => {
  const dir = makeDocs({
    "adr/ADR-002.md":
      "---\nadr: ADR-002\nsuperseded_by: ADR-003\n---\n# ADR-002: 옛 결정\n",
    "adr/ADR-003.md":
      "---\nadr: ADR-003\nsupersedes: [ADR-002]\n---\n# ADR-003: 새 결정\n",
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 1);
  assert.ok(
    report.errors.some(
      (error) => error.code === "adr_supersede_inconsistent",
    ),
  );
});

test("a registry file without a registry table is treated as no registry", () => {
  const dir = makeDocs({
    "document-templates.md": "# 문서 템플릿\n\n## PRD 템플릿\n\n```markdown\n# <제품명>\n```\n",
    "srs.md": TEMPLATE_SRS,
  });
  const { result, report } = runJson(dir);
  assert.equal(result.status, 0);
  assert.ok(
    report.warnings.some(
      (warning) => warning.code === "template_registry_unavailable",
    ),
  );
  assert.ok(
    !report.errors.some((error) => error.code === "unknown_template"),
  );
});
