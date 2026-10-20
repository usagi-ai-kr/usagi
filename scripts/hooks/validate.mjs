#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook: thin adapter over existing repository scripts.
 *
 * Gates Bash commands that can publish or persist changes (git commit, git
 * push, gh pr create, gh pr merge) on the secret guard and
 * `node scripts/validate.mjs`. Everything else is allowed. Evidence goes to
 * tmp/hook-events.jsonl; a missing evidence write fails closed.
 *
 * Contract: docs/client-integration.md
 *
 * Exit codes:
 *   0  allow (checks passed, non-gated command, or bypass with reason)
 *   2  block (secret-guard hit, validate failed, bypass without reason,
 *      evidence unwritable, or usage error)
 *
 * The intercepted command is parsed only to classify it; it is never
 * executed here and never interpolated into a shell string. No network.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const USAGE = `Claude Code pre-tool-use hook for publishing Bash commands.

Usage:
  node scripts/hooks/validate.mjs --event pre-tool-use [options]

Options:
  --event <name>       hook event name; only pre-tool-use is gated (required)
  --command <text>     command to classify (default: read Claude Code JSON payload from stdin)
  --repo-root <dir>    repository root (default: $CLAUDE_PROJECT_DIR or cwd)
  --help               show this help

Exit codes:
  0  allow
  2  block
`;

const EVIDENCE_FILE = join("tmp", "hook-events.jsonl");

const SECRET_PATH_PATTERN =
  /(^|\/)\.env(\..*)?$|(^|\/)[^/]*\.(pem|key)$|(^|\/)(id_rsa|id_ed25519)$|(^|\/)[^/]*(credentials|secrets)[^/]*$/i;
// Example files carry documentation values, not secrets. The path rule
// exempts these basenames; content rules below still apply to real values.
function isExamplePath(path) {
  const base = path.split("/").pop();
  return (
    base === ".env.example" ||
    base.endsWith(".example") ||
    base.endsWith(".sample")
  );
}

const SECRET_CONTENT_PATTERNS = [
  { name: "private-key-header", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "github-token", pattern: /\bghp_[A-Za-z0-9]+/ },
  { name: "github-pat", pattern: /\bgithub_pat_[A-Za-z0-9_]+/ },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9]+/ },
  { name: "aws-key", pattern: /\bAKIA[0-9A-Z]+/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { name: "gcp-key", pattern: /\bAIza[A-Za-z0-9_-]+/ },
  { name: "secret-assignment", pattern: /\b(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*=\s*(\S+)/i, redactFlags: "gi" },
];

// Placeholder values that are documentation, not secrets. The assignment
// rule skips these; token patterns above still fire everywhere.
function isPlaceholderValue(raw) {
  const value = raw.replace(/^["']|["';,]+$/g, "").trim();
  if (value === "") return true;
  if (/^your[-_]/i.test(value)) return true;
  if (/^(example|dummy|changeme)(?![A-Za-z0-9])/i.test(value)) return true;
  if (/^<[^<>]+>$/.test(value)) return true;
  return false;
}

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { event: null, command: null, repoRoot: null, help: false };
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
      case "--event":
        options.event = readValue();
        break;
      case "--command":
        options.command = readValue();
        break;
      case "--repo-root":
        options.repoRoot = readValue();
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

function readStdin() {
  try {
    if (process.stdin.isTTY) return "";
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote !== null) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (
      command.startsWith("&&", i) ||
      command.startsWith("||", i) ||
      char === ";" ||
      char === "|"
    ) {
      segments.push(current);
      current = "";
      if (command.startsWith("&&", i) || command.startsWith("||", i)) i += 1;
      continue;
    }
    current += char;
  }
  segments.push(current);
  return segments;
}

function splitWords(segment) {
  const words = [];
  let current = "";
  let quote = null;
  const flush = () => {
    if (current !== "") {
      words.push(current);
      current = "";
    }
  };
  for (const char of segment) {
    if (quote !== null) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return words;
}

// Only Bash commands that can publish or persist changes are gated.
// Classification is syntactic: flags (and -C/-c/-R values), sudo/env and
// VAR=value prefixes are skipped. Command substitution such as $(...) is
// not unwrapped and stays ungated; CI and branch protection are the final
// defense for those forms.
function stripPrefixes(words) {
  while (
    words.length > 0 &&
    (words[0] === "sudo" ||
      words[0] === "env" ||
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]))
  ) {
    words = words.slice(1);
  }
  return words;
}

function skipFlagValues(words, valuedFlags) {
  const rest = [];
  let skipNext = false;
  for (const word of words) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (valuedFlags.includes(word)) {
      skipNext = true;
      continue;
    }
    if (word.startsWith("-")) continue;
    rest.push(word);
  }
  return rest;
}

function gatedKind(command) {
  for (const segment of splitSegments(command)) {
    const words = stripPrefixes(splitWords(segment.trim()));
    if (words[0] === "git") {
      const sub = skipFlagValues(words.slice(1), ["-C", "-c"])[0];
      if (sub === "commit" || sub === "push") return `git ${sub}`;
    }
    if (words[0] === "gh") {
      const rest = skipFlagValues(words.slice(1), ["-R", "--repo"]);
      if (rest[0] === "pr" && (rest[1] === "create" || rest[1] === "merge")) {
        return `gh pr ${rest[1]}`;
      }
    }
  }
  return null;
}

function gitLines(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", timeout: 30000 });
  if (result.error) {
    throw new Error(`git unavailable: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${(result.stderr || "").trim().split("\n")[0] ?? ""}`);
  }
  return result.stdout;
}

function hasRef(repoRoot, ref) {
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "--verify", ref], { stdio: "ignore", timeout: 15000 });
  return !result.error && result.status === 0;
}

function checkSecrets(repoRoot, kind) {
  const diffs = [["diff", "--cached", "-U0"]];
  if ((kind === "git push" || kind.startsWith("gh pr")) && hasRef(repoRoot, "origin/main")) {
    diffs.push(["diff", "origin/main...HEAD", "-U0"]);
  }
  let hunks = "";
  for (const args of diffs) {
    hunks += `\n${gitLines(repoRoot, args)}`;
  }
  let path = null;
  let newLine = 0;
  for (const line of hunks.split("\n")) {
    if (line.startsWith("+++ ")) {
      path = line.slice(4).trim().replace(/^b\//, "");
      newLine = 0;
      if (
        !isExamplePath(path) &&
        SECRET_PATH_PATTERN.test(path)
      ) {
        return { path, pattern: "blocked-path", line: null };
      }
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const added = line.slice(1);
    // Prose files describe variables instead of holding values: the
    // assignment rule is skipped there, but token patterns still fire.
    const prose = path !== null && path.endsWith(".md");
    for (const { name, pattern } of SECRET_CONTENT_PATTERNS) {
      if (name === "secret-assignment" && prose) continue;
      const match = pattern.exec(added);
      if (match === null) continue;
      if (name === "secret-assignment" && isPlaceholderValue(match[1])) continue;
      return { path, pattern: name, line: newLine || null };
    }
    newLine += 1;
  }
  return null;
}

function runRepoValidate(repoRoot) {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "validate.mjs")],
    { cwd: repoRoot, encoding: "utf8", timeout: 300000 },
  );
  if (result.error) {
    return { pass: false, reason: `validate could not run: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { pass: false, reason: "validate failed; fix the repository checks first" };
  }
  return { pass: true, reason: "validate passed" };
}

function redactCommand(command) {
  let result = command;
  for (const entry of SECRET_CONTENT_PATTERNS) {
    result = result.replace(new RegExp(entry.pattern.source, entry.redactFlags ?? "g"), "[REDACTED]");
  }
  return result;
}

function redactPath(path) {
  if (path === null || path === undefined) return path;
  let result = String(path);
  for (const { pattern } of SECRET_CONTENT_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, "gi"), "[REDACTED]");
  }
  return result;
}

function writeEvidence(repoRoot, event) {
  mkdirSync(join(repoRoot, "tmp"), { recursive: true });
  appendFileSync(join(repoRoot, EVIDENCE_FILE), `${JSON.stringify(event)}\n`);
}

function block(repoRoot, base, reason, stderrExtra = null) {
  const event = { ...base, decision: "block", reason };
  try {
    writeEvidence(repoRoot, event);
  } catch (error) {
    console.error(`error: hook blocked (${reason}); evidence unwritable: ${error.message}`);
    return 2;
  }
  console.error(`error: hook blocked (${reason})`);
  if (stderrExtra) console.error(stderrExtra);
  return 2;
}

function main(argv) {
  const started = Date.now();
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE.trimEnd());
    return 0;
  }
  if (options.event === null) {
    console.error("error: --event is required");
    return 2;
  }
  if (options.event !== "pre-tool-use") {
    console.error(`error: unsupported event: ${options.event}`);
    return 2;
  }

  const repoRoot = resolve(
    options.repoRoot ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  );
  const base = {
    schema_version: 1,
    timestamp: new Date().toISOString(),
    event: options.event,
    duration_ms: 0,
  };
  const finish = (event) => {
    event.duration_ms = Date.now() - started;
    return event;
  };

  if (process.env.USAGI_HOOK_BYPASS === "1") {
    const reason = (process.env.USAGI_HOOK_BYPASS_REASON ?? "").trim();
    if (reason === "") {
      return block(repoRoot, finish(base), "bypass requested without USAGI_HOOK_BYPASS_REASON");
    }
    const event = finish({ ...base, decision: "bypass", reason, command: "", checks: {} });
    try {
      writeEvidence(repoRoot, event);
    } catch (error) {
      console.error(`error: bypass requested but evidence unwritable: ${error.message}`);
      return 2;
    }
    return 0;
  }

  let command = options.command ?? "";
  if (command === "") {
    const raw = readStdin();
    if (raw.trim() !== "") {
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        console.error("error: cannot parse hook payload on stdin");
        return 2;
      }
      if (payload?.tool_name !== undefined && payload.tool_name !== "Bash") {
        return 0;
      }
      if (typeof payload?.tool_input?.command === "string") {
        command = payload.tool_input.command;
      }
    }
  }

  const redacted = redactCommand(command);
  const kind = gatedKind(command);
  if (kind === null) {
    const event = finish({
      ...base,
      decision: "allow",
      reason: "command is not gated",
      command: redacted,
      checks: {},
    });
    try {
      writeEvidence(repoRoot, event);
    } catch (error) {
      console.error(`error: hook allowed but evidence unwritable: ${error.message}`);
      return 2;
    }
    return 0;
  }

  let secret;
  try {
    secret = checkSecrets(repoRoot, kind);
  } catch (error) {
    return block(repoRoot, finish(base), `secret-guard unavailable: ${error.message}`);
  }
  if (secret !== null) {
    const where = secret.line === null ? secret.path : `${secret.path}:${secret.line}`;
    return block(
      repoRoot,
      finish({ ...base, command: redacted, checks: { secret_guard: "fail", validate: "skip" } }),
      `secret-guard blocked ${redactPath(where)} (${secret.pattern})`,
    );
  }

  const validate = runRepoValidate(repoRoot);
  if (!validate.pass) {
    return block(
      repoRoot,
      finish({ ...base, command: redacted, checks: { secret_guard: "pass", validate: "fail" } }),
      validate.reason,
    );
  }

  const event = finish({
    ...base,
    decision: "allow",
    reason: `gated ${kind} passed secret-guard and validate`,
    command: redacted,
    checks: { secret_guard: "pass", validate: "pass" },
  });
  try {
    writeEvidence(repoRoot, event);
  } catch (error) {
    console.error(`error: hook allowed but evidence unwritable: ${error.message}`);
    return 2;
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
