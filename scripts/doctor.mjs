#!/usr/bin/env node
// Non-destructive toolchain diagnostics. Reads environment state only:
// no writes, no installs, no environment mutation.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_VERSION = 1;
const REQUIRED_NODE_MAJOR = 22;
const SPAWN_TIMEOUT_MS = 5000;

function usage() {
  return `Usage: node scripts/doctor.mjs [options]

Options:
  --json   print only the machine-readable report (schema v1)
  --help   show this help

Exit codes:
  0  required tools present (optional tools may be missing: degraded)
  1  required tool missing, or node older than v${REQUIRED_NODE_MAJOR}
  2  usage error (unknown option)`;
}

function parseArgs(argv) {
  const options = { json: false, help: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else {
      console.error(`unknown option: ${arg}`);
      console.error(usage());
      process.exit(2);
    }
  }
  return options;
}

function firstLine(text) {
  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return null;
}

// Presence probe only: "--version" never mutates state.
function probeVersion(name) {
  try {
    const result = spawnSync(name, ["--version"], {
      encoding: "utf8",
      timeout: SPAWN_TIMEOUT_MS,
    });
    if (result.error) return null;
    return firstLine(result.stdout) ?? firstLine(result.stderr);
  } catch {
    return null;
  }
}

function nodeMajor(version) {
  const match = /^v?(\d+)/.exec(version);
  return match ? Number(match[1]) : 0;
}

function checkTools() {
  const tools = [];

  // Authoritative in-process info; no PATH lookup needed.
  const nodeVersion = process.version;
  tools.push({
    name: "node",
    required: true,
    status: nodeMajor(nodeVersion) >= REQUIRED_NODE_MAJOR ? "ok" : "unsupported",
    version: nodeVersion,
  });

  const specs = [
    { name: "git", required: true },
    { name: "gh", required: false },
    { name: "jq", required: false },
    { name: "bash", required: false },
    { name: "npx", required: false },
  ];
  for (const spec of specs) {
    const version = probeVersion(spec.name);
    tools.push({
      name: spec.name,
      required: spec.required,
      status: version === null ? "missing" : "ok",
      version,
    });
  }
  return tools;
}

function checkRepo(gitPresent) {
  let root = null;
  if (gitPresent) {
    try {
      const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT_MS,
      });
      if (!result.error && result.status === 0) {
        root = firstLine(result.stdout);
      }
    } catch {
      root = null;
    }
  }
  const base = root ?? process.cwd();
  let version = null;
  try {
    version = readFileSync(join(base, "VERSION"), "utf8").trim() || null;
  } catch {
    version = null;
  }
  return {
    root,
    version,
    agents: existsSync(join(base, "AGENTS.md")),
    changelog: existsSync(join(base, "CHANGELOG.md")),
  };
}

function buildReport() {
  const tools = checkTools();
  const cwd = process.cwd();
  const gitEntry = tools.find((tool) => tool.name === "git");
  const repo = checkRepo(gitEntry.status === "ok");

  const requiredMissing = tools.filter(
    (tool) => tool.required && tool.status !== "ok",
  ).length;
  const optionalMissingTools = tools.filter(
    (tool) => !tool.required && tool.status !== "ok",
  );
  const requiredFailed = requiredMissing > 0;
  const optionalFailed = optionalMissingTools.length > 0;

  const status = requiredFailed
    ? "failed"
    : optionalFailed
      ? "degraded"
      : "ok";
  const completeness = requiredFailed
    ? "unavailable"
    : optionalFailed
      ? "partial"
      : "complete";

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    platform: {
      os: process.platform,
      arch: process.arch,
      node: process.version,
      cwd,
      path_has_spaces: /\s/.test(cwd),
      path_has_non_ascii: /[^\x00-\x7F]/.test(cwd),
    },
    tools,
    repo,
    summary: {
      required_missing: requiredMissing,
      optional_missing: optionalMissingTools.length,
      status,
    },
    completeness,
  };
}

function printHuman(report) {
  const lines = [];
  for (const tool of report.tools) {
    lines.push(
      tool.version === null
        ? `${tool.name}: ${tool.status}`
        : `${tool.name}: ${tool.status} (${tool.version})`,
    );
  }
  const platform = report.platform;
  lines.push(
    `platform: ${platform.os}/${platform.arch}, node ${platform.node}, cwd=${platform.cwd} ` +
      `(spaces=${platform.path_has_spaces}, non_ascii=${platform.path_has_non_ascii})`,
  );
  const repo = report.repo;
  lines.push(
    `repo: root=${repo.root ?? "none"}, version=${repo.version ?? "none"}, ` +
      `agents=${repo.agents}, changelog=${repo.changelog}`,
  );
  const summary = report.summary;
  const missingNames = report.tools
    .filter((tool) => !tool.required && tool.status !== "ok")
    .map((tool) => tool.name)
    .join(", ");
  lines.push(
    `doctor: ${summary.status} (required_missing=${summary.required_missing}, ` +
      `optional_missing=${summary.optional_missing}${missingNames ? `: ${missingNames}` : ""})`,
  );
  console.log(lines.join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  const report = buildReport();
  const exitCode = report.summary.status === "failed" ? 1 : 0;
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report);
  }
  process.exit(exitCode);
}

main();
