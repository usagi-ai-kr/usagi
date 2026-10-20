#!/usr/bin/env node
/**
 * Run one command without a shell and emit the shared execution evidence envelope v1.
 *
 * Contract: docs/execution-evidence.md
 *
 * Usage: node scripts/run-command.mjs --argv-json <json-array> --out-dir <dir> [options]
 *
 * Exit codes:
 *   0    command exited 0
 *   1    command ran but exited non-zero
 *   124  timeout (process tree killed, completeness partial)
 *   2    runner error (bad args, spawn failure, output directory failure)
 *
 * The runner only writes the two captured-output files inside --out-dir.
 * It never uses a shell and installs nothing.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const USAGE = `Run one command without a shell and emit the execution evidence envelope.

Usage:
  node scripts/run-command.mjs --argv-json <json-array> --out-dir <dir> [options]

Options:
  --argv-json <json>   JSON array of non-empty strings, run with shell: false
  --arg <value>        repeatable; one argv element, order preserved (mutually exclusive with --argv-json)
  --out-dir <dir>      required; default location for stdout/stderr files
  --stdout-path <file> explicit captured-stdout file (default: <out-dir>/<run_id>.stdout.log)
  --stderr-path <file> explicit captured-stderr file (default: <out-dir>/<run_id>.stderr.log)
  --report-path <file> write the report here instead of stdout
  --env <NAME>         repeatable; pass this parent variable to the child (names only are recorded)
  --cwd <dir>          working directory (default: current directory)
  --timeout-ms <n>     kill the process tree after n ms: integer 1-2147483647 (default: 60000)
  --max-output-bytes <n>  keep at most n bytes per stream, drop the rest (default: 1048576)
  --redact <text>      repeatable; replace this literal with [REDACTED]; recorded as literal:N, never stored
  --json               print only the evidence JSON envelope to stdout
  --help               show this help

Exit codes:
  0    command exited 0
  1    command ran but exited non-zero
  124  timeout (process tree killed, completeness partial)
  2    runner error (bad args, spawn failure, output directory failure)
`;

const SECRET_NAME_PATTERN = /TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Small documented base passed to every child. Request more with --env.
const BASE_ENV_NAMES = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR"];
const WINDOWS_ENV_NAMES = [
  "SystemRoot",
  "SystemDrive",
  "PATHEXT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "USERPROFILE",
];

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    argvJson: null,
    args: [],
    outDir: null,
    stdoutPath: null,
    stderrPath: null,
    reportPath: null,
    envNames: [],
    cwd: process.cwd(),
    timeoutMs: 60000,
    maxOutputBytes: 1048576,
    redact: [],
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
      case "--argv-json":
        options.argvJson = readValue();
        break;
      case "--arg": {
        const value = readValue();
        if (value === "") {
          throw new UsageError("--arg must be a non-empty string");
        }
        options.args.push(value);
        break;
      }
      case "--env": {
        const name = readValue();
        if (!ENV_NAME_PATTERN.test(name)) {
          throw new UsageError(`--env must be a valid variable name, got: ${name}`);
        }
        options.envNames.push(name);
        break;
      }
      case "--stdout-path":
        options.stdoutPath = readValue();
        break;
      case "--stderr-path":
        options.stderrPath = readValue();
        break;
      case "--report-path":
        options.reportPath = readValue();
        break;
      case "--out-dir":
        options.outDir = readValue();
        break;
      case "--cwd":
        options.cwd = readValue();
        break;
      case "--timeout-ms":
        options.timeoutMs = readValue();
        break;
      case "--max-output-bytes":
        options.maxOutputBytes = readValue();
        break;
      case "--redact":
        options.redact.push(readValue());
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

function parseArgv(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`--argv-json is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new UsageError("--argv-json must be a non-empty JSON array of strings");
  }
  for (const [index, entry] of parsed.entries()) {
    if (typeof entry !== "string" || entry === "") {
      throw new UsageError(`--argv-json[${index}] must be a non-empty string`);
    }
  }
  return parsed;
}

function parsePositiveInt(raw, flag, note) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 2147483647) {
    throw new UsageError(
      `${flag} must be a positive integer (1-2147483647)${note}, got: ${raw}`,
    );
  }
  return value;
}

function parseTimeoutMs(raw) {
  // setTimeout clamps values above 2^31-1 (Node warns and treats them as 1ms),
  // so only accept positive integers inside the supported range.
  return parsePositiveInt(raw, "--timeout-ms", " within the setTimeout range");
}

function collectRedactions(literals) {
  const names = [];
  const secrets = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (
      SECRET_NAME_PATTERN.test(name) &&
      typeof value === "string" &&
      value !== ""
    ) {
      names.push(name);
      secrets.push(value);
    }
  }
  const literalList = [];
  for (const literal of literals) {
    if (typeof literal === "string" && literal !== "") {
      literalList.push(literal);
    }
  }
  // Longest first so overlapping secrets do not leave fragments.
  const values = [...new Set([...secrets, ...literalList])].sort(
    (a, b) => b.length - a.length,
  );
  return { names, literalList, values };
}

function applyRedactions(text, values) {
  let result = text;
  for (const value of values) {
    if (value !== "") {
      result = result.split(value).join("[REDACTED]");
    }
  }
  return result;
}

function buildChildEnv(requestedNames) {
  // The child never inherits process.env wholesale: only the documented
  // base names plus explicitly requested ones. A requested name missing
  // from the parent is left absent; values are never invented.
  const names = [...BASE_ENV_NAMES];
  if (platform() === "win32") names.push(...WINDOWS_ENV_NAMES);
  names.push(...requestedNames);
  const env = {};
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

function killTree(child) {
  if (platform() === "win32") {
    let cleaned = false;
    try {
      const res = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: 10000,
      });
      cleaned = !!res && res.status === 0;
    } catch {
      cleaned = false;
    }
    if (!cleaned) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Child already gone; the close handler settles the outcome.
      }
    }
    return;
  }
  try {
    // Negative pid targets the detached process group created at spawn.
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // Child already gone; the close handler settles the outcome.
    }
  }
}

function runCommand(command, { cwd, timeoutMs, maxOutputBytes, env }) {
  return new Promise((settle) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        shell: false,
        cwd,
        env,
        detached: platform() !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      settle({ spawnError: error });
      return;
    }

    let timedOut = false;
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    // Streams keep flowing after the cap so the child never blocks on a full
    // pipe; excess bytes are dropped and only the truncation flag is kept.
    child.stdout.on("data", (chunk) => {
      if (stdoutSize + chunk.length <= maxOutputBytes) {
        stdoutChunks.push(chunk);
        stdoutSize += chunk.length;
      } else {
        stdoutTruncated = true;
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderrSize + chunk.length <= maxOutputBytes) {
        stderrChunks.push(chunk);
        stderrSize += chunk.length;
      } else {
        stderrTruncated = true;
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    timer.unref?.();

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

function usageFailure(json, message, literals = []) {
  // Usage/config messages may echo user input (e.g. a V8 JSON error quoting
  // part of --argv-json), so redact them before printing.
  const { values } = collectRedactions(literals);
  const safe = applyRedactions(message, values);
  if (json) {
    console.log(
      JSON.stringify(
        {
          schema_version: 1,
          error: safe,
          completeness: "unavailable",
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`error: ${safe}`);
    console.error("run with --help for usage");
  }
  return 2;
}

function humanReport(envelope, redacted) {
  const lines = [];
  if (envelope.error) {
    lines.push(`run ${envelope.run_id}: runner error: ${envelope.error}`);
  } else if (envelope.timed_out) {
    lines.push(
      `run ${envelope.run_id}: timed out after ${envelope.duration_ms}ms (exit 124)`,
    );
  } else {
    lines.push(
      `run ${envelope.run_id}: exit ${envelope.exit_code} in ${envelope.duration_ms}ms`,
    );
  }
  lines.push(`command: ${envelope.command.join(" ")}`);
  const markTruncated = (truncated) => (truncated ? ", truncated" : "");
  if (envelope.stdout_ref) {
    lines.push(
      `stdout: ${envelope.stdout_ref} (${redacted.stdoutBytes} bytes${markTruncated(envelope.stdout_truncated)})`,
    );
  }
  if (envelope.stderr_ref) {
    lines.push(
      `stderr: ${envelope.stderr_ref} (${redacted.stderrBytes} bytes${markTruncated(envelope.stderr_truncated)})`,
    );
  }
  if (!redacted.clean) {
    lines.push(`redactions applied: ${envelope.redactions.join(", ")}`);
  }
  return lines.join("\n");
}

function emitHuman(envelope, redacted) {
  console.log(humanReport(envelope, redacted));
}

async function main(argv) {
  const jsonMode = argv.includes("--json");

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return usageFailure(jsonMode, error.message);
  }

  if (options.help) {
    console.log(USAGE.trimEnd());
    return 0;
  }

  if (options.argvJson === null && options.args.length === 0) {
    return usageFailure(jsonMode, "--argv-json or --arg is required");
  }
  if (options.outDir === null) {
    return usageFailure(jsonMode, "--out-dir is required");
  }

  let command;
  if (options.argvJson !== null && options.args.length > 0) {
    return usageFailure(jsonMode, "--argv-json and --arg are mutually exclusive", options.redact);
  } else if (options.argvJson !== null) {
    try {
      command = parseArgv(options.argvJson);
    } catch (error) {
      return usageFailure(jsonMode, error.message, options.redact);
    }
  } else {
    command = options.args;
  }

  let timeoutMs;
  try {
    timeoutMs = parseTimeoutMs(options.timeoutMs);
  } catch (error) {
    return usageFailure(jsonMode, error.message, options.redact);
  }

  let maxOutputBytes;
  try {
    maxOutputBytes = parsePositiveInt(options.maxOutputBytes, "--max-output-bytes", "");
  } catch (error) {
    return usageFailure(jsonMode, error.message, options.redact);
  }

  const cwd = resolve(options.cwd);
  try {
    if (!statSync(cwd).isDirectory()) {
      return usageFailure(jsonMode, `--cwd is not a directory: ${options.cwd}`, options.redact);
    }
  } catch {
    return usageFailure(jsonMode, `--cwd is not a directory: ${options.cwd}`, options.redact);
  }

  const outDir = resolve(options.outDir);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (error) {
    return usageFailure(
      jsonMode,
      `cannot create --out-dir ${options.outDir}: ${error.message}`,
      options.redact,
    );
  }

  const runId = randomUUID();
  const rawStdoutPath =
    options.stdoutPath === null ? join(outDir, `${runId}.stdout.log`) : resolve(options.stdoutPath);
  const rawStderrPath =
    options.stderrPath === null ? join(outDir, `${runId}.stderr.log`) : resolve(options.stderrPath);
  const rawReportPath = options.reportPath === null ? null : resolve(options.reportPath);
  for (const declared of [rawStdoutPath, rawStderrPath, ...(rawReportPath === null ? [] : [rawReportPath])]) {
    try {
      mkdirSync(dirname(declared), { recursive: true });
    } catch (error) {
      return usageFailure(jsonMode, `cannot create parent for ${declared}: ${error.message}`, options.redact);
    }
  }
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Secrets are redacted from captured output AND from recorded metadata
  // (command, cwd, refs), since argv or paths may carry a literal secret.
  // The redactions list itself carries only identifiers, never secret values.
  const { names, literalList, values } = collectRedactions(options.redact);
  const redactions = [
    ...names.map((name) => `env:${name}`),
    ...literalList.map((_, index) => `literal:${index + 1}`),
  ];
  const recordedCommand = command.map((part) => applyRedactions(part, values));
  const stdoutPath = applyRedactions(rawStdoutPath, values);
  const stderrPath = applyRedactions(rawStderrPath, values);
  const reportPath = rawReportPath === null ? null : applyRedactions(rawReportPath, values);
  // Names explicitly requested, in order and deduplicated. Values are never
  // recorded; a name missing from the parent is simply absent from the child.
  const envPassed = [...new Set(options.envNames)];
  const childEnv = buildChildEnv(options.envNames);

  const outcome = await runCommand(command, { cwd, timeoutMs, maxOutputBytes, env: childEnv });

  const envelope = {
    schema_version: 1,
    run_id: runId,
    command: recordedCommand,
    cwd: applyRedactions(cwd, values),
    env_fingerprint: {
      os: platform(),
      arch: arch(),
      node: process.version,
    },
    env_passed: envPassed,
    started_at: startedAt,
    duration_ms: 0,
    exit_code: null,
    signal: null,
    timed_out: false,
    stdout_truncated: false,
    stderr_truncated: false,
    stdout_ref: applyRedactions(stdoutPath, values),
    stderr_ref: applyRedactions(stderrPath, values),
    artifacts: [],
    completeness: "unavailable",
    redactions: [],
  };

  let runnerExit;
  let redactedMeta = { stdoutBytes: 0, stderrBytes: 0, clean: values.length === 0 };

  if (outcome.spawnError) {
    envelope.duration_ms = Date.now() - startMs;
    envelope.stdout_ref = null;
    envelope.stderr_ref = null;
    envelope.error = applyRedactions(`spawn failed: ${outcome.spawnError.message}`, values);
    envelope.redactions = redactions;
    runnerExit = 2;
  } else {
    const stdoutText = applyRedactions(outcome.stdout.toString("utf8"), values);
    const stderrText = applyRedactions(outcome.stderr.toString("utf8"), values);

    try {
      writeFileSync(rawStdoutPath, stdoutText);
      writeFileSync(rawStderrPath, stderrText);
    } catch (error) {
      envelope.duration_ms = Date.now() - startMs;
      envelope.error = applyRedactions(`cannot write captured output: ${error.message}`, values);
      envelope.redactions = redactions;
      runnerExit = 2;
    }

    if (runnerExit === undefined) {
      envelope.duration_ms = outcome.finishedAt - outcome.startedAt;
      envelope.exit_code = outcome.code;
      envelope.signal = outcome.signal;
      envelope.timed_out = outcome.timedOut;
      envelope.stdout_truncated = outcome.stdoutTruncated;
      envelope.stderr_truncated = outcome.stderrTruncated;
      envelope.redactions = redactions;
      // complete only when the exit code is known AND no output was dropped;
      // truncation means evidence is incomplete even on exit 0.
      const truncated = envelope.stdout_truncated || envelope.stderr_truncated;
      if (envelope.timed_out || envelope.exit_code === null || truncated) {
        envelope.completeness = "partial";
      } else {
        envelope.completeness = "complete";
      }

      redactedMeta = {
        stdoutBytes: Buffer.byteLength(stdoutText),
        stderrBytes: Buffer.byteLength(stderrText),
        clean: values.length === 0,
      };

      if (envelope.timed_out) runnerExit = 124;
      else if (envelope.exit_code === null || envelope.exit_code !== 0) runnerExit = 1;
      else runnerExit = 0;
    }
  }

  const reportText = options.json
    ? JSON.stringify(envelope, null, 2)
    : humanReport(envelope, redactedMeta);
  if (reportPath !== null) {
    try {
      writeFileSync(rawReportPath, `${reportText}\n`);
    } catch (error) {
      console.error(`error: cannot write report file ${reportPath}: ${error.message}`);
      return 2;
    }
  } else if (options.json) {
    console.log(reportText);
  } else {
    emitHuman(envelope, redactedMeta);
  }
  return runnerExit;
}

process.exit(await main(process.argv.slice(2)));
