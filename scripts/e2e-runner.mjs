#!/usr/bin/env node
/**
 * Reference E2E runner: owns a static fixture server, executes one behavior
 * scenario through an optional browser adapter, and emits a result document
 * that the Phase 1 validator checks.
 *
 * Contract: docs/e2e-contract.md
 *
 * Usage: node scripts/e2e-runner.mjs --out-dir <dir> [options]
 *
 * Exit codes:
 *   0  validator accepted the result and status is passed
 *   1  the run started but did not pass (failed, blocked, unavailable,
 *      or the validator rejected the result)
 *   2  usage, config, startup or spawn error (the run never started)
 *   128+n  the runner itself caught SIGTERM (143) or SIGINT (130)
 *
 * The runner never attaches to a foreign server: one bind attempt owns the
 * port or fails closed. Without a browser only lifecycle outcomes
 * (blocked/unavailable/failed) are emitted, never a pass.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_SCRIPT = join(SCRIPTS_DIR, "e2e-runner", "server.mjs");
const VALIDATOR_SCRIPT = join(SCRIPTS_DIR, "validate-e2e-result.mjs");
const DEFAULT_FIXTURE_ROOT = resolve(
  SCRIPTS_DIR,
  "..",
  "test",
  "fixtures",
  "e2e-runner",
  "public",
);
const MAX_LOG_BYTES = 1048576;

const USAGE = `Run the reference E2E behavior scenario against an owned fixture server.

Usage:
  node scripts/e2e-runner.mjs --out-dir <dir> [options]

Options:
  --out-dir <dir>        required; result, manifest and artifacts land here
  --port <n>             fixture server port (default: 0 = ephemeral owned port)
  --root <dir>           fixture static root (default: test/fixtures/e2e-runner/public)
  --scenario <id>        scenario to run; only "behavior" exists
  --adapter <name>       auto|playwright|none (default: auto)
  --browser <name>       requested browser, default chromium
  --viewport <WxH>       requested viewport, default 1280x720
  --dpr <number>         requested device pixel ratio, default 1
  --locale <tag>         default ko-KR
  --timezone <name>      default Asia/Seoul
  --theme <name>         light|dark, default light
  --timeout-ms <n>       whole-run watchdog in ms (default: 60000)
  --server-delay-ms <n>  fixture fault injection: delay every server response
  --expected-sha <sha>   pass through to the validator
  --expected-viewport <WxH>  pass through to the validator
  --expected-dpr <number>    pass through to the validator
  --json                 print a machine-readable report (only JSON on stdout)
  --help                 show this help

Exit codes:
  0  validator accepted the result and status is passed
  1  ran but did not pass, or the validator rejected the result
  2  usage, config, startup or spawn error
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    outDir: null,
    port: 0,
    root: DEFAULT_FIXTURE_ROOT,
    scenario: "behavior",
    adapter: "auto",
    browser: "chromium",
    viewport: { width: 1280, height: 720 },
    dpr: 1,
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    theme: "light",
    timeoutMs: 60000,
    serverDelayMs: 0,
    expectedSha: null,
    expectedViewport: null,
    expectedDpr: null,
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
    const readViewport = (raw, flag) => {
      const match = /^(\d+)x(\d+)$/i.exec(raw);
      if (!match) throw new UsageError(`${flag} must be <WxH>, got: ${raw}`);
      return { width: Number(match[1]), height: Number(match[2]) };
    };
    const readPositiveInt = (raw, flag, max = 2147483647) => {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new UsageError(`${flag} must be an integer between 0 and ${max}, got: ${raw}`);
      }
      return value;
    };
    switch (arg) {
      case "--out-dir":
        options.outDir = readValue();
        break;
      case "--port":
        options.port = readPositiveInt(readValue(), "--port", 65535);
        break;
      case "--root":
        options.root = readValue();
        break;
      case "--scenario":
        options.scenario = readValue();
        break;
      case "--adapter":
        options.adapter = readValue();
        break;
      case "--browser":
        options.browser = readValue();
        break;
      case "--viewport":
        options.viewport = readViewport(readValue(), "--viewport");
        break;
      case "--dpr": {
        const value = Number(readValue());
        if (!Number.isFinite(value) || value <= 0) {
          throw new UsageError(`--dpr must be a positive number`);
        }
        options.dpr = value;
        break;
      }
      case "--locale":
        options.locale = readValue();
        break;
      case "--timezone":
        options.timezone = readValue();
        break;
      case "--theme":
        options.theme = readValue();
        break;
      case "--timeout-ms":
        options.timeoutMs = readPositiveInt(readValue(), "--timeout-ms");
        if (options.timeoutMs === 0) throw new UsageError("--timeout-ms must be at least 1");
        break;
      case "--server-delay-ms":
        options.serverDelayMs = readPositiveInt(readValue(), "--server-delay-ms");
        break;
      case "--expected-sha":
        options.expectedSha = readValue();
        break;
      case "--expected-viewport":
        options.expectedViewport = readViewport(readValue(), "--expected-viewport");
        break;
      case "--expected-dpr": {
        const value = Number(readValue());
        if (!Number.isFinite(value) || value <= 0) {
          throw new UsageError(`--expected-dpr must be a positive number`);
        }
        options.expectedDpr = value;
        break;
      }
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

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error || result.status !== 0) return null;
  const sha = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Kill an owned process tree: process group on POSIX, taskkill on Windows,
// direct kill as fallback. Never throws.
function killTree(pid) {
  if (pid === null || pid === undefined) return;
  if (platform() === "win32") {
    try {
      const res = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
        timeout: 10000,
      });
      if (res && res.status === 0) return;
    } catch {
      // Fall through to a direct kill.
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      // Fall through to a direct kill.
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone; the caller re-checks with pidAlive.
  }
}

async function pollGone(pid, timeoutMs = 2000) {
  const start = Date.now();
  while (pidAlive(pid)) {
    if (Date.now() - start > timeoutMs) return false;
    await sleepMs(50);
  }
  return true;
}

function fetchJson(url, timeoutMs, track) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let text = "";
      response.on("data", (chunk) => {
        text += chunk.toString();
      });
      response.on("end", () => {
        if (track) track(null);
        if (response.statusCode !== 200) {
          reject(new Error(`identity check got http ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`identity check got invalid JSON: ${error.message}`));
        }
      });
    });
    request.on("error", (error) => {
      if (track) track(null);
      reject(error);
    });
    if (track) track(request);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("identity check timed out"));
    });
  });
}

function measureResources() {
  let cpuUserMs = null;
  let cpuSystemMs = null;
  let peakRssBytes = null;
  try {
    const cpu = process.cpuUsage();
    cpuUserMs = Math.round(cpu.user / 1000);
    cpuSystemMs = Math.round(cpu.system / 1000);
  } catch {
    cpuUserMs = null;
    cpuSystemMs = null;
  }
  try {
    const usage = process.resourceUsage();
    if (typeof usage.maxRSS === "number" && usage.maxRSS > 0) {
      // maxRSS is bytes on macOS/Windows and kilobytes on Linux.
      peakRssBytes = platform() === "linux" ? usage.maxRSS * 1024 : usage.maxRSS;
    }
  } catch {
    peakRssBytes = null;
  }
  if (platform() === "win32") {
    cpuUserMs = null;
    cpuSystemMs = null;
    peakRssBytes = null;
  }
  return { cpuUserMs, cpuSystemMs, peakRssBytes };
}

async function main(argv) {
  const jsonMode = argv.includes("--json");
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    console.error("run with --help for usage");
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE.trimEnd());
    process.exit(0);
  }
  if (options.outDir === null) {
    console.error("error: --out-dir is required");
    process.exit(2);
  }
  if (options.scenario !== "behavior") {
    console.error(`error: unknown scenario: ${options.scenario} (only "behavior" exists)`);
    process.exit(2);
  }
  if (!["auto", "playwright", "none"].includes(options.adapter)) {
    console.error(`error: --adapter must be auto|playwright|none, got: ${options.adapter}`);
    process.exit(2);
  }
  if (!["light", "dark"].includes(options.theme)) {
    console.error(`error: --theme must be light|dark, got: ${options.theme}`);
    process.exit(2);
  }

  const outDir = resolve(options.outDir);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (error) {
    console.error(`error: cannot create --out-dir ${options.outDir}: ${error.message}`);
    process.exit(2);
  }

  const commitSha = gitHead();
  if (commitSha === null) {
    console.error("error: cannot resolve the target commit SHA (not a git checkout?)");
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const runId = randomUUID();

  const state = {
    phase: "starting",
    server: null,
    serverPid: null,
    serverPort: null,
    token: randomUUID(),
    logBytes: [],
    logSize: 0,
    logTruncated: false,
    timedOut: false,
    exiting: false,
  };

  const pushLog = (chunk) => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (state.logSize + bytes.length <= MAX_LOG_BYTES) {
      state.logBytes.push(bytes);
      state.logSize += bytes.length;
    } else {
      state.logTruncated = true;
    }
  };

  const cleanup = async () => {
    const cleanupStart = Date.now();
    if (state.server !== null) {
      try {
        state.server.kill("SIGTERM");
      } catch {
        // Already gone.
      }
      const exited = await new Promise((resolve) => {
        if (state.server === null || state.server.exitCode !== null) {
          resolve(true);
          return;
        }
        const timer = setTimeout(() => resolve(false), 2000);
        state.server.once("exit", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      if (!exited && state.serverPid !== null) killTree(state.serverPid);
    }
    const leftovers = [];
    if (state.serverPid !== null && pidAlive(state.serverPid)) {
      killTree(state.serverPid);
      if (!(await pollGone(state.serverPid, 2000))) leftovers.push(state.serverPid);
    }
    return { leftovers, cleanupMs: Date.now() - cleanupStart };
  };

  const installSignalTrap = (writeBlocked) => {
    const trap = (signal, code) => () => {
      if (state.exiting) return;
      state.exiting = true;
      try {
        if (state.serverPid !== null) killTree(state.serverPid);
      } catch {
        // Best effort only.
      }
      try {
        writeBlocked(signal, code);
      } catch {
        // Best effort only; the exit code still reports the signal.
      }
      process.exit(code);
    };
    process.once("SIGTERM", trap("SIGTERM", 143));
    process.once("SIGINT", trap("SIGINT", 130));
  };

  // Requested-vs-expected pre-check: a mismatch is a caller config error and
  // fails before anything is bound or observed.
  const viewportMismatch =
    options.expectedViewport !== null &&
    (options.viewport.width !== options.expectedViewport.width ||
      options.viewport.height !== options.expectedViewport.height);
  const dprMismatch =
    options.expectedDpr !== null && options.dpr !== options.expectedDpr;

  const serverArgs = [
    SERVER_SCRIPT,
    "--port",
    String(options.port),
    "--root",
    resolve(options.root),
    "--token",
    state.token,
    "--commit-sha",
    commitSha,
    "--watch-parent",
    String(process.pid),
  ];
  if (options.serverDelayMs > 0) {
    serverArgs.push("--respond-delay-ms", String(options.serverDelayMs));
  }
  const startCommand = `node ${serverArgs.join(" ")}`;

  const emit = async ({
    status,
    exitCode,
    completeness,
    assertions,
    artifacts,
    environment,
    evidence,
    masking,
    durationMs,
    runError,
  }) => {
    const files = {};
    for (const [name, bytes] of Object.entries(artifacts)) {
      const path = join(outDir, name);
      writeFileSync(path, bytes);
      files[name] = { sha256: sha256Hex(bytes), size: bytes.length };
    }
    const artifactEntries = Object.keys(files).map((name) => ({
      type: name.endsWith(".png")
        ? "screenshot"
        : name.endsWith(".json")
          ? "json"
          : "log",
      path: name,
      sha256: files[name].sha256,
      size_bytes: files[name].size,
    }));
    const duration = durationMs ?? Date.now() - startMs;
    const result = {
      schema_version: 1,
      run_id: runId,
      target: {
        url: `http://127.0.0.1:${state.serverPort ?? options.port}/`,
        commit_sha: commitSha,
        start_command: startCommand,
      },
      environment,
      scenario: { id: options.scenario, kind: "behavior" },
      budgets: { wall_time_ms: options.timeoutMs, peak_rss_mb: 512, max_processes: 8 },
      result: { status, exit_code: exitCode, assertions },
      artifacts: artifactEntries,
      evidence,
      masking,
      started_at: startedAt,
      duration_ms: duration,
      completeness,
    };
    const resources = measureResources();
    const manifest = {
      type: "e2e-run-manifest",
      schema_version: 1,
      run_id: runId,
      scenario: options.scenario,
      adapter: state.adapterInfo ?? { name: options.adapter, available: false },
      server: {
        pid: state.serverPid,
        port: state.serverPort,
        token_matched: state.tokenMatched ?? false,
        identity_verified: state.identityVerified ?? false,
      },
      process_tree: {
        children:
          state.serverPid === null ? [] : [{ pid: state.serverPid, role: "fixture-server" }],
        leftovers: state.leftovers ?? [],
        log_truncated: state.logTruncated,
      },
      resources: {
        wall_ms: duration,
        cpu_user_ms: resources.cpuUserMs,
        cpu_system_ms: resources.cpuSystemMs,
        peak_rss_bytes: resources.peakRssBytes,
        peak_rss_unavailable: resources.peakRssBytes === null,
        child_resources_unavailable: true,
      },
      timeouts: { watchdog_ms: options.timeoutMs, timed_out: state.timedOut },
      outcome: { status, exit_code: exitCode },
      platform: { os: platform(), arch: arch(), node: process.version },
      started_at: startedAt,
    };
    if (runError !== undefined) manifest.error = runError;
    const manifestName = `${runId}.run-manifest.json`;
    writeFileSync(join(outDir, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestBytes = readFileSync(join(outDir, manifestName));
    result.artifacts.push({
      type: "json",
      path: manifestName,
      sha256: sha256Hex(manifestBytes),
      size_bytes: manifestBytes.length,
    });
    const resultPath = join(outDir, "result.json");
    writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

    const validatorArgs = [
      VALIDATOR_SCRIPT,
      "--result",
      resultPath,
      "--artifact-root",
      outDir,
      "--json",
    ];
    if (options.expectedSha !== null) validatorArgs.push("--expected-sha", options.expectedSha);
    if (options.expectedViewport !== null) {
      validatorArgs.push(
        "--expected-viewport",
        `${options.expectedViewport.width}x${options.expectedViewport.height}`,
      );
    }
    if (options.expectedDpr !== null) {
      validatorArgs.push("--expected-dpr", String(options.expectedDpr));
    }
    const validated = spawnSync(process.execPath, validatorArgs, {
      encoding: "utf8",
      timeout: 60000,
    });
    let validatorReport = null;
    try {
      validatorReport = JSON.parse(validated.stdout);
    } catch {
      validatorReport = null;
    }
    return {
      resultPath,
      manifestPath: join(outDir, manifestName),
      validator: validated,
      validatorReport,
    };
  };

  const baseEnvironment = (overrides = {}) => ({
    os: platform(),
    arch: arch(),
    browser: options.browser,
    browser_version: "unavailable",
    viewport: { width: options.viewport.width, height: options.viewport.height },
    dpr: options.dpr,
    locale: options.locale,
    timezone: options.timezone,
    theme: options.theme,
    font_ready: false,
    ...overrides,
  });

  const finish = (out, summary, extra = {}) => {
    const validatorErrors = out.validatorReport?.errors ?? [];
    const validatorWarnings = out.validatorReport?.warnings ?? [];
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            schema_version: 1,
            run_id: runId,
            ...summary,
            validator_errors: validatorErrors,
            validator_warnings: validatorWarnings,
            ...extra,
          },
          null,
          2,
        ),
      );
    } else {
      for (const line of summary.lines ?? []) console.log(line);
      for (const error of validatorErrors) {
        console.log(`validator: error ${error.code} at ${error.path}: ${error.message}`);
      }
      for (const warning of validatorWarnings) {
        console.log(`validator: warning ${warning.code} at ${warning.path}: ${warning.message}`);
      }
      console.log(
        `e2e: ${summary.valid ? "valid" : "invalid"} (validator exit ${out.validator.status}, status ${summary.status})`,
      );
    }
    process.exit(summary.exit);
  };

  // ---- pre-check failures (declared conditions contradict expectations) ----
  if (viewportMismatch || dprMismatch) {
    const which = viewportMismatch
      ? `requested viewport ${options.viewport.width}x${options.viewport.height} does not match --expected-viewport ${options.expectedViewport.width}x${options.expectedViewport.height}`
      : `requested dpr ${options.dpr} does not match --expected-dpr ${options.expectedDpr}`;
    console.error(`error: ${which}`);
    const out = await emit({
      status: "blocked",
      exitCode: 2,
      completeness: "unavailable",
      assertions: [{ id: "declared conditions match expectations", status: "blocked", message: which }],
      artifacts: {},
      environment: baseEnvironment(),
      evidence: { console_errors: 0, network_failures: 0 },
      masking: { applied: false, fields: [] },
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "blocked",
      lines: [`error: ${which}`],
      exit: 2,
      result: out.resultPath,
    });
    return;
  }

  // ---- spawn the owned fixture server (the bind attempt IS the check) ----
  state.phase = "spawning";
  let server;
  try {
    server = spawn(process.execPath, serverArgs, {
      cwd: outDir,
      detached: platform() !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    console.error(`error: cannot spawn the fixture server: ${error.message}`);
    process.exit(2);
  }
  state.server = server;
  state.serverPid = server.pid ?? null;
  let serverExit = null;
  server.on("exit", (code, signal) => {
    serverExit = { code, signal };
  });
  server.stdout.on("data", pushLog);
  server.stderr.on("data", pushLog);

  installSignalTrap((signal, code) => {
    const logBytes = Buffer.concat(state.logBytes);
    try {
      writeFileSync(join(outDir, `${runId}.server.log`), logBytes);
    } catch {
      // Best effort only.
    }
    const blocked = {
      schema_version: 1,
      run_id: runId,
      target: {
        url: `http://127.0.0.1:${state.serverPort ?? options.port}/`,
        commit_sha: commitSha,
        start_command: startCommand,
      },
      environment: baseEnvironment(),
      scenario: { id: options.scenario, kind: "behavior" },
      budgets: { wall_time_ms: options.timeoutMs, peak_rss_mb: 512, max_processes: 8 },
      result: {
        status: "blocked",
        exit_code: code,
        assertions: [{ id: "run interrupted", status: "blocked", message: `caught ${signal}` }],
      },
      artifacts: [],
      evidence: { console_errors: 0, network_failures: 0 },
      masking: { applied: false, fields: [] },
      started_at: startedAt,
      duration_ms: Date.now() - startMs,
      completeness: "partial",
    };
    try {
      writeFileSync(join(outDir, "result.json"), `${JSON.stringify(blocked, null, 2)}\n`);
    } catch {
      // Best effort only; the exit code still reports the signal.
    }
  });

  const watchdog = setTimeout(() => {
    state.timedOut = true;
    if (state.activeRequest !== null) {
      try {
        state.activeRequest.destroy();
      } catch {
        // Already settled.
      }
    }
    if (state.serverPid !== null) killTree(state.serverPid);
  }, options.timeoutMs);

  const failResult = async ({ status, exitCode, completeness, assertions, evidence, environment, masking, runError }) => {
    clearTimeout(watchdog);
    const { leftovers } = await cleanup();
    state.leftovers = leftovers;
    const logBytes = Buffer.concat(state.logBytes);
    const out = await emit({
      status,
      exitCode,
      completeness,
      assertions,
      artifacts: { [`${runId}.server.log`]: logBytes },
      environment: environment ?? baseEnvironment(),
      evidence: evidence ?? { console_errors: 0, network_failures: 0 },
      masking: masking ?? { applied: false, fields: [] },
      runError,
    });
    return out;
  };

  // ---- wait for the ready line, then verify the bound identity ----
  state.phase = "binding";
  let readyPort = null;
  const readyDeadlineNote = "fixture server did not become ready";
  while (readyPort === null) {
    if (state.timedOut) break;
    if (serverExit !== null) break;
    const text = Buffer.concat(state.logBytes).toString("utf8");
    const match = /ready pid=(\d+) port=(\d+)/.exec(text);
    if (match !== null && Number(match[1]) === state.serverPid) {
      readyPort = Number(match[2]);
      break;
    }
    await sleepMs(50);
  }

  if (readyPort === null && !state.timedOut && serverExit !== null) {
    clearTimeout(watchdog);
    const logText = Buffer.concat(state.logBytes).toString("utf8");
    const conflict = /EADDRINUSE|address already in use/i.test(logText);
    const { leftovers } = await cleanup();
    state.leftovers = leftovers;
    if (conflict) {
      const out = await emit({
        status: "blocked",
        exitCode: 2,
        completeness: "unavailable",
        assertions: [
          {
            id: "fixture server bind",
            status: "blocked",
            message: `port ${options.port === 0 ? "(ephemeral)" : options.port} is occupied; refusing to attach to a foreign server`,
          },
        ],
        artifacts: { [`${runId}.server.log`]: Buffer.concat(state.logBytes) },
        environment: baseEnvironment(),
        evidence: { console_errors: 0, network_failures: 0 },
        masking: { applied: false, fields: [] },
        runError: readyDeadlineNote,
      });
      console.error(`error: fixture port is occupied; refusing to attach elsewhere`);
      finish(out, {
        valid: out.validator.status === 0,
        status: "blocked",
        lines: [`error: fixture port is occupied; refusing to attach elsewhere`],
        exit: 2,
        result: out.resultPath,
      });
      return;
    }
    const out = await emit({
      status: "failed",
      exitCode: 1,
      completeness: "partial",
      assertions: [
        { id: "fixture server start", status: "failed", message: `server exited before becoming ready` },
      ],
      artifacts: { [`${runId}.server.log`]: Buffer.concat(state.logBytes) },
      environment: baseEnvironment(),
      evidence: { console_errors: 0, network_failures: 0 },
      masking: { applied: false, fields: [] },
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "failed",
      lines: [`error: fixture server exited before becoming ready`],
      exit: 1,
      result: out.resultPath,
    });
    return;
  }

  if (state.timedOut || readyPort === null) {
    const out = await failResult({
      status: "failed",
      exitCode: 124,
      completeness: "partial",
      assertions: [{ id: "scenario watchdog", status: "failed", message: `exceeded ${options.timeoutMs}ms` }],
      runError: "watchdog timeout",
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "failed",
      lines: [`error: run timed out after ${options.timeoutMs}ms`],
      exit: 1,
      result: out.resultPath,
    });
    return;
  }

  state.serverPort = readyPort;
  console.error(`server: pid=${state.serverPid} port=${state.serverPort}`);
  state.phase = "verifying";

  let identity = null;
  while (identity === null) {
    if (state.timedOut) break;
    if (serverExit !== null) break;
    try {
      identity = await fetchJson(
        `http://127.0.0.1:${readyPort}/__identity`,
        2000,
        (request) => {
          state.activeRequest = request;
        },
      );
      break;
    } catch {
      state.activeRequest = null;
      await sleepMs(100);
    }
  }
  state.activeRequest = null;

  if (
    identity === null ||
    identity.token !== state.token ||
    identity.commitSha !== commitSha ||
    identity.pid !== state.serverPid
  ) {
    const out = await failResult({
      status: "failed",
      exitCode: state.timedOut ? 124 : 1,
      completeness: "partial",
      assertions: [
        {
          id: "server identity binding",
          status: "failed",
          message: state.timedOut
            ? `identity check exceeded ${options.timeoutMs}ms`
            : "bound server identity does not match",
        },
      ],
      runError: state.timedOut ? "watchdog timeout" : "identity mismatch",
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "failed",
      lines: [`error: fixture server identity check failed`],
      exit: 1,
      result: out.resultPath,
    });
    return;
  }

  state.tokenMatched = true;
  state.identityVerified = true;
  state.phase = "scenario";

  // ---- adapter selection ----
  let adapterName = options.adapter;
  let adapterInfo = { name: adapterName, available: false };
  if (adapterName === "auto" || adapterName === "playwright") {
    const { detectPlaywright } = await import("./e2e-runner/playwright-adapter.mjs");
    const detected = detectPlaywright();
    if (adapterName === "playwright" && !detected.available) {
      clearTimeout(watchdog);
      console.error(`error: --adapter playwright was requested but ${detected.reason}`);
      process.exit(2);
    }
    if (detected.available) {
      adapterName = "playwright";
      adapterInfo = { name: "playwright", available: true, version: detected.version };
    } else {
      adapterName = "none";
      adapterInfo = { name: "none", available: false, reason: detected.reason };
    }
  } else {
    adapterInfo = { name: "none", available: false, reason: "browser adapter disabled by --adapter none" };
  }
  state.adapterInfo = adapterInfo;

  if (adapterName === "none") {
    clearTimeout(watchdog);
    const { leftovers } = await cleanup();
    state.leftovers = leftovers;
    const logBytes = Buffer.concat(state.logBytes);
    const out = await emit({
      status: "unavailable",
      exitCode: 2,
      completeness: "unavailable",
      assertions: [],
      artifacts: { [`${runId}.server.log`]: logBytes },
      environment: baseEnvironment(),
      evidence: { console_errors: 0, network_failures: 0, stdout_ref: `${runId}.server.log` },
      masking: { applied: false, fields: [] },
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "unavailable",
      lines: [
        `server: pid=${state.serverPid} port=${state.serverPort} (identity verified)`,
        `browser: unavailable (${adapterInfo.reason ?? "no browser adapter"})`,
      ],
      exit: 1,
      result: out.resultPath,
    });
    return;
  }

  // ---- playwright behavior scenario ----
  state.phase = "browser";
  const remaining = Math.max(1000, Math.min(30000, options.timeoutMs - (Date.now() - startMs)));
  const { runBehaviorScenario } = await import("./e2e-runner/playwright-adapter.mjs");
  const screenshotName = `${runId}.screenshot.png`;
  const observationsName = `${runId}.observations.json`;
  let observations = null;
  let observationError = null;
  try {
    observations = await runBehaviorScenario({
      url: `http://127.0.0.1:${state.serverPort}/`,
      viewport: options.viewport,
      dpr: options.dpr,
      locale: options.locale,
      timezone: options.timezone,
      theme: options.theme,
      opTimeoutMs: remaining,
      screenshotPath: join(outDir, screenshotName),
    });
  } catch (error) {
    observationError = error;
  }

  clearTimeout(watchdog);
  const { leftovers } = await cleanup();
  state.leftovers = leftovers;
  const logBytes = Buffer.concat(state.logBytes);

  if (state.timedOut || observations === null) {
    const out = await emit({
      status: "failed",
      exitCode: state.timedOut ? 124 : 1,
      completeness: "partial",
      assertions: [
        {
          id: "behavior scenario",
          status: "failed",
          message: state.timedOut
            ? `exceeded ${options.timeoutMs}ms`
            : `browser run failed: ${observationError?.message ?? "unknown error"}`,
        },
      ],
      artifacts: { [`${runId}.server.log`]: logBytes },
      environment: baseEnvironment({
        browser_version: adapterInfo.version ?? "unavailable",
      }),
      evidence: { console_errors: 0, network_failures: 0, stdout_ref: `${runId}.server.log` },
      masking: { applied: false, fields: [] },
      runError: state.timedOut ? "watchdog timeout" : undefined,
    });
    finish(out, {
      valid: out.validator.status === 0,
      status: "failed",
      lines: [`error: behavior scenario did not complete`],
      exit: 1,
      result: out.resultPath,
    });
    return;
  }

  const assertionList = [
    {
      id: "page loads with http 200",
      status: observations.httpStatus === 200 ? "passed" : "failed",
      message: `http ${observations.httpStatus}`,
    },
    {
      id: "ready marker present",
      status: observations.heading !== null ? "passed" : "failed",
    },
    {
      id: "action flips status",
      status: observations.statusAfterClick === "done" ? "passed" : "failed",
      message: `status text: ${observations.statusAfterClick}`,
    },
  ];
  const allPassed = assertionList.every((item) => item.status === "passed");
  const observationsBytes = Buffer.from(`${JSON.stringify(observations, null, 2)}\n`);
  const screenshotBytes = readFileSync(join(outDir, screenshotName));
  const out = await emit({
    status: allPassed ? "passed" : "failed",
    exitCode: allPassed ? 0 : 1,
    completeness: "complete",
    assertions: assertionList,
    artifacts: {
      [`${runId}.server.log`]: logBytes,
      [screenshotName]: screenshotBytes,
      [observationsName]: observationsBytes,
    },
    environment: baseEnvironment({
      browser_version: adapterInfo.version ?? "unavailable",
      font_ready: observations.fontReady,
    }),
    evidence: {
      console_errors: observations.consoleErrors,
      network_failures: observations.networkFailures,
      stdout_ref: `${runId}.server.log`,
    },
    masking: { applied: false, fields: [] },
  });
  finish(out, {
    valid: out.validator.status === 0,
    status: allPassed ? "passed" : "failed",
    lines: [
      `server: pid=${state.serverPid} port=${state.serverPort} (identity verified)`,
      `browser: chromium ${adapterInfo.version ?? ""} (${observations.wallMs}ms)`,
    ],
    exit: allPassed && out.validator.status === 0 ? 0 : 1,
    result: out.resultPath,
  });
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`error: runner failed: ${error?.message ?? error}`);
  process.exit(1);
});
