import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runnerPath = fileURLToPath(new URL("./run-test-gates.mjs", import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), "gates-"));
  tempDirs.push(dir);
  return dir;
}

function writeConfig(dir, gates, extra = {}, name = "config.json") {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify({ schema_version: 1, gates, ...extra }, null, 2));
  return path;
}

function gate(overrides = {}) {
  return {
    id: "unit",
    level: "unit",
    command: ["node", "-e", "process.exit(0)"],
    required: true,
    timeout_ms: 60000,
    when: "always",
    ...overrides,
  };
}

function runRunner(args = [], options = {}) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    encoding: "utf8",
    timeout: 60000,
    ...options,
  });
}

function runJson(args = [], options = {}) {
  const result = runRunner(args, options);
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  return { result, report };
}

test("a passing gate exits 0 and records the evidence fields", () => {
  const dir = makeTemp("gates-pass-");
  const evidence = join(dir, "evidence");
  const config = writeConfig(dir, [gate()]);
  const { result, report } = runJson([
    "--config",
    config,
    "--evidence-dir",
    evidence,
    "--json",
  ]);
  assert.equal(result.status, 0);
  assert.equal(report.status, "complete");
  assert.equal(report.schema_version, 1);
  assert.equal(report.gates.length, 1);
  assert.equal(report.gates[0].status, "pass");
  assert.equal(report.gates[0].exit_code, 0);
  assert.equal(report.summary.status, "ok");
  assert.equal(report.summary.passed, 1);
  assert.match(report.source_commit, /^[0-9a-f]{40}$/);
  assert.match(report.staged_tree_sha, /^[0-9a-f]{40}$/);
  assert.equal(
    report.config_sha256,
    createHash("sha256")
      .update(readFileSync(config, "utf8"))
      .digest("hex"),
  );
  assert.ok(report.gates[0].stdout_ref.endsWith(".stdout.log"));
  assert.ok(readFileSync(report.gates[0].stdout_ref, "utf8").length >= 0);
  assert.ok(report.environment.os.length > 0);
});

test("a failing required gate exits 1 and is recorded as fail", () => {
  const dir = makeTemp("gates-fail-");
  const config = writeConfig(dir, [
    gate({ command: ["node", "-e", "process.exit(3)"] }),
  ]);
  const { result, report } = runJson(["--config", config, "--json"]);
  assert.equal(result.status, 1);
  assert.equal(report.gates[0].status, "fail");
  assert.equal(report.gates[0].exit_code, 3);
  assert.equal(report.summary.status, "failed");
  assert.equal(report.summary.required_failed, 1);
});

test("an optional failing gate is counted but does not fail the run", () => {
  const dir = makeTemp("gates-optional-");
  const config = writeConfig(dir, [
    gate({ id: "unit", command: ["node", "-e", "process.exit(0)"] }),
    gate({
      id: "flaky",
      level: "regression",
      required: false,
      command: ["node", "-e", "process.exit(1)"],
    }),
  ]);
  const { result, report } = runJson(["--config", config, "--json"]);
  assert.equal(result.status, 0);
  assert.equal(report.summary.optional_failed, 1);
  assert.equal(report.summary.required_failed, 0);
  assert.equal(report.gates[1].status, "fail");
});

test("Red to Green: a failing gate stays failed and a later passing gate is recorded", () => {
  const dir = makeTemp("gates-redgreen-");
  const evidence = join(dir, "evidence");
  const failing = writeConfig(dir, [
    gate({ id: "red", command: ["node", "-e", "process.exit(1)"] }),
  ], {}, "red.json");
  const passing = writeConfig(dir, [
    gate({ id: "green", command: ["node", "-e", "process.exit(0)"] }),
  ], {}, "green.json");

  const red = runJson([
    "--config",
    failing,
    "--evidence-dir",
    evidence,
    "--json",
  ]);
  assert.equal(red.result.status, 1);
  assert.equal(red.report.gates[0].status, "fail");

  const green = runJson([
    "--config",
    passing,
    "--evidence-dir",
    evidence,
    "--json",
  ]);
  assert.equal(green.result.status, 0);
  assert.equal(green.report.gates[0].status, "pass");
  assert.notEqual(red.report.run_id, green.report.run_id);
  assert.ok(readFileSync(red.report.gates[0].stdout_ref, "utf8") !== undefined);
  assert.equal(red.report.gates[0].status, "fail");
});

test("--only runs the selected gate and skips the rest with a reason", () => {
  const dir = makeTemp("gates-only-");
  const config = writeConfig(dir, [
    gate({ id: "unit" }),
    gate({ id: "regression", level: "regression", required: false }),
  ]);
  const { result, report } = runJson([
    "--config",
    config,
    "--only",
    "unit",
    "--json",
  ]);
  assert.equal(result.status, 0);
  const byId = Object.fromEntries(report.gates.map((item) => [item.id, item]));
  assert.equal(byId.unit.status, "pass");
  assert.equal(byId.regression.status, "skipped");
  assert.match(byId.regression.reason, /not selected/);
});

test("when skip and env conditions produce distinct statuses", () => {
  const dir = makeTemp("gates-when-");
  const config = writeConfig(dir, [
    gate({ id: "skipped", when: "skip", reason: "적용 대상 없음" }),
    gate({ id: "conditional", level: "slice", when: "env:GATES_OPTIONAL" }),
  ]);
  const { result, report } = runJson(["--config", config, "--json"], {
    env: { ...process.env, GATES_OPTIONAL: undefined },
  });
  assert.equal(result.status, 0);
  const byId = Object.fromEntries(report.gates.map((item) => [item.id, item]));
  assert.equal(byId.skipped.status, "skipped");
  assert.equal(byId.skipped.reason, "적용 대상 없음");
  assert.equal(byId.conditional.status, "not_applicable");

  const withEnv = runJson(["--config", config, "--json"], {
    env: { ...process.env, GATES_OPTIONAL: "1" },
  });
  const byId2 = Object.fromEntries(
    withEnv.report.gates.map((item) => [item.id, item]),
  );
  assert.equal(byId2.conditional.status, "pass");
});

test("a gate that runs too long is reported as timeout", () => {
  const dir = makeTemp("gates-timeout-");
  const config = writeConfig(dir, [
    gate({ command: ["node", "-e", "setTimeout(() => {}, 30000)"], timeout_ms: 300 }),
  ]);
  const { result, report } = runJson(["--config", config, "--json"]);
  assert.equal(result.status, 1);
  assert.equal(report.gates[0].status, "timeout");
  assert.equal(report.summary.status, "failed");
});

test("malformed configs exit 2", () => {
  const dir = makeTemp("gates-bad-");
  const cases = [
    ["not json", "{ not json"],
    ["schema version", JSON.stringify({ schema_version: 2, gates: [] })],
    ["no gates", JSON.stringify({ schema_version: 1, gates: [] })],
    ["unknown level", JSON.stringify({ schema_version: 1, gates: [gate({ level: "e2e" })] })],
    ["duplicate id", JSON.stringify({ schema_version: 1, gates: [gate(), gate()] })],
    ["empty command", JSON.stringify({ schema_version: 1, gates: [gate({ command: [] })] })],
    ["empty command entry", JSON.stringify({ schema_version: 1, gates: [gate({ command: ["node", ""] })] })],
    ["unknown when", JSON.stringify({ schema_version: 1, gates: [gate({ when: "maybe" })] })],
    ["skip without reason", JSON.stringify({ schema_version: 1, gates: [gate({ when: "skip" })] })],
    ["missing required", JSON.stringify({ schema_version: 1, gates: [gate({ required: "yes" })] })],
    ["bad timeout", JSON.stringify({ schema_version: 1, gates: [gate({ timeout_ms: 0 })] })],
  ];
  for (const [label, content] of cases) {
    const path = join(dir, "bad.json");
    writeFileSync(path, content);
    const result = runRunner(["--config", path, "--json"]);
    assert.equal(result.status, 2, `${label} must exit 2`);
  }
});

test("usage errors exit 2 and --help exits 0", () => {
  assert.equal(runRunner([]).status, 2);
  assert.equal(runRunner(["--config"]).status, 2);
  assert.equal(runRunner(["--bogus"]).status, 2);
  const help = runRunner(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});

test("--expected-sha mismatch exits 2 before any gate runs", () => {
  const dir = makeTemp("gates-sha-");
  const evidence = join(dir, "evidence");
  const config = writeConfig(dir, [gate()]);
  const mismatch = runJson([
    "--config",
    config,
    "--expected-sha",
    "0".repeat(40),
    "--evidence-dir",
    evidence,
    "--json",
  ]);
  assert.equal(mismatch.result.status, 2);
  assert.equal(mismatch.report, null);
  assert.equal(
    existsSync(evidence),
    false,
    "no evidence may be written when the SHA check fails",
  );

  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .stdout.trim();
  const match = runJson([
    "--config",
    config,
    "--expected-sha",
    head,
    "--json",
  ]);
  assert.equal(match.result.status, 0);
});

test("the shipped fixture config runs the unit and regression gates", () => {
  const config = fileURLToPath(
    new URL("../test/fixtures/test-gates/config.json", import.meta.url),
  );
  const { result, report } = runJson(["--config", config, "--json"]);
  assert.equal(result.status, 0);
  assert.deepEqual(
    report.gates.map((item) => item.id),
    ["unit", "regression"],
  );
  for (const item of report.gates) {
    assert.equal(item.status, "pass", `${item.id} must pass`);
  }
});

test("a HEAD change during the run is reported as incomplete and exits 2", () => {
  const repo = makeTemp("gates-repo-");
  const git = (args) =>
    spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  git(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init"]);
  writeFileSync(
    join(repo, "mutate.mjs"),
    [
      'import { execFileSync } from "node:child_process";',
      'execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "second"]);',
      "",
    ].join("\n"),
  );
  const config = join(repo, "config.json");
  writeFileSync(
    config,
    JSON.stringify({
      schema_version: 1,
      gates: [
        {
          id: "mutate",
          level: "unit",
          command: ["node", "mutate.mjs"],
          required: true,
          timeout_ms: 30000,
          when: "always",
        },
      ],
    }),
  );
  const result = runRunner(["--config", config, "--json"], { cwd: repo });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "incomplete");
  assert.equal(report.summary.status, "incomplete");
});
