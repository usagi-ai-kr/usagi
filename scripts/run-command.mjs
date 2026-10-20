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
import { join, resolve } from "node:path";
import process from "node:process";

const USAGE = `Run one command without a shell and emit the execution evidence envelope.

Usage:
  node scripts/run-command.mjs --argv-json <json-array> --out-dir <dir> [options]

Options:
  --argv-json <json>   required; JSON array of non-empty strings, run with shell: false
  --out-dir <dir>      required; stdout/stderr files are written here
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

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    argvJson: null,
    outDir: null,
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

function runCommand(command, { cwd, timeoutMs, maxOutputBytes }) {
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

function emitHuman(envelope, redacted) {
  if (envelope.error) {
    console.log(`run ${envelope.run_id}: runner error: ${envelope.error}`);
  } else if (envelope.timed_out) {
    console.log(
      `run ${envelope.run_id}: timed out after ${envelope.duration_ms}ms (exit 124)`,
    );
  } else {
    console.log(
      `run ${envelope.run_id}: exit ${envelope.exit_code} in ${envelope.duration_ms}ms`,
    );
  }
  console.log(`command: ${envelope.command.join(" ")}`);
  const markTruncated = (truncated) => (truncated ? ", truncated" : "");
  if (envelope.stdout_ref) {
    console.log(
      `stdout: ${envelope.stdout_ref} (${redacted.stdoutBytes} bytes${markTruncated(envelope.stdout_truncated)})`,
    );
  }
  if (envelope.stderr_ref) {
    console.log(
      `stderr: ${envelope.stderr_ref} (${redacted.stderrBytes} bytes${markTruncated(envelope.stderr_truncated)})`,
    );
  }
  if (!redacted.clean) {
    console.log(`redactions applied: ${envelope.redactions.join(", ")}`);
  }
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

  if (options.argvJson === null) {
    return usageFailure(jsonMode, "--argv-json is required");
  }
  if (options.outDir === null) {
    return usageFailure(jsonMode, "--out-dir is required");
  }

  let command;
  try {
    command = parseArgv(options.argvJson);
  } catch (error) {
    return usageFailure(jsonMode, error.message, options.redact);
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
  const stdoutPath = join(outDir, `${runId}.stdout.log`);
  const stderrPath = join(outDir, `${runId}.stderr.log`);
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

  const outcome = await runCommand(command, { cwd, timeoutMs, maxOutputBytes });

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

  if (outcome.spawnError) {
    envelope.duration_ms = Date.now() - startMs;
    envelope.stdout_ref = null;
    envelope.stderr_ref = null;
    envelope.error = applyRedactions(`spawn failed: ${outcome.spawnError.message}`, values);
    envelope.redactions = redactions;
    if (options.json) {
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      emitHuman(envelope, { stdoutBytes: 0, stderrBytes: 0, clean: values.length === 0 });
    }
    return 2;
  }

  const stdoutText = applyRedactions(outcome.stdout.toString("utf8"), values);
  const stderrText = applyRedactions(outcome.stderr.toString("utf8"), values);

  try {
    writeFileSync(stdoutPath, stdoutText);
    writeFileSync(stderrPath, stderrText);
  } catch (error) {
    envelope.duration_ms = Date.now() - startMs;
    envelope.error = applyRedactions(`cannot write captured output: ${error.message}`, values);
    envelope.redactions = redactions;
    if (options.json) {
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      emitHuman(envelope, { stdoutBytes: 0, stderrBytes: 0, clean: values.length === 0 });
    }
    return 2;
  }

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

  const redactedMeta = {
    stdoutBytes: Buffer.byteLength(stdoutText),
    stderrBytes: Buffer.byteLength(stderrText),
    clean: values.length === 0,
  };

  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    emitHuman(envelope, redactedMeta);
  }

  if (envelope.timed_out) return 124;
  if (envelope.exit_code === null || envelope.exit_code !== 0) return 1;
  return 0;
}

process.exit(await main(process.argv.slice(2)));
