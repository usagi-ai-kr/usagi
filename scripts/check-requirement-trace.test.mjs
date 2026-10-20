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
