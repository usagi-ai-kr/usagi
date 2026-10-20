import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const runnerPath = fileURLToPath(new URL("./run-command.mjs", import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeOutDir(prefix = "run-command-out-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function run(args = [], options = {}) {
  return spawnSync(process.execPath, [runnerPath, ...args], {
    encoding: "utf8",
    timeout: 60000,
    ...options,
  });
}

function argvOf(...parts) {
  return JSON.stringify(parts);
}

const ENVELOPE_FIELDS = [
  "schema_version",
  "run_id",
  "command",
  "cwd",
  "env_fingerprint",
  "started_at",
  "duration_ms",
  "exit_code",
  "signal",
  "timed_out",
  "stdout_truncated",
  "stderr_truncated",
  "stdout_ref",
  "stderr_ref",
  "artifacts",
  "completeness",
  "redactions",
];

function assertEnvelopeShape(envelope) {
  for (const field of ENVELOPE_FIELDS) {
    assert.ok(field in envelope, `envelope must include ${field}`);
  }
  assert.equal(envelope.schema_version, 1);
  assert.equal(typeof envelope.run_id, "string");
  assert.ok(envelope.run_id.length > 0);
  for (const field of ["os", "arch", "node"]) {
    assert.ok(field in envelope.env_fingerprint, `env_fingerprint must include ${field}`);
  }
}

test("success captures stdout and reports exit 0", () => {
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "console.log('ok')"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  assertEnvelopeShape(envelope);
  assert.equal(envelope.exit_code, 0);
  assert.equal(envelope.timed_out, false);
  assert.equal(envelope.completeness, "complete");
  assert.equal(envelope.stdout_truncated, false);
  assert.equal(envelope.stderr_truncated, false);
  assert.ok(envelope.stdout_ref.startsWith(outDir));
  assert.ok(envelope.stderr_ref.startsWith(outDir));
  const stdout = readFileSync(envelope.stdout_ref, "utf8");
  assert.match(stdout, /ok/);
});

test("nonzero command exit reports exit_code 3 with completeness complete", () => {
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "process.exit(3)"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(result.status, 1);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.exit_code, 3);
  assert.equal(envelope.completeness, "complete");
  assert.equal(envelope.timed_out, false);
});

test("timeout kills the process tree and exits 124 with partial completeness", () => {
  const outDir = makeOutDir();
  const started = Date.now();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "setTimeout(() => {}, 60000)"),
    "--out-dir",
    outDir,
    "--timeout-ms",
    "300",
    "--json",
  ]);
  const elapsed = Date.now() - started;
  assert.equal(result.status, 124);
  assert.ok(elapsed < 30000, `runner must not wait out the child (took ${elapsed}ms)`);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.timed_out, true);
  assert.equal(envelope.completeness, "partial");
  assert.ok(envelope.duration_ms >= 250, `duration reflects the timeout, got ${envelope.duration_ms}`);
});

test("missing executable exits 2 with completeness unavailable", () => {
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf("definitely-not-a-real-binary-xyz", "--version"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.completeness, "unavailable");
  assert.equal(typeof envelope.error, "string");
});

test("invalid argv-json and missing args exit 2", () => {
  const outDir = makeOutDir();
  assert.equal(run([]).status, 2);
  assert.equal(run(["--out-dir", outDir]).status, 2);
  assert.equal(
    run(["--argv-json", argvOf(process.execPath, "-e", "1"), "--bogus"]).status,
    2,
  );
  assert.equal(run(["--argv-json", "not json", "--out-dir", outDir]).status, 2);
  assert.equal(run(["--argv-json", "{}", "--out-dir", outDir]).status, 2);
  assert.equal(run(["--argv-json", "[]", "--out-dir", outDir]).status, 2);
  assert.equal(run(["--argv-json", '[""]', "--out-dir", outDir]).status, 2);
  assert.equal(
    run([
      "--argv-json",
      argvOf(process.execPath, "-e", "1"),
      "--out-dir",
      outDir,
      "--timeout-ms",
      "abc",
    ]).status,
    2,
  );
  for (const value of ["0", "-5", "1.5", "abc"]) {
    assert.equal(
      run([
        "--argv-json",
        argvOf(process.execPath, "-e", "1"),
        "--out-dir",
        outDir,
        "--max-output-bytes",
        value,
      ]).status,
      2,
      `--max-output-bytes ${value} must exit 2`,
    );
  }
});

test("cwd with spaces and Korean works", () => {
  const spaced = mkdtempSync(join(tmpdir(), "공백 dir-"));
  tempDirs.push(spaced);
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "console.log(process.cwd())"),
    "--out-dir",
    outDir,
    "--cwd",
    spaced,
    "--json",
  ]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.cwd, spaced);
  assert.match(readFileSync(envelope.stdout_ref, "utf8"), /공백 dir-/);
});

test("--redact literal and secret-looking env value are replaced", () => {
  const outDir = makeOutDir();
  const secret = "s3cr3t-value-9z";
  const literal = "literal-code-42";
  const result = run(
    [
      "--argv-json",
      argvOf(
        process.execPath,
        "-e",
        `console.log("${secret}");console.error("${literal}")`,
      ),
      "--out-dir",
      outDir,
      "--redact",
      literal,
      "--json",
    ],
    { env: { ...process.env, MY_TEST_TOKEN: secret } },
  );
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  // The redactions list carries identifiers, never secret values.
  // (Ambient secret-looking env vars such as STARSHIP_SESSION_KEY may also
  // appear, so assert inclusion rather than exact equality.)
  assert.ok(envelope.redactions.includes("env:MY_TEST_TOKEN"));
  assert.ok(envelope.redactions.includes("literal:1"));
  assert.ok(!JSON.stringify(envelope).includes(secret), "no raw secret anywhere in the envelope");
  assert.ok(!JSON.stringify(envelope).includes(literal), "no raw literal anywhere in the envelope");
  assert.ok(!("MY_TEST_TOKEN" in envelope.env_fingerprint));
  const stdout = readFileSync(envelope.stdout_ref, "utf8");
  const stderr = readFileSync(envelope.stderr_ref, "utf8");
  assert.ok(!stdout.includes(secret), "secret value must not remain in stdout file");
  assert.ok(!stderr.includes(literal), "redact literal must not remain in stderr file");
  assert.match(stdout, /\[REDACTED\]/);
  assert.match(stderr, /\[REDACTED\]/);
  assert.ok(!result.stdout.includes(secret), "secret value must not leak into the report");
});

test("--json output parses with stable fields and human output stays plain", () => {
  const outDir = makeOutDir();
  const jsonResult = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "console.log('hi')"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(jsonResult.status, 0);
  const envelope = JSON.parse(jsonResult.stdout);
  assertEnvelopeShape(envelope);

  const humanDir = makeOutDir();
  const human = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "console.log('hi')"),
    "--out-dir",
    humanDir,
  ]);
  assert.equal(human.status, 0);
  assert.ok(!human.stdout.includes('"schema_version"'), "human output must not embed the JSON envelope");
  assert.match(human.stdout, /^run /m);
  assert.match(human.stdout, /exit 0/m);
});

test("output files exist and sizes match non-empty output", () => {
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "console.log('0123456789');console.error('abc')"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  for (const ref of [envelope.stdout_ref, envelope.stderr_ref]) {
    const stats = statSync(ref);
    assert.ok(stats.isFile());
    assert.ok(stats.size > 0, `${ref} must be non-empty`);
  }
  const stdoutBytes = Buffer.byteLength(readFileSync(envelope.stdout_ref, "utf8"));
  assert.equal(statSync(envelope.stdout_ref).size, stdoutBytes);
});

test("--help exits 0 and documents the flags", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  for (const flag of ["--argv-json", "--out-dir", "--cwd", "--timeout-ms", "--max-output-bytes", "--redact", "--json"]) {
    assert.ok(result.stdout.includes(flag), `help must document ${flag}`);
  }
});

const FAKE_SECRET = "REVIEW_FAKE_SECRET_63";

function assertNoSecret(output, label) {
  assert.ok(!output.includes(FAKE_SECRET), `${label} must not expose the secret`);
}

test("--redact literal printed from argv stays out of JSON and human reports", () => {
  const jsonDir = makeOutDir();
  const jsonResult = run([
    "--argv-json",
    argvOf(process.execPath, "-e", `console.log("${FAKE_SECRET}")`),
    "--out-dir",
    jsonDir,
    "--redact",
    FAKE_SECRET,
    "--json",
  ]);
  assert.equal(jsonResult.status, 0);
  const envelope = JSON.parse(jsonResult.stdout);
  assert.ok(envelope.redactions.includes("literal:1"));
  assert.ok(!envelope.redactions.some((entry) => entry.includes(FAKE_SECRET)));
  assertNoSecret(jsonResult.stdout, "JSON report");
  assertNoSecret(readFileSync(envelope.stdout_ref, "utf8"), "stdout file");
  assert.ok(readFileSync(envelope.stdout_ref, "utf8").includes("[REDACTED]"));

  const humanDir = makeOutDir();
  const human = run([
    "--argv-json",
    argvOf(process.execPath, "-e", `console.log("${FAKE_SECRET}")`),
    "--out-dir",
    humanDir,
    "--redact",
    FAKE_SECRET,
  ]);
  assert.equal(human.status, 0);
  assertNoSecret(human.stdout, "human report");
  const logs = readdirSync(humanDir).filter((name) => name.endsWith(".stdout.log"));
  assert.equal(logs.length, 1);
  assertNoSecret(readFileSync(join(humanDir, logs[0]), "utf8"), "human-mode stdout file");
});

test("usage failure echoing argv-json stays free of the secret", () => {
  // V8 quotes part of the input in JSON syntax errors, so the runner must
  // redact usage/config messages too. Covers --json and human (stderr) paths.
  const outDir = makeOutDir();
  const badArgv = `{"oops": "${FAKE_SECRET}"}`;
  const jsonResult = run([
    "--redact",
    FAKE_SECRET,
    "--argv-json",
    badArgv,
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(jsonResult.status, 2);
  assertNoSecret(jsonResult.stdout, "JSON usage error");

  const human = run(["--redact", FAKE_SECRET, "--argv-json", badArgv, "--out-dir", outDir]);
  assert.equal(human.status, 2);
  assertNoSecret(human.stderr, "human usage error");
});

test("output directory failure reports unavailable without leaking the secret", () => {
  // A file component inside --out-dir makes mkdir fail; the echoed path may
  // carry a secret and must be redacted.
  const blocker = join(makeOutDir(), "blocker");
  writeFileSync(blocker, "x");
  const badDir = join(blocker, `sub-${FAKE_SECRET}`);
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "1"),
    "--out-dir",
    badDir,
    "--redact",
    FAKE_SECRET,
    "--json",
  ]);
  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.completeness, "unavailable");
  assertNoSecret(result.stdout, "out-dir failure report");
});

test("--timeout-ms outside the setTimeout range is rejected with exit 2", () => {
  const outDir = makeOutDir();
  for (const value of ["2147483648", "0", "-1", "1.5", "abc"]) {
    const result = run([
      "--argv-json",
      argvOf(process.execPath, "-e", "1"),
      "--out-dir",
      outDir,
      "--timeout-ms",
      value,
      "--json",
    ]);
    assert.equal(result.status, 2, `--timeout-ms ${value} must exit 2`);
  }
});

test("large output is truncated at the cap and reported partial", () => {
  const outDir = makeOutDir();
  const cap = 65536;
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "for(let i=0;i<200000;i++){console.log('0123456789ABCDEF')}"),
    "--out-dir",
    outDir,
    "--max-output-bytes",
    String(cap),
    "--json",
  ]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.exit_code, 0);
  assert.equal(envelope.stdout_truncated, true);
  assert.equal(envelope.stderr_truncated, false);
  assert.equal(envelope.completeness, "partial");
  const size = statSync(envelope.stdout_ref).size;
  assert.ok(size > 0 && size <= cap, `truncated file must fit the cap, got ${size}`);
});

test("infinite output drains without hanging the runner", () => {
  // One 64 KiB write already exceeds the small cap, so truncation does not
  // depend on how much the child manages to emit before the timeout fires.
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "while(true){process.stdout.write('x'.repeat(65536))}"),
    "--out-dir",
    outDir,
    "--max-output-bytes",
    "4096",
    "--timeout-ms",
    "1000",
    "--json",
  ]);
  assert.equal(result.status, 124);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.timed_out, true);
  assert.equal(envelope.stdout_truncated, true);
  assert.equal(envelope.completeness, "partial");
  assert.ok(statSync(envelope.stdout_ref).size <= 4096);
});

test("signal termination without timeout reports partial completeness", () => {
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", "process.kill(process.pid,'SIGTERM')"),
    "--out-dir",
    outDir,
    "--json",
  ]);
  assert.equal(result.status, 1);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.exit_code, null);
  assert.equal(envelope.signal, "SIGTERM");
  assert.equal(envelope.timed_out, false);
  assert.equal(envelope.completeness, "partial");
});

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

test("timeout kills the grandchild process too", () => {
  const pidDir = makeOutDir("run-command-pid-");
  const pidFile = join(pidDir, "grandchild.pid");
  const childCode = [
    "const {spawn}=require('node:child_process');",
    "const fs=require('node:fs');",
    `const g=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});`,
    "g.unref();",
    `fs.writeFileSync(${JSON.stringify(pidFile)},String(g.pid));`,
    "setInterval(()=>{},1000);",
  ].join("");
  const outDir = makeOutDir();
  const result = run([
    "--argv-json",
    argvOf(process.execPath, "-e", childCode),
    "--out-dir",
    outDir,
    "--timeout-ms",
    "300",
    "--json",
  ]);
  assert.equal(result.status, 124);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.timed_out, true);

  let grandchildPid = null;
  for (let waited = 0; waited < 5000; waited += 50) {
    try {
      grandchildPid = Number(readFileSync(pidFile, "utf8").trim());
      if (Number.isInteger(grandchildPid) && grandchildPid > 0) break;
    } catch {
      // Child had not spawned the grandchild yet; keep waiting.
    }
    sleepMs(50);
  }
  assert.ok(grandchildPid, "grandchild pid file must appear");
  let dead = false;
  for (let waited = 0; waited < 5000; waited += 50) {
    if (!pidAlive(grandchildPid)) {
      dead = true;
      break;
    }
    sleepMs(50);
  }
  assert.ok(dead, `grandchild pid ${grandchildPid} must not survive the timeout`);
});
