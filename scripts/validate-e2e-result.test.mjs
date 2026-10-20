import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const validatorPath = fileURLToPath(new URL("./validate-e2e-result.mjs", import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const resultDir = makeTemp("e2e-result-");
const artifactRoot = makeTemp("e2e-artifacts-");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function baseResult() {
  return {
    schema_version: 1,
    run_id: "run-2026-10-20-001",
    target: {
      url: "https://example.test/",
      commit_sha: "a".repeat(40),
      start_command: "npm run start",
    },
    environment: {
      os: "darwin",
      arch: "arm64",
      browser: "chromium",
      browser_version: "141.0.0.0",
      viewport: { width: 1280, height: 720 },
      dpr: 1,
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      theme: "light",
      font_ready: true,
    },
    scenario: { id: "login", kind: "behavior" },
    budgets: { wall_time_ms: 60000, peak_rss_mb: 512, max_processes: 8 },
    result: {
      status: "passed",
      exit_code: 0,
      assertions: [{ id: "login succeeds", status: "passed" }],
    },
    artifacts: [],
    evidence: { console_errors: 0, network_failures: 0 },
    masking: { applied: true, fields: ["email", "token"] },
    started_at: "2026-10-20T00:00:00.000Z",
    duration_ms: 1234,
    completeness: "complete",
  };
}

function writeResult(name, result) {
  const path = join(resultDir, name);
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

function makeArtifact(relativePath, content, type = "screenshot") {
  const absolute = join(artifactRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return { type, path: relativePath, sha256: sha256(content), size_bytes: Buffer.byteLength(content) };
}

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorPath, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
}

test("valid behavior-only result without artifact root exits 0 with an unverified-artifacts warning", () => {
  const result = baseResult();
  result.artifacts = [
    { type: "log", path: "artifacts/run.log", sha256: sha256("run log"), size_bytes: 7 },
  ];
  const file = writeResult("behavior-valid.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /warning artifacts_unverified/);
  assert.match(run.stdout, /summary: valid/);
});

test("valid visual result with a verified screenshot exits 0 without warnings", () => {
  const content = "png-bytes";
  const result = baseResult();
  result.scenario.kind = "visual";
  result.artifacts = [makeArtifact("artifacts/login.png", content)];
  const file = writeResult("visual-valid.json", result);
  const run = runValidator(["--result", file, "--artifact-root", artifactRoot]);
  assert.equal(run.status, 0);
  assert.doesNotMatch(run.stdout, /^warning /m);
  assert.match(run.stdout, /summary: valid/);
});

test("commit SHA mismatch with --expected-sha exits 1 with sha_mismatch", () => {
  const file = writeResult("sha-mismatch.json", baseResult());
  const run = runValidator(["--result", file, "--expected-sha", "b".repeat(40)]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error sha_mismatch at target\.commit_sha/);
});

test("expected viewport and DPR mismatches exit 1", () => {
  const file = writeResult("viewport-dpr-mismatch.json", baseResult());
  const run = runValidator([
    "--result",
    file,
    "--expected-viewport",
    "800x600",
    "--expected-dpr",
    "2",
  ]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error viewport_mismatch at environment\.viewport/);
  assert.match(run.stdout, /error dpr_mismatch at environment\.dpr/);
});

test("artifact path containing .. exits 1 with artifact_path_escape", () => {
  const result = baseResult();
  result.artifacts = [
    { type: "log", path: "artifacts/../secret.log", sha256: sha256("secret"), size_bytes: 6 },
  ];
  const file = writeResult("path-escape.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_path_escape/);
});

test("missing artifact file under --artifact-root exits 1 with artifact_missing", () => {
  const result = baseResult();
  result.scenario.kind = "visual";
  result.artifacts = [
    { type: "screenshot", path: "artifacts/missing.png", sha256: sha256("missing"), size_bytes: 7 },
  ];
  const file = writeResult("artifact-missing.json", result);
  const run = runValidator(["--result", file, "--artifact-root", artifactRoot]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_missing at artifacts\[0\]\.path/);
});

test("artifact SHA-256 mismatch exits 1 with artifact_hash_mismatch", () => {
  const content = "AAAA";
  const result = baseResult();
  result.scenario.kind = "visual";
  result.artifacts = [
    {
      type: "screenshot",
      path: "artifacts/wrong-hash.png",
      sha256: sha256("BBBB"),
      size_bytes: Buffer.byteLength(content),
    },
  ];
  makeArtifact("artifacts/wrong-hash.png", content);
  const file = writeResult("artifact-hash.json", result);
  const run = runValidator(["--result", file, "--artifact-root", artifactRoot]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_hash_mismatch/);
});

test("passed run with a non-zero exit_code exits 1", () => {
  const result = baseResult();
  result.result.exit_code = 1;
  const file = writeResult("passed-nonzero.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error passed_exit_code_mismatch at result\.exit_code/);
});

test("passed run with a failed assertion exits 1", () => {
  const result = baseResult();
  result.result.assertions.push({ id: "cart shows items", status: "failed", message: "empty cart" });
  const file = writeResult("passed-failed-assertion.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error passed_failed_assertion/);
});

test("visual passed with font_ready false exits 1 with font_not_ready", () => {
  const result = baseResult();
  result.scenario.kind = "visual";
  result.environment.font_ready = false;
  result.artifacts = [
    { type: "screenshot", path: "artifacts/late-fonts.png", sha256: sha256("shot"), size_bytes: 4 },
  ];
  const file = writeResult("visual-font.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error font_not_ready at environment\.font_ready/);
});

test("visual passed without a screenshot artifact exits 1 with missing_screenshot", () => {
  const result = baseResult();
  result.scenario.kind = "visual";
  result.artifacts = [
    { type: "log", path: "artifacts/run.log", sha256: sha256("run log"), size_bytes: 7 },
  ];
  const file = writeResult("visual-no-screenshot.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error missing_screenshot at artifacts/);
});

test("passed run over budgets.wall_time_ms exits 1 with budget_exceeded", () => {
  const result = baseResult();
  result.duration_ms = 61000;
  const file = writeResult("budget-exceeded.json", result);
  const run = runValidator(["--result", file]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error budget_exceeded at duration_ms/);
});

test("invalid JSON, missing --result and unknown options exit 2", () => {
  const invalidFile = join(resultDir, "invalid.json");
  writeFileSync(invalidFile, "{ not json");
  assert.equal(runValidator(["--result", invalidFile]).status, 2);
  assert.equal(runValidator([]).status, 2);
  assert.equal(runValidator(["--result", join(resultDir, "behavior-valid.json"), "--bogus"]).status, 2);
  assert.equal(runValidator(["--result", join(resultDir, "behavior-valid.json"), "--expected-dpr", "abc"]).status, 2);
});

test("--json output parses and carries stable fields", () => {
  const missingRun = runValidator(["--result", join(resultDir, "does-not-exist.json"), "--json"]);
  assert.equal(missingRun.status, 2, "read errors in --json mode exit 2");
  const missingReport = JSON.parse(missingRun.stdout);
  assert.equal(missingReport.schema_version, 1);
  assert.equal(missingReport.valid, false);

  const file = writeResult("json-report.json", baseResult());
  const valid = runValidator(["--result", file, "--json"]);
  assert.equal(valid.status, 0);
  const report = JSON.parse(valid.stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.valid, true);
  assert.equal(report.result, file);
  assert.deepEqual(report.errors, []);
  assert.equal(Array.isArray(report.warnings), true);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, report.warnings.length);

  const failing = baseResult();
  failing.result.exit_code = 3;
  const failingFile = writeResult("json-invalid.json", failing);
  const invalid = runValidator(["--result", failingFile, "--json"]);
  assert.equal(invalid.status, 1);
  const invalidReport = JSON.parse(invalid.stdout);
  assert.equal(invalidReport.valid, false);
  assert.ok(invalidReport.errors.length >= 1);
  for (const error of invalidReport.errors) {
    assert.equal(typeof error.code, "string");
    assert.equal(typeof error.path, "string");
    assert.equal(typeof error.message, "string");
  }
  assert.equal(invalidReport.summary.errors, invalidReport.errors.length);
  assert.equal(invalidReport.summary.warnings, invalidReport.warnings.length);
});
