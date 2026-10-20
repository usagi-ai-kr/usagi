#!/usr/bin/env node
/**
 * Config-driven test gate runner for unit/slice/integration/regression levels.
 *
 * Contract: docs/test-gate-contract.md
 *
 * Usage: node scripts/run-test-gates.mjs --config <path> [options]
 *
 * Exit codes:
 *   0  all required gates passed (optional failures are counted, not fatal)
 *   1  a required gate failed or timed out
 *   2  usage, config, SHA binding or evidence binding error
 *
 * The runner only reads and runs: no shell, no network, no installs.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const USAGE = `Run configured test gates and record commit-bound evidence.

Usage:
  node scripts/run-test-gates.mjs --config <path> [options]

Options:
  --config <path>        gate config JSON (required)
  --evidence-dir <dir>   write per-gate logs and the report here
  --only <level|id>      run only matching gates (repeatable)
  --expected-sha <sha>   fail before running when HEAD does not match
  --json                 print a machine-readable report (only JSON on stdout)
  --help                 show this help

Exit codes:
  0  all required gates passed (optional failures are counted, not fatal)
  1  a required gate failed or timed out
  2  usage, config, SHA binding, evidence binding error, or a required gate that did not run
`;

const LEVELS = ["unit", "slice", "integration", "regression"];
const GATE_STATUSES = ["pass", "fail", "timeout", "skipped", "not_applicable"];
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const MAX_OUTPUT_BYTES = 1048576;
// setTimeout clamps values above 2^31-1 to ~1ms, so the range is bounded.
const MAX_TIMEOUT_MS = 2147483647;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    config: null,
    evidenceDir: null,
    only: [],
    expectedSha: null,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      if (index + 1 >= argv.length) {
        throw new UsageError(`missing value for ${arg}`);
      }
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case "--config":
        options.config = readValue();
        break;
      case "--evidence-dir":
        options.evidenceDir = readValue();
        break;
      case "--only":
        options.only.push(readValue());
        break;
      case "--expected-sha":
        options.expectedSha = readValue();
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new UsageError(`unknown option: ${arg}`);
    }
  }
  return options;
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

function parseWhen(raw, where) {
  if (raw === "always") return { kind: "always" };
  if (raw === "skip") return { kind: "skip" };
  if (typeof raw === "string" && raw.startsWith("env:")) {
    const name = raw.slice(4);
    if (!ENV_NAME_PATTERN.test(name)) {
      throw new UsageError(`${where}: when env:NAME needs a valid variable name, got: ${raw}`);
    }
    return { kind: "env", name };
  }
  throw new UsageError(
    `${where}: when must be "always", "skip" or "env:NAME", got: ${JSON.stringify(raw)}`,
  );
}

function parseConfig(raw, configPath) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`invalid JSON in ${configPath}: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UsageError(`${configPath}: config must be a JSON object`);
  }
  if (parsed.schema_version !== 1) {
    throw new UsageError(
      `${configPath}: schema_version must be 1, got ${JSON.stringify(parsed.schema_version)}`,
    );
  }
  if (!Array.isArray(parsed.gates) || parsed.gates.length === 0) {
    throw new UsageError(`${configPath}: gates must be a non-empty array`);
  }

  const seenIds = new Set();
  const gates = parsed.gates.map((gate, index) => {
    const where = `${configPath}: gates[${index}]`;
    if (gate === null || typeof gate !== "object" || Array.isArray(gate)) {
      throw new UsageError(`${where} must be an object`);
    }
    if (typeof gate.id !== "string" || gate.id.trim() === "") {
      throw new UsageError(`${where}: id must be a non-empty string`);
    }
    if (seenIds.has(gate.id)) {
      throw new UsageError(`${where}: duplicate gate id ${gate.id}`);
    }
    seenIds.add(gate.id);
    if (!LEVELS.includes(gate.level)) {
      throw new UsageError(
        `${where}: level must be one of ${LEVELS.join("|")}, got ${JSON.stringify(gate.level)}`,
      );
    }
    if (!Array.isArray(gate.command) || gate.command.length === 0) {
      throw new UsageError(`${where}: command must be a non-empty array`);
    }
    for (const part of gate.command) {
      if (typeof part !== "string" || part === "") {
        throw new UsageError(`${where}: command entries must be non-empty strings`);
      }
    }
    if (typeof gate.required !== "boolean") {
      throw new UsageError(`${where}: required must be a boolean`);
    }
    if (!Number.isInteger(gate.timeout_ms) || gate.timeout_ms <= 0 || gate.timeout_ms > MAX_TIMEOUT_MS) {
      throw new UsageError(
        `${where}: timeout_ms must be an integer between 1 and ${MAX_TIMEOUT_MS}`,
      );
    }
    const when = parseWhen(gate.when, where);
    if (when.kind === "skip" && (typeof gate.reason !== "string" || gate.reason.trim() === "")) {
      throw new UsageError(`${where}: when "skip" needs a reason`);
    }
    return {
      id: gate.id,
      level: gate.level,
      command: [...gate.command],
      required: gate.required,
      timeoutMs: gate.timeout_ms,
      when,
      reason: typeof gate.reason === "string" ? gate.reason : null,
    };
  });

  return { gates };
}

function gitOutput(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function readBinding(cwd) {
  const commit = gitOutput(["rev-parse", "HEAD"], cwd);
  if (commit === null || !SHA_PATTERN.test(commit)) {
    throw new UsageError(`cannot resolve HEAD in ${cwd}: not a git repository with a commit`);
  }
  const staged = gitOutput(["write-tree"], cwd);
  if (staged === null || !SHA_PATTERN.test(staged)) {
    throw new UsageError(`cannot resolve the staged tree in ${cwd}`);
  }
  return { commit, staged };
}

function killTree(child) {
  if (platform() === "win32") {
    try {
      const res = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: 10000,
      });
      if (res && res.status === 0) return;
    } catch {
      // Fall through to a direct kill.
    }
  }
  try {
    // A negative pid targets the detached process group created at spawn.
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The close handler settles the outcome.
    }
  }
}

function runGate(command, { cwd, timeoutMs }) {
  return new Promise((settle) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        shell: false,
        cwd,
        detached: platform() !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      settle({ spawnError: error, startedAt });
      return;
    }

    let timedOut = false;
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    timer.unref?.();

    // Capture up to the cap and keep draining after it. A chunk that crosses
    // the cap is written partially, so the captured size does not depend on
    // the stream chunk boundaries.
    child.stdout.on("data", (chunk) => {
      const remaining = MAX_OUTPUT_BYTES - stdoutSize;
      if (remaining > 0) {
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        stdoutChunks.push(slice);
        stdoutSize += slice.length;
      }
      if (chunk.length > remaining) stdoutTruncated = true;
    });
    child.stderr.on("data", (chunk) => {
      const remaining = MAX_OUTPUT_BYTES - stderrSize;
      if (remaining > 0) {
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        stderrChunks.push(slice);
        stderrSize += slice.length;
      }
      if (chunk.length > remaining) stderrTruncated = true;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      settle({ spawnError: error, startedAt });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      settle({
        code,
        signal: signal ?? null,
        timedOut,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
        stdoutTruncated,
        stderrTruncated,
        startedAt,
        finishedAt: Date.now(),
      });
    });
  });
}

function writeEvidence(dir, name, bytes) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

async function runGates(gates, { cwd, evidenceDir, runId, only }) {
  const results = [];
  for (const gate of gates) {
    const base = {
      id: gate.id,
      level: gate.level,
      required: gate.required,
      command: gate.command,
      exit_code: null,
      duration_ms: 0,
      stdout_ref: null,
      stderr_ref: null,
      stdout_bytes: 0,
      stderr_bytes: 0,
      stdout_truncated: false,
      stderr_truncated: false,
      reason: null,
    };

    if (only.length > 0 && !only.includes(gate.level) && !only.includes(gate.id)) {
      results.push({ ...base, status: "skipped", reason: "not selected by --only" });
      continue;
    }
    if (gate.when.kind === "skip") {
      results.push({
        ...base,
        status: "skipped",
        reason: gate.reason ?? "skipped by config",
      });
      continue;
    }
    if (gate.when.kind === "env" && process.env[gate.when.name] === undefined) {
      results.push({
        ...base,
        status: "not_applicable",
        reason: `env ${gate.when.name} is not set`,
      });
      continue;
    }

    const outcome = await runGate(gate.command, { cwd, timeoutMs: gate.timeoutMs });
    if (outcome.spawnError) {
      results.push({
        ...base,
        status: "fail",
        reason: `spawn failed: ${outcome.spawnError.message}`,
      });
      continue;
    }

    const stdout = outcome.stdout;
    const stderr = outcome.stderr;
    let stdoutRef = null;
    let stderrRef = null;
    if (evidenceDir !== null) {
      stdoutRef = writeEvidence(
        evidenceDir,
        `${runId}.${gate.id}.stdout.log`,
        stdout,
      );
      stderrRef = writeEvidence(
        evidenceDir,
        `${runId}.${gate.id}.stderr.log`,
        stderr,
      );
    }

    results.push({
      ...base,
      status: outcome.timedOut ? "timeout" : outcome.code === 0 ? "pass" : "fail",
      exit_code: outcome.code,
      duration_ms: outcome.finishedAt - outcome.startedAt,
      stdout_ref: stdoutRef,
      stderr_ref: stderrRef,
      stdout_bytes: stdout.length,
      stderr_bytes: stderr.length,
      stdout_truncated: outcome.stdoutTruncated,
      stderr_truncated: outcome.stderrTruncated,
      reason: outcome.timedOut ? `timed out after ${gate.timeoutMs}ms` : null,
    });
  }
  return results;
}

function summarize(gates) {
  const summary = {
    total: gates.length,
    passed: 0,
    failed: 0,
    timed_out: 0,
    skipped: 0,
    not_applicable: 0,
    required_failed: 0,
    optional_failed: 0,
    required_not_run: 0,
    status: "ok",
  };
  for (const gate of gates) {
    if (gate.status === "pass") summary.passed += 1;
    else if (gate.status === "fail") {
      summary.failed += 1;
      if (gate.required) summary.required_failed += 1;
      else summary.optional_failed += 1;
    } else if (gate.status === "timeout") {
      summary.timed_out += 1;
      if (gate.required) summary.required_failed += 1;
      else summary.optional_failed += 1;
    } else if (gate.status === "skipped") {
      summary.skipped += 1;
      if (gate.required) summary.required_not_run += 1;
    } else if (gate.status === "not_applicable") {
      summary.not_applicable += 1;
      if (gate.required) summary.required_not_run += 1;
    }
  }
  if (summary.required_failed > 0) summary.status = "failed";
  // A required gate that never ran is not a pass. The run is incomplete and
  // must not be presented as green.
  else if (summary.required_not_run > 0) summary.status = "incomplete";
  return summary;
}

function emitHuman(report) {
  for (const gate of report.gates) {
    const mark = gate.status === "pass" ? "pass" : gate.status;
    const reason = gate.reason ? ` (${gate.reason})` : "";
    console.log(
      `  ${gate.id}: ${mark}${reason} [${gate.level}]${gate.required ? " required" : " optional"} ${gate.duration_ms}ms`,
    );
  }
  console.log(
    `test-gates: ${report.summary.status} (${report.summary.total} gate(s), ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.timed_out} timed out, ${report.summary.skipped} skipped, ${report.summary.not_applicable} not applicable, ${report.summary.required_not_run} required gate(s) not run)`,
  );
  console.log(
    `  commit=${report.source_commit} staged_tree=${report.staged_tree_sha} config_sha256=${report.config_sha256}`,
  );
}

async function run(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    console.error("run with --help for usage");
    return 2;
  }

  if (options.help) {
    console.log(USAGE.trimEnd());
    return 0;
  }

  if (options.config === null) {
    console.error("error: --config is required");
    console.error("run with --help for usage");
    return 2;
  }
  if (options.expectedSha !== null && !SHA_PATTERN.test(options.expectedSha)) {
    console.error("error: --expected-sha must be a 40 character hex sha");
    return 2;
  }

  const cwd = process.cwd();
  const configPath = resolve(options.config);
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch (error) {
    console.error(`error: cannot read config ${configPath}: ${error.message}`);
    return 2;
  }

  let config;
  try {
    config = parseConfig(raw, configPath);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }

  let binding;
  try {
    binding = readBinding(cwd);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }

  if (options.expectedSha !== null && options.expectedSha.toLowerCase() !== binding.commit.toLowerCase()) {
    console.error(
      `error: HEAD ${binding.commit} does not match --expected-sha ${options.expectedSha}`,
    );
    return 2;
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const evidenceDir = options.evidenceDir === null ? null : resolve(options.evidenceDir);

  const gates = await runGates(config.gates, {
    cwd,
    evidenceDir,
    runId,
    only: options.only,
  });

  const headAfter = gitOutput(["rev-parse", "HEAD"], cwd);
  const stagedAfter = gitOutput(["write-tree"], cwd);
  const bindingIntact = headAfter === binding.commit && stagedAfter === binding.staged;

  const report = {
    schema_version: 1,
    run_id: runId,
    config: configPath,
    config_sha256: sha256Hex(raw),
    source_commit: binding.commit,
    staged_tree_sha: binding.staged,
    environment: { os: platform(), arch: arch(), node: process.version },
    started_at: startedAt,
    duration_ms: Date.now() - startMs,
    gates,
    summary: summarize(gates),
    status: bindingIntact ? "complete" : "incomplete",
  };

  const requiredNotRun = report.summary.required_not_run > 0;
  if (!bindingIntact) {
    report.summary.status = "incomplete";
    report.error =
      "HEAD or the staged tree changed during the run; the recorded evidence is not valid for the current tree";
  } else if (requiredNotRun) {
    // A required gate that was excluded or skipped leaves the contract
    // uncovered, so the run is incomplete rather than green.
    report.status = "incomplete";
    report.error =
      "a required gate was not run; acceptance runs must not exclude required gates";
  }

  if (evidenceDir !== null) {
    try {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(
        join(evidenceDir, `${runId}.report.json`),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    } catch (error) {
      console.error(`error: cannot write the evidence report: ${error.message}`);
      return 2;
    }
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    emitHuman(report);
  }

  if (!bindingIntact) {
    console.error("error: HEAD or the staged tree changed during the run");
    return 2;
  }
  if (requiredNotRun) {
    console.error("error: a required gate was not run; the run is incomplete");
    return 2;
  }
  return report.summary.status === "failed" ? 1 : 0;
}

process.exit(await run(process.argv.slice(2)));
