#!/usr/bin/env node
/**
 * Static gate for Mermaid fenced blocks and optional SVG/PNG artifacts.
 *
 * Contract: docs/visualization-policy.md
 *
 * Usage: node scripts/check-diagrams.mjs --docs <dir> [options]
 *
 * Exit codes:
 *   0  valid (warnings allowed)
 *   1  static errors
 *   2  usage or read error
 *
 * The checker only reads files: no network, no installation, no rendering.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import process from "node:process";

const USAGE = `Check Mermaid fenced blocks and optional diagram artifacts.

Usage:
  node scripts/check-diagrams.mjs --docs <dir> [options]

Options:
  --docs <dir>           Markdown root to scan (default: current directory)
  --json                 print a machine-readable report (only JSON on stdout)
  --require-svg          every Mermaid block needs a matching .svg manifest entry
  --artifact-root <dir>  root holding diagram-artifacts.json; artifact paths stay inside it
  --help                 show this help

Exit codes:
  0  valid (warnings allowed)
  1  static errors
  2  usage or read error
`;

const SKIP_DIRECTORIES = new Set([".git", "node_modules", "tmp"]);
const MANIFEST_NAME = "diagram-artifacts.json";

// Case-sensitive where Mermaid itself is case-sensitive.
const DIAGRAM_TYPES = new Set([
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
  "timeline",
  "journey",
  "quadrantChart",
  "xychart-beta",
  "gitGraph",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
]);

const OPEN_PAIRS = { "(": ")", "[": "]", "{": "}" };
const CLOSE_SET = new Set(Object.values(OPEN_PAIRS));
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const W3C_PATTERN = /^https?:\/\/www\.w3\.org(\/|$)/i;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    docs: process.cwd(),
    json: false,
    requireSvg: false,
    artifactRoot: null,
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
      case "--docs":
        options.docs = readValue();
        break;
      case "--json":
        options.json = true;
        break;
      case "--require-svg":
        options.requireSvg = true;
        break;
      case "--artifact-root":
        options.artifactRoot = readValue();
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

function collectMarkdownFiles(dir) {
  const files = [];
  const readErrors = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      readErrors.push({ path: current, message: error.message });
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return { files: files.sort(), readErrors };
}

// Block body lines joined with \n plus one trailing newline. CRLF input is
// normalized to \n by the line split.
function normalizeBody(bodyLines) {
  return `${bodyLines.join("\n")}\n`;
}

function extractBlocks(text) {
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let open = null;
  let mermaidOrdinal = 0;
  const closeBlock = (endLine) => {
    if (open.info === "mermaid") {
      mermaidOrdinal += 1;
      blocks.push({
        index: mermaidOrdinal,
        body: open.body,
        startLine: open.startLine,
        endLine,
      });
    }
    open = null;
  };
  lines.forEach((raw, position) => {
    const line = position + 1;
    const fence = raw.match(/^(`{3,}|~{3,})\s*(\S*)?\s*$/);
    if (open === null) {
      if (fence) {
        const info = (fence[2] ?? "").split(/\s+/)[0] ?? "";
        open = {
          char: fence[1][0],
          length: fence[1].length,
          info: info.toLowerCase(),
          startLine: line,
          body: [],
        };
      }
      return;
    }
    const closing = raw.match(/^(`{3,}|~{3,})\s*$/);
    if (closing && closing[1][0] === open.char && closing[1].length >= open.length) {
      closeBlock(line);
    } else {
      open.body.push(raw);
    }
  });
  // An unterminated fence still yields its collected lines as a block.
  if (open !== null) closeBlock(lines.length);
  return blocks;
}

function firstToken(bodyLines) {
  let frontMatter = false;
  for (const raw of bodyLines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    if (line === "---") {
      frontMatter = !frontMatter;
      continue;
    }
    // Mermaid title/front-matter lines such as "title: Foo".
    if (frontMatter && /^[A-Za-z][A-Za-z0-9_-]*\s*:/.test(line)) continue;
    frontMatter = false;
    return line.split(/\s+/)[0];
  }
  return null;
}

// Whole-block bracket balance with "-quoted segments treated as opaque and
// %%-comment lines excluded. Single quotes and backticks count as string
// delimiters too. Not a grammar check: subgraph/end pairing and Mermaid
// semantics are out of scope.
function bracketsBalanced(bodyLines) {
  const stack = [];
  for (const raw of bodyLines) {
    if (raw.trim().startsWith("%%")) continue;
    let quote = null;
    for (let i = 0; i < raw.length; i += 1) {
      const char = raw[i];
      if (quote !== null) {
        if (char === "\\") i += 1;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char in OPEN_PAIRS) stack.push(char);
      else if (CLOSE_SET.has(char)) {
        const open = stack.pop();
        if (open === undefined || OPEN_PAIRS[open] !== char) return false;
      }
    }
    // A string span closes at end of line for balance purposes.
    quote = null;
  }
  return stack.length === 0;
}

function normalizeManifestSource(source) {
  return String(source).replace(/\\/g, "/").replace(/^\.\//, "");
}

function loadManifest(manifestPath) {
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    return { missing: true, error: error.message };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`invalid JSON in manifest ${manifestPath}: ${error.message}`);
  }
  if (parsed?.schema_version !== 1) {
    throw new UsageError(`manifest ${manifestPath} must declare schema_version 1`);
  }
  if (!Array.isArray(parsed.artifacts)) {
    throw new UsageError(`manifest ${manifestPath} must declare an artifacts array`);
  }
  parsed.artifacts.forEach((entry, index) => {
    const here = `manifest artifacts[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new UsageError(`${here} must be an object`);
    }
    for (const field of ["source", "block", "source_sha256", "artifact", "artifact_sha256"]) {
      if (!(field in entry)) {
        throw new UsageError(`${here} is missing required field "${field}"`);
      }
    }
    if (typeof entry.source !== "string" || typeof entry.artifact !== "string") {
      throw new UsageError(`${here}: source and artifact must be strings`);
    }
    if (!Number.isInteger(entry.block) || entry.block < 1) {
      throw new UsageError(`${here}: block must be a positive integer`);
    }
  });
  return { missing: false, entries: parsed.artifacts };
}

function containedPath(rootReal, candidate) {
  return candidate === rootReal || candidate.startsWith(rootReal + sep);
}

function checkArtifact(rootReal, entry) {
  // Returns { bytes } or { error }.
  const lexical = resolve(rootReal, entry.artifact);
  if (!containedPath(rootReal, lexical)) {
    return { error: `artifact path resolves outside the artifact root: ${entry.artifact}` };
  }
  let real = null;
  try {
    real = realpathSync(lexical);
  } catch {
    real = null;
  }
  if (real === null) {
    return { error: `artifact file not found: ${entry.artifact}`, code: "artifact_missing" };
  }
  if (!containedPath(rootReal, real)) {
    return { error: `artifact real path escapes the artifact root: ${entry.artifact}` };
  }
  let stats;
  try {
    stats = statSync(real);
  } catch {
    return { error: `artifact file not found: ${entry.artifact}`, code: "artifact_missing" };
  }
  if (!stats.isFile()) {
    return { error: `artifact is not a regular file: ${entry.artifact}`, code: "artifact_missing" };
  }
  let bytes;
  try {
    bytes = readFileSync(real);
  } catch {
    return { error: `artifact file cannot be read: ${entry.artifact}`, code: "artifact_unreadable" };
  }
  return { bytes };
}

function scanSvgWarnings(text) {
  const warnings = [];
  const urls = text.match(URL_PATTERN) ?? [];
  const external = urls.filter((url) => !W3C_PATTERN.test(url));
  if (external.length > 0) {
    warnings.push(`svg links ${external.length} external URL(s), first: ${external[0]}`);
  }
  if (/<script[\s>]/i.test(text) || /javascript:/i.test(text)) {
    warnings.push("svg contains script content");
  }
  return warnings;
}

function check(docsRoot, { requireSvg, artifactRoot }) {
  const errors = [];
  const warnings = [];
  const blocks = [];

  const { files, readErrors } = collectMarkdownFiles(docsRoot);
  if (readErrors.length > 0) {
    const first = readErrors[0];
    throw new UsageError(`cannot read directory ${first.path}: ${first.message}`);
  }

  for (const filePath of files) {
    let text;
    try {
      text = readFileSync(filePath, "utf8");
    } catch (error) {
      throw new UsageError(`cannot read file ${filePath}: ${error.message}`);
    }
    const source = relative(docsRoot, filePath).replace(/\\/g, "/");
    for (const block of extractBlocks(text)) {
      const normalized = normalizeBody(block.body);
      const entry = {
        source,
        index: block.index,
        body: block.body,
        source_sha256: sha256Hex(normalized),
        type: null,
        mapped: false,
        artifact: null,
      };
      if (block.body.every((line) => line.trim() === "")) {
        errors.push({ code: "empty_diagram", path: `${source}#${block.index}`, message: `mermaid block ${block.index} in ${source} is empty` });
        blocks.push(entry);
        continue;
      }
      const token = firstToken(block.body);
      if (token === null || !DIAGRAM_TYPES.has(token)) {
        errors.push({ code: "unknown_diagram_type", path: `${source}#${block.index}`, message: `mermaid block ${block.index} in ${source} has unknown diagram type ${JSON.stringify(token)}` });
        blocks.push(entry);
        continue;
      }
      entry.type = token;
      if (!bracketsBalanced(block.body)) {
        errors.push({ code: "unbalanced_brackets", path: `${source}#${block.index}`, message: `mermaid block ${block.index} in ${source} has unbalanced brackets or quotes` });
      }
      blocks.push(entry);
    }
  }

  let manifest = null;
  if (artifactRoot !== null) {
    let rootStats;
    try {
      rootStats = statSync(artifactRoot);
    } catch (error) {
      throw new UsageError(`cannot read artifact root ${artifactRoot}: ${error.message}`);
    }
    if (!rootStats.isDirectory()) {
      throw new UsageError(`--artifact-root is not a directory: ${artifactRoot}`);
    }
    let rootReal;
    try {
      rootReal = realpathSync(artifactRoot);
    } catch (error) {
      throw new UsageError(`cannot resolve artifact root ${artifactRoot}: ${error.message}`);
    }
    const manifestPath = join(artifactRoot, MANIFEST_NAME);
    const loaded = loadManifest(manifestPath);
    if (loaded.missing) {
      if (requireSvg) {
        for (const block of blocks) {
          errors.push({ code: "missing_manifest_entry", path: `${block.source}#${block.index}`, message: `mermaid block ${block.index} in ${block.source} has no manifest entry but --require-svg is set` });
        }
      } else {
        warnings.push({ code: "manifest_unavailable", path: MANIFEST_NAME, message: `no manifest at ${manifestPath}; artifacts were not verified` });
      }
    } else {
      manifest = { entries: loaded.entries, rootReal };
    }
  }

  if (manifest !== null) {
    const matched = new Set();
    for (const block of blocks) {
      const entry = manifest.entries.find(
        (candidate) =>
          normalizeManifestSource(candidate.source) === block.source && candidate.block === block.index,
      );
      if (!entry) {
        if (requireSvg) {
          errors.push({ code: "missing_manifest_entry", path: `${block.source}#${block.index}`, message: `mermaid block ${block.index} in ${block.source} has no manifest entry but --require-svg is set` });
        }
        continue;
      }
      matched.add(entry);
      block.mapped = true;
      block.artifact = entry.artifact;
      if (entry.source_sha256 !== block.source_sha256) {
        errors.push({ code: "artifact_source_hash_mismatch", path: `${block.source}#${block.index}`, message: `source hash mismatch for ${block.source}#${block.index}` });
        continue;
      }
      if (requireSvg && !/\.svg$/i.test(entry.artifact)) {
        errors.push({ code: "non_svg_artifact", path: `${block.source}#${block.index}`, message: `manifest artifact for ${block.source}#${block.index} is not an .svg file: ${entry.artifact}` });
        continue;
      }
      const checked = checkArtifact(manifest.rootReal, entry);
      if (checked.error) {
        const code = checked.code ?? "artifact_outside_root";
        errors.push({ code, path: `${block.source}#${block.index}`, message: checked.error });
        continue;
      }
      if (entry.artifact_sha256 !== sha256Hex(checked.bytes)) {
        errors.push({ code: "artifact_hash_mismatch", path: `${block.source}#${block.index}`, message: `artifact hash mismatch for ${entry.artifact}` });
        continue;
      }
      if (/\.svg$/i.test(entry.artifact)) {
        for (const message of scanSvgWarnings(checked.bytes.toString("utf8"))) {
          const code = message.startsWith("svg links") ? "svg_external_url" : "svg_script_content";
          warnings.push({ code, path: `${block.source}#${block.index}`, message: `${message} in ${entry.artifact}` });
        }
      }
    }
    manifest.entries.forEach((entry, position) => {
      if (!matched.has(entry)) {
        errors.push({ code: "artifact_orphan", path: `${MANIFEST_NAME}#${position + 1}`, message: `manifest entry ${position + 1} matches no scanned block (${entry.source}#${entry.block})` });
      }
    });
  } else if (requireSvg && artifactRoot === null) {
    for (const block of blocks) {
      errors.push({ code: "missing_manifest_entry", path: `${block.source}#${block.index}`, message: `mermaid block ${block.index} in ${block.source} has no manifest entry but --require-svg is set` });
    }
  }

  return { blocks, errors, warnings, files };
}

function emitHuman(report) {
  for (const error of report.errors) {
    console.log(`error ${error.code} at ${error.path}: ${error.message}`);
  }
  for (const warning of report.warnings) {
    console.log(`warning ${warning.code} at ${warning.path}: ${warning.message}`);
  }
  console.log(
    `diagram-gate: ${report.valid ? "valid" : "invalid"} (${report.summary.blocks} block(s), ${report.summary.mapped} mapped, ${report.summary.errors} error(s), ${report.summary.warnings} warning(s))`,
  );
}

function run(argv) {
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

  const docsRoot = resolve(options.docs);
  let stats;
  try {
    stats = statSync(docsRoot);
  } catch (error) {
    console.error(`error: cannot read docs directory ${docsRoot}: ${error.message}`);
    return 2;
  }
  if (!stats.isDirectory()) {
    console.error(`error: --docs is not a directory: ${docsRoot}`);
    return 2;
  }

  let artifactRoot = null;
  if (options.artifactRoot !== null) {
    artifactRoot = resolve(options.artifactRoot);
  }

  let result;
  try {
    result = check(docsRoot, { requireSvg: options.requireSvg, artifactRoot });
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`error: ${error.message}`);
      console.error("run with --help for usage");
      return 2;
    }
    throw error;
  }

  const mapped = result.blocks.filter((block) => block.mapped).length;
  const report = {
    schema_version: 1,
    docs: docsRoot,
    require_svg: options.requireSvg,
    blocks: result.blocks.map((block) => ({
      source: block.source,
      index: block.index,
      type: block.type,
      source_sha256: block.source_sha256,
      mapped: block.mapped,
      artifact: block.artifact,
    })),
    errors: result.errors,
    warnings: result.warnings,
    summary: {
      files_scanned: result.files.length,
      blocks: result.blocks.length,
      mapped,
      errors: result.errors.length,
      warnings: result.warnings.length,
      status: result.errors.length === 0 ? "ok" : "errors",
    },
  };
  report.valid = report.errors.length === 0;

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    emitHuman(report);
  }

  return report.valid ? 0 : 1;
}

process.exit(run(process.argv.slice(2)));
