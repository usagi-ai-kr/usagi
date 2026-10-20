import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hookPath = fileURLToPath(new URL("./validate.mjs", import.meta.url));
const repoRoot = join(dirname(hookPath), "..", "..");
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

function git(dir, ...args) {
  execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
}

// A temp repo with a stub scripts/validate.mjs whose exit code is driven by
// STUB_VALIDATE_EXIT. The real repository validate never runs in tests.
function makeRepo(stubExit = "0") {
  const dir = makeTemp("hook-repo-");
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "hook-test@example.test");
  git(dir, "config", "user.name", "hook-test");
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "validate.mjs"),
    `#!/usr/bin/env node\nprocess.exit(Number(process.env.STUB_VALIDATE_EXIT ?? "${stubExit}"));\n`,
  );
  writeFileSync(join(dir, "note.txt"), "base\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "base", "--no-gpg-sign");
  return dir;
}

function stage(dir, rel, content) {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(dir, "add", rel);
}

function runHook(repoDir, args = [], options = {}) {
  return spawnSync(process.execPath, [hookPath, "--event", "pre-tool-use", "--repo-root", repoDir, ...args], {
    encoding: "utf8",
    timeout: 30000,
    ...options,
  });
}

function runCommand(repoDir, command, extraArgs = [], options = {}) {
  return runHook(repoDir, ["--command", command, ...extraArgs], options);
}

function evidenceLines(repoDir) {
  const file = join(repoDir, "tmp", "hook-events.jsonl");
  return readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

test("safe git commit with passing validate allows and records an allow event", () => {
  const dir = makeRepo();
  stage(dir, "ok.txt", "harmless\n");
  const result = runCommand(dir, "git commit -m safe");
  assert.equal(result.status, 0);
  const [event] = evidenceLines(dir).slice(-1);
  assert.equal(event.decision, "allow");
  assert.equal(event.schema_version, 1);
  assert.ok(typeof event.timestamp === "string");
  assert.ok(typeof event.duration_ms === "number");
});

test("failing validate blocks with exit 2 and a block event", () => {
  const dir = makeRepo("1");
  stage(dir, "ok.txt", "harmless\n");
  const result = runCommand(dir, "git commit -m safe", [], {
    env: { ...process.env, STUB_VALIDATE_EXIT: "1" },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /validate failed/);
  const [event] = evidenceLines(dir).slice(-1);
  assert.equal(event.decision, "block");
});

test("staged .env and token values block with a secret-guard reason", () => {
  const dir = makeRepo();
  stage(dir, ".env", "API_KEY=super-secret-value\n");
  const leaked = "ghp_faketoken1234567890abcdef";
  stage(dir, "app.txt", `token = "${leaked}"\n`);
  const result = runCommand(dir, "git commit -m safe");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /secret-guard/);
  assert.ok(!result.stderr.includes("super-secret-value"), "stderr must not leak the secret");
  assert.ok(!result.stderr.includes(leaked), "stderr must not leak the token");
  const [event] = evidenceLines(dir).slice(-1);
  assert.equal(event.decision, "block");
  assert.ok(!JSON.stringify(event).includes("super-secret-value"));
  assert.ok(!JSON.stringify(event).includes(leaked));
});

test("git push and gh pr create are gated; git status is allowed", () => {
  const dir = makeRepo();
  const push = runCommand(dir, "git push origin main");
  assert.equal(push.status, 0);
  const pr = runCommand(dir, "gh pr create --title x");
  assert.equal(pr.status, 0);
  const status = runCommand(dir, "git status");
  assert.equal(status.status, 0);
  const decisions = evidenceLines(dir).map((event) => event.decision);
  assert.ok(decisions.every((decision) => decision === "allow"));
});

test("hook payload from stdin is classified the same way", () => {
  const dir = makeRepo();
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git status" },
  });
  const result = runHook(dir, [], { input: payload });
  assert.equal(result.status, 0);
});

test("bypass with reason allows and records bypass; bypass without reason blocks", () => {
  const dir = makeRepo("1");
  stage(dir, ".env", "API_KEY=x\n");
  const allowed = runCommand(dir, "git commit -m safe", [], {
    env: { ...process.env, STUB_VALIDATE_EXIT: "1", USAGI_HOOK_BYPASS: "1", USAGI_HOOK_BYPASS_REASON: "test bypass" },
  });
  assert.equal(allowed.status, 0);
  const [bypassEvent] = evidenceLines(dir).slice(-1);
  assert.equal(bypassEvent.decision, "bypass");
  assert.equal(bypassEvent.reason, "test bypass");

  const denied = runCommand(dir, "git commit -m safe", [], {
    env: { ...process.env, USAGI_HOOK_BYPASS: "1" },
  });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /USAGI_HOOK_BYPASS_REASON/);
});

test("evidence write failure blocks fail-closed", () => {
  const dir = makeRepo();
  stage(dir, "ok.txt", "harmless\n");
  mkdirSync(join(dir, "tmp", "hook-events.jsonl"), { recursive: true });
  const result = runCommand(dir, "git commit -m safe");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /evidence/);
});

test(".claude/settings.json parses and wires the PreToolUse hook", () => {
  const settings = JSON.parse(readFileSync(join(repoRoot, ".claude/settings.json"), "utf8"));
  const preToolUse = settings?.hooks?.PreToolUse;
  assert.ok(Array.isArray(preToolUse) && preToolUse.length > 0, "hooks.PreToolUse must exist");
  const text = JSON.stringify(preToolUse);
  assert.ok(text.includes("scripts/hooks/validate.mjs"), "hook command must run scripts/hooks/validate.mjs");
  assert.ok(text.includes("$CLAUDE_PROJECT_DIR"), "hook command must use the project directory");
});

test("no secret values appear in stdout, stderr or evidence", () => {
  const dir = makeRepo();
  const leaked = "ghp_faketoken1234567890abcdef";
  stage(dir, "app.txt", `key = "${leaked}"\n`);
  const result = runCommand(dir, "git commit -m safe");
  assert.equal(result.status, 2);
  for (const [label, output] of [["stdout", result.stdout], ["stderr", result.stderr]]) {
    assert.ok(!output.includes(leaked), `${label} must not leak the token`);
  }
  const lines = readFileSync(join(dir, "tmp", "hook-events.jsonl"), "utf8");
  assert.ok(!lines.includes(leaked), "evidence must not leak the token");
  assert.ok(statSync(join(dir, "tmp", "hook-events.jsonl")).isFile());
});

test(".env.example placeholders and README prose pass; real values still block", () => {
  const dir = makeRepo();
  stage(dir, ".env.example", "API_KEY=your-key-here\n");
  stage(dir, "README.md", "set API_KEY=... in env\n");
  const allowed = runCommand(dir, "git commit -m docs");
  assert.equal(allowed.status, 0);

  const dir2 = makeRepo();
  stage(dir2, ".env", "API_KEY=realvalue123\n");
  const blockedEnv = runCommand(dir2, "git commit -m x");
  assert.equal(blockedEnv.status, 2);
  assert.match(blockedEnv.stderr, /secret-guard/);

  const dir3 = makeRepo();
  stage(dir3, "app.conf", "API_KEY=realvalue123\n");
  const blockedAssign = runCommand(dir3, "git commit -m x");
  assert.equal(blockedAssign.status, 2);
  assert.match(blockedAssign.stderr, /secret-assignment/);

  const dir4 = makeRepo();
  const token = "ghp_realtoken000000000000000001";
  stage(dir4, ".env.example", `BACKUP=${token}\n`);
  const blockedToken = runCommand(dir4, "git commit -m x");
  assert.equal(blockedToken.status, 2);
  assert.ok(!blockedToken.stderr.includes(token));
});

test("common publish command forms are gated", () => {
  for (const command of [
    "git -C /tmp commit -m x",
    "git -c user.name=x commit -m x",
    "gh -R owner/repo pr create --title x",
    "env FOO=1 git commit -m x",
    "FOO=1 git commit -m x",
  ]) {
    const dir = makeRepo();
    stage(dir, "ok.txt", "harmless\n");
    const result = runCommand(dir, command);
    assert.equal(result.status, 0, `${command} must be gated and pass`);
    const [event] = evidenceLines(dir).slice(-1);
    assert.equal(event.checks.secret_guard, "pass", `${command} must run the secret guard`);
  }
});

test("command substitution stays ungated as a documented limit", () => {
  const dir = makeRepo();
  stage(dir, "ok.txt", "harmless\n");
  const result = runCommand(dir, "echo $(git commit -m x)");
  assert.equal(result.status, 0);
  const [event] = evidenceLines(dir).slice(-1);
  assert.deepEqual(event.checks, {});
});

test(".env.sample follows the same example rules", () => {
  const dir = makeRepo();
  stage(dir, ".env.sample", "API_KEY=your-key-here\n");
  assert.equal(runCommand(dir, "git commit -m x").status, 0);

  const dir2 = makeRepo();
  const token = "ghp_sampletoken0000000000000002";
  stage(dir2, ".env.sample", `BACKUP=${token}\n`);
  const blocked = runCommand(dir2, "git commit -m x");
  assert.equal(blocked.status, 2);
  assert.ok(!blocked.stderr.includes(token));
});

test("token-like file paths are redacted from block reasons", () => {
  const dir = makeRepo();
  const token = "ghp_pathtoken000000000000000003";
  stage(dir, `notes-${token}.txt`, `key = "${token}"\n`);
  const result = runCommand(dir, "git commit -m x");
  assert.equal(result.status, 2);
  assert.ok(!result.stderr.includes(token), "stderr must not leak the token from the path");
  const lines = readFileSync(join(dir, "tmp", "hook-events.jsonl"), "utf8");
  assert.ok(!lines.includes(token), "evidence must not leak the token from the path");
});

test("lowercase secret assignments are blocked", () => {
  const dir = makeRepo();
  stage(dir, "app.conf", "api_key=hunter2\n");
  const result = runCommand(dir, "git commit -m x");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /secret-assignment/);
});
