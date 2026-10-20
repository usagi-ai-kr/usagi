import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import net from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, appendFileSync, writeFileSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const runnerPath = fileURLToPath(new URL("./e2e-runner.mjs", import.meta.url));
const validatorPath = fileURLToPath(new URL("./validate-e2e-result.mjs", import.meta.url));
const repoRoot = join(dirname(runnerPath), "..");
const tempDirs = [];
const holders = [];

after(() => {
  for (const server of holders) {
    try {
      server.close();
    } catch {
      // Already closed; cleanup is best effort.
    }
  }
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function runRunner(args = [], options = {}) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    encoding: "utf8",
    timeout: 120000,
    cwd: repoRoot,
    ...options,
  });
}

function runValidator(args = []) {
  return spawnSync(process.execPath, [validatorPath, ...args], {
    encoding: "utf8",
    timeout: 60000,
    cwd: repoRoot,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function gitHead() {
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

function waitFor(predicate, timeoutMs, intervalMs = 50) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      let done = false;
      try {
        done = predicate();
      } catch {
        done = false;
      }
      if (done || Date.now() - start > timeoutMs) resolve(done);
      else setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function occupyPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    holders.push(server);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function canBind(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.on("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => {
      probe.close(() => resolve(true));
    });
  });
}

test("browser-free lifecycle emits a validator-clean unavailable result", async () => {
  const outDir = makeTemp("e2e-unavail-");
  const run = runRunner(["--out-dir", outDir, "--adapter", "none", "--json"]);
  assert.equal(run.status, 1);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.valid, true);
  assert.equal(summary.status, "unavailable");
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "unavailable");
  assert.equal(result.target.commit_sha, gitHead());
  assert.ok(Array.isArray(result.artifacts) && result.artifacts.length > 0);

  const head = gitHead();
  const check = runValidator([
    "--result",
    join(outDir, "result.json"),
    "--expected-sha",
    head,
    "--expected-viewport",
    "1280x720",
    "--expected-dpr",
    "1",
    "--artifact-root",
    outDir,
  ]);
  assert.equal(check.status, 0);

  const manifest = readJson(join(outDir, `${summary.run_id}.run-manifest.json`));
  assert.deepEqual(manifest.leftovers ?? manifest.process_tree?.leftovers, []);
  assert.ok(!pidAlive(manifest.server.pid), "fixture server must not survive a normal run");
});

test("occupied port fails closed without touching the foreign server", async () => {
  const { server: holder, port } = await occupyPort();
  assert.ok(holder.listening);
  const outDir = makeTemp("e2e-conflict-");
  const run = runRunner(["--out-dir", outDir, "--port", String(port), "--adapter", "none"]);
  assert.equal(run.status, 2);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "blocked");
  assert.notEqual(result.result.exit_code, 0);
  assert.ok(result.target.url.includes(String(port)));
  assert.ok(
    result.artifacts.every((item) => item.type === "log" || item.type === "json"),
    "no foreign-rendered evidence may be recorded",
  );
  assert.ok(holder.listening, "the occupying server must be untouched");
  const check = runValidator(["--result", join(outDir, "result.json"), "--artifact-root", outDir]);
  assert.equal(check.status, 0);
});

test("commit SHA mismatch is rejected through the embedded validator", () => {
  const outDir = makeTemp("e2e-sha-");
  const run = runRunner([
    "--out-dir",
    outDir,
    "--adapter",
    "none",
    "--expected-sha",
    "0".repeat(40),
  ]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /sha_mismatch/);
});

test("requested viewport/DPR must match expectations before binding", () => {
  const outDir = makeTemp("e2e-viewport-");
  const viewport = runRunner([
    "--out-dir",
    outDir,
    "--adapter",
    "none",
    "--viewport",
    "800x600",
    "--expected-viewport",
    "1280x720",
  ]);
  assert.equal(viewport.status, 2);
  assert.match(viewport.stderr, /viewport/);
  const blocked = readJson(join(outDir, "result.json"));
  assert.equal(blocked.result.status, "blocked");

  const dpr = runRunner([
    "--out-dir",
    makeTemp("e2e-dpr-"),
    "--adapter",
    "none",
    "--dpr",
    "2",
    "--expected-dpr",
    "1",
  ]);
  assert.equal(dpr.status, 2);
});

test("watchdog timeout kills the tree and records failed partial", async () => {
  const outDir = makeTemp("e2e-timeout-");
  const run = runRunner([
    "--out-dir",
    outDir,
    "--adapter",
    "none",
    "--timeout-ms",
    "500",
    "--server-delay-ms",
    "5000",
    "--json",
  ]);
  assert.equal(run.status, 1);
  const summary = JSON.parse(run.stdout);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "failed");
  assert.equal(result.completeness, "partial");
  const manifest = readJson(join(outDir, `${summary.run_id}.run-manifest.json`));
  assert.ok(!pidAlive(manifest.server.pid), "timed-out server must be reaped");
  assert.ok(await canBind(manifest.server.port), "timed-out port must be free again");
});

test("external server death fails the run without leftovers", async () => {
  const outDir = makeTemp("e2e-exception-");
  const child = spawn(
    process.execPath,
    [runnerPath, "--out-dir", outDir, "--adapter", "none", "--server-delay-ms", "5000", "--json"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverPid = null;
  let serverPort = null;
  let output = "";
  const watchOutput = (chunk) => {
    output += chunk.toString();
    const match = /server: pid=(\d+) port=(\d+)/.exec(output);
    if (match !== null) {
      serverPid = Number(match[1]);
      serverPort = Number(match[2]);
    }
  };
  child.stdout.on("data", watchOutput);
  child.stderr.on("data", watchOutput);
  assert.ok(await waitFor(() => serverPid !== null, 10000), "runner must report the server pid");
  process.kill(serverPid, "SIGKILL");
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 1);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "failed");
  assert.ok(!pidAlive(serverPid), "killed server must stay dead");
});

test("SIGTERM cleans up and records blocked", async () => {
  const outDir = makeTemp("e2e-signal-");
  const child = spawn(
    process.execPath,
    [runnerPath, "--out-dir", outDir, "--adapter", "none", "--server-delay-ms", "10000", "--json"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverPid = null;
  let serverPort = null;
  let output = "";
  const watchOutput = (chunk) => {
    output += chunk.toString();
    const match = /server: pid=(\d+) port=(\d+)/.exec(output);
    if (match !== null) {
      serverPid = Number(match[1]);
      serverPort = Number(match[2]);
    }
  };
  child.stdout.on("data", watchOutput);
  child.stderr.on("data", watchOutput);
  assert.ok(await waitFor(() => serverPid !== null, 10000), "runner must report the server pid");
  process.kill(child.pid, "SIGTERM");
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 143);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "blocked");
  assert.ok(!pidAlive(serverPid), "server must not survive SIGTERM");
});

test("parent death reaps the owned server", async (t) => {
  if (platform() === "win32") {
    t.skip("parent-watch reaping is POSIX-only");
    return;
  }
  const outDir = makeTemp("e2e-orphan-");
  const child = spawn(
    process.execPath,
    [runnerPath, "--out-dir", outDir, "--adapter", "none", "--server-delay-ms", "30000", "--json"],
    { cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  child.unref();
  let serverPid = null;
  let serverPort = null;
  let output = "";
  const watchOutput = (chunk) => {
    output += chunk.toString();
    const match = /server: pid=(\d+) port=(\d+)/.exec(output);
    if (match !== null) {
      serverPid = Number(match[1]);
      serverPort = Number(match[2]);
    }
  };
  child.stdout.on("data", watchOutput);
  child.stderr.on("data", watchOutput);
  assert.ok(await waitFor(() => serverPid !== null, 10000), "runner must report the server pid");
  assert.ok(serverPort !== null, "runner must report the server port");
  process.kill(child.pid, "SIGKILL");
  assert.ok(
    await waitFor(() => !pidAlive(serverPid), 10000),
    "server must self-reap after parent death",
  );
  assert.ok(await canBind(serverPort), "orphaned port must be free again");
});

test("missing artifact is rejected when the evidence is rechecked", () => {
  const outDir = makeTemp("e2e-artifact-");
  const run = runRunner(["--out-dir", outDir, "--adapter", "none"]);
  assert.equal(run.status, 1);
  const result = readJson(join(outDir, "result.json"));
  assert.ok(result.artifacts.length > 0);
  const first = result.artifacts[0];
  rmSync(join(outDir, first.path));
  const check = runValidator(["--result", join(outDir, "result.json"), "--artifact-root", outDir]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /artifact_missing/);
});

test("tampered artifact is rejected when the evidence is rechecked", () => {
  const outDir = makeTemp("e2e-tamper-");
  const run = runRunner(["--out-dir", outDir, "--adapter", "none"]);
  assert.equal(run.status, 1);
  const result = readJson(join(outDir, "result.json"));
  const logged = result.artifacts.find((item) => item.type === "log");
  assert.ok(logged, "a server log artifact must exist");
  appendFileSync(join(outDir, logged.path), "tampered\n");
  const check = runValidator(["--result", join(outDir, "result.json"), "--artifact-root", outDir]);
  assert.equal(check.status, 1);
  assert.match(check.stdout, /artifact_(size|hash)_mismatch/);
});

test("outside a git checkout the runner fails honestly", () => {
  const outside = makeTemp("e2e-nogit-");
  const run = runRunner(["--out-dir", makeTemp("e2e-nogit-out-"), "--adapter", "none"], {
    cwd: outside,
  });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /HEAD|git/i);
});

test("browser behavior runs when Playwright exists, otherwise the request fails closed", () => {
  const probe = spawnSync(process.execPath, ["-e", "require.resolve('playwright')"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const outDir = makeTemp("e2e-browser-");
  if (probe.status !== 0) {
    const run = runRunner(["--out-dir", outDir, "--adapter", "playwright"]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /playwright/i);
    return;
  }
  const run = runRunner(["--out-dir", outDir, "--adapter", "playwright", "--json"]);
  assert.equal(run.status, 0);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.valid, true);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "passed");
});

function makeFakeDriver({ version, executable }) {
  const base = makeTemp("e2e-fakedriver-");
  const pkgDir = join(base, "node_modules", "playwright");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({ name: "playwright", version, main: "index.js" }),
  );
  writeFileSync(
    join(pkgDir, "index.js"),
    [
      "const exe = process.env.FAKE_PW_EXE;",
      "module.exports.chromium = {",
      "  executablePath: () => exe,",
      "  launch: async () => { throw new Error(`Executable doesn't exist at ${exe}`); },",
      "};",
      "",
    ].join("\n"),
  );
  return base;
}

function runWithBases(args, bases, extraEnv = {}) {
  const sep = process.platform === "win32" ? ";" : ":";
  return runRunner(args, {
    env: { ...process.env, E2E_RUNNER_RUNTIME_DIRS: bases.join(sep), ...extraEnv },
  });
}

test("package present but browser absent is unavailable, not failed", () => {
  const base = makeFakeDriver({ version: "1.64.1" });
  const outDir = makeTemp("e2e-nobrowser-");
  const result = runWithBases(
    ["--out-dir", outDir, "--json"],
    [base],
    { FAKE_PW_EXE: join(base, "no-such-chrome") },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "unavailable");
  assert.match(JSON.stringify(report), /executable absent/);
});

test("pinned version mismatch is unavailable", () => {
  const base = makeFakeDriver({ version: "2.0.0" });
  const outDir = makeTemp("e2e-pinmismatch-");
  const result = runWithBases(
    ["--out-dir", outDir, "--json"],
    [base],
    { FAKE_PW_EXE: join(base, "no-such-chrome") },
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /pinned|major/i);
});

test("missing-executable launch failure is unavailable, not failed", () => {
  const base = makeFakeDriver({ version: "1.64.1" });
  const realFile = join(base, "real-file.txt");
  writeFileSync(realFile, "x");
  const outDir = makeTemp("e2e-launchmiss-");
  const result = runWithBases(
    ["--out-dir", outDir, "--adapter", "playwright", "--json"],
    [base],
    { FAKE_PW_EXE: realFile },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "unavailable");
});

test("browser failure captures screenshot, trace and logs", async (t) => {
  const probe = spawnSync(process.execPath, ["-e", "require.resolve('playwright')"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (probe.status !== 0) {
    t.skip("playwright not installed; failure capture needs a real browser");
    return;
  }
  const outDir = makeTemp("e2e-failcap-");
  const brokenRoot = makeTemp("e2e-brokenroot-");
  mkdirSync(join(brokenRoot, "public"), { recursive: true });
  writeFileSync(
    join(brokenRoot, "public", "index.html"),
    "<!doctype html><html><head><title>broken</title></head><body><p>no marker</p></body></html>\n",
  );
  const run = runRunner([
    "--out-dir",
    outDir,
    "--adapter",
    "playwright",
    "--root",
    join(brokenRoot, "public"),
    "--timeout-ms",
    "15000",
    "--json",
  ]);
  assert.equal(run.status, 1);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.valid, true);
  const result = readJson(join(outDir, "result.json"));
  assert.equal(result.result.status, "failed");
  const kinds = new Set(result.artifacts.map((item) => item.type));
  assert.ok(kinds.has("screenshot"), "failure screenshot must be bound");
  assert.ok(kinds.has("trace"), "failure trace must be bound");
  assert.ok(kinds.has("log"), "server log must be bound");
  for (const item of result.artifacts) {
    const bytes = readFileSync(join(outDir, item.path));
    assert.equal(bytes.length, item.size_bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      item.sha256,
    );
  }
});

test("manifest carries validator codes and runner resource scope", () => {
  const outDir = makeTemp("e2e-manifestmeta-");
  const run = runRunner([
    "--out-dir",
    outDir,
    "--adapter",
    "none",
    "--expected-sha",
    "0".repeat(40),
    "--json",
  ]);
  assert.equal(run.status, 1);
  const summary = JSON.parse(run.stdout);
  const manifest = readJson(join(outDir, `${summary.run_id}.run-manifest.json`));
  assert.ok(manifest.validation.errors.includes("sha_mismatch"));
  assert.equal(manifest.resources.scope, "runner");
});

test("signal path binds the server log artifact", async () => {
  const outDir = makeTemp("e2e-signalbind-");
  const child = spawn(
    process.execPath,
    [runnerPath, "--out-dir", outDir, "--adapter", "none", "--server-delay-ms", "10000"],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let serverPid = null;
  const watch = (chunk) => {
    const match = /server: pid=(\d+) port=(\d+)/.exec(chunk.toString());
    if (match !== null) serverPid = Number(match[1]);
  };
  child.stdout.on("data", watch);
  child.stderr.on("data", watch);
  assert.ok(await waitFor(() => serverPid !== null, 10000), "runner must report the server pid");
  process.kill(child.pid, "SIGTERM");
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exitCode, 143);
  const result = readJson(join(outDir, "result.json"));
  const logged = result.artifacts.find((item) => item.type === "log");
  assert.ok(logged, "signal result must bind the server log");
  const bytes = readFileSync(join(outDir, logged.path));
  assert.equal(bytes.length, logged.size_bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), logged.sha256);
});
