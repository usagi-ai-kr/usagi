import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const doctorPath = fileURLToPath(new URL("./doctor.mjs", import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTemp(prefix = "doctor-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runDoctor(args = [], options = {}) {
  return spawnSync(process.execPath, [doctorPath, ...args], {
    encoding: "utf8",
    timeout: 30000,
    ...options,
  });
}

function toolByName(report, name) {
  const tool = report.tools.find((entry) => entry.name === name);
  assert.ok(tool, `tools must include an entry for ${name}`);
  return tool;
}

test("--json output parses and carries the v1 contract", () => {
  const result = runDoctor(["--json"]);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_version, 1);
  for (const field of [
    "os",
    "arch",
    "node",
    "cwd",
    "path_has_spaces",
    "path_has_non_ascii",
  ]) {
    assert.ok(field in report.platform, `platform must include ${field}`);
  }
  for (const name of ["node", "git"]) {
    const tool = toolByName(report, name);
    for (const field of ["name", "required", "status", "version"]) {
      assert.ok(field in tool, `tool ${name} must include ${field}`);
    }
  }
  assert.equal(typeof report.completeness, "string");
});

test("default human output exits 0 when required tools are present", () => {
  const result = runDoctor([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^node: ok/m);
  assert.match(result.stdout, /^doctor: /m);
});

test("missing required tool (PATH empty) exits 1 with failed summary", () => {
  const result = runDoctor(["--json"], {
    env: { ...process.env, PATH: "" },
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const git = toolByName(report, "git");
  assert.equal(git.status, "missing");
  assert.equal(git.version, null);
  assert.equal(report.summary.status, "failed");
  assert.equal(report.completeness, "unavailable");
  assert.ok(report.summary.required_missing >= 1);
});

test("path with spaces and Korean sets both path flags", () => {
  const flagged = join(makeTemp(), "공백 있음");
  mkdirSync(flagged, { recursive: true });
  const result = runDoctor(["--json"], { cwd: flagged });
  const report = JSON.parse(result.stdout);
  assert.equal(report.platform.path_has_spaces, true);
  assert.equal(report.platform.path_has_non_ascii, true);
});

test("non-repo cwd reports root null and still exits 0", () => {
  const outside = makeTemp("doctor-outside-");
  const result = runDoctor(["--json"], { cwd: outside });
  const report = JSON.parse(result.stdout);
  assert.equal(report.repo.root, null);
  assert.equal(result.status, 0);
});

test("unknown option exits 2", () => {
  const result = runDoctor(["--bogus"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option|Usage:/);
});

test("--help exits 0 with usage text", () => {
  const result = runDoctor(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
});

test("--json prints only JSON (no human text around it)", () => {
  const result = runDoctor(["--json"]);
  assert.ok(result.stdout.trimStart().startsWith("{"));
  assert.ok(result.stdout.trimEnd().endsWith("}"));
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});
