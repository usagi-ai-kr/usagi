#!/usr/bin/env node
// Static layer-dependency checker (JS/TS reference adapter).
// Reads the tree and a mapping config only: no writes, no installs.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const SCHEMA_VERSION = 1;
const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
]);
const RESOLVE_EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"];
const ALWAYS_SKIP_DIRS = new Set([".git", "node_modules"]);

// Static import forms with string specifiers. Full-text match; the line
// number is derived from the match offset. Comment- or string-embedded
// import-like text can false-positive (documented limitation).
const IMPORT_PATTERNS = [
  /\bimport\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bexport\b[^;]*?\bfrom\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function usage() {
  return `Usage: node scripts/check-layer-deps.mjs --config <file> [--root <dir>] [--json] [--help]

Options:
  --config <file>  layer mapping config (JSON, required; relative to cwd)
  --root <dir>     scan root (overrides config root; relative to cwd)
  --json           print only the machine-readable report (schema v1)
  --help           show this help

Exit codes:
  0  no violations
  1  violations found
  2  usage, config, or scan error`;
}

function failUsage(message) {
  console.error(`error: ${message}`);
  console.error(usage());
  process.exit(2);
}

function parseArgs(argv) {
  const options = { config: null, root: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") {
      options.config = argv[++i];
      if (!options.config) failUsage("--config requires a file argument");
    } else if (arg === "--root") {
      options.root = argv[++i];
      if (!options.root) failUsage("--root requires a directory argument");
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      failUsage(`unknown option: ${arg}`);
    }
  }
  return options;
}

// Minimal glob: "*" matches within one path segment, "**" matches any
// depth ("**/" also matches zero segments), "?" matches one character
// within a segment. Separators are normalized to "/".
function globToRegExp(glob) {
  const normalized = String(glob).replace(/\\/g, "/");
  let source = "^";
  let i = 0;
  const escape = (c) => c.replace(/[.+^${}()|[\]\\]/, "\\$&");
  while (i < normalized.length) {
    const c = normalized[i];
    if (c === "*") {
      let j = i;
      while (normalized[j] === "*") j++;
      if (j - i >= 2) {
        if (normalized[j] === "/") {
          source += "(?:.*/)?";
          i = j + 1;
        } else {
          source += ".*";
          i = j;
        }
      } else {
        source += "[^/]*";
        i = j;
      }
    } else if (c === "?") {
      source += "[^/]";
      i++;
    } else {
      source += escape(c);
      i++;
    }
  }
  return new RegExp(`${source}$`);
}

function isPlainObject(value) {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function failConfig(message) {
  console.error(`error: invalid config: ${message}`);
  process.exit(2);
}

// Shape: { root?, layers: {name: [glob]}, allowed: {name: [layer]},
// exceptions?: [{from, to, file, reason, expires?}], ignore?: [glob] }.
// Unknown layer references are config errors (fail-closed on typos).
function validateConfig(config) {
  if (!isPlainObject(config)) failConfig("top level must be an object");
  if (
    config.root !== undefined &&
    (typeof config.root !== "string" || config.root === "")
  ) {
    failConfig('"root" must be a non-empty string');
  }
  if (!isPlainObject(config.layers) || Object.keys(config.layers).length === 0) {
    failConfig('"layers" must be an object with at least one layer');
  }
  for (const [name, globs] of Object.entries(config.layers)) {
    if (
      !Array.isArray(globs) ||
      globs.length === 0 ||
      globs.some((g) => typeof g !== "string" || g === "")
    ) {
      failConfig(`"layers.${name}" must be a non-empty array of globs`);
    }
  }
  if (!isPlainObject(config.allowed)) {
    failConfig('"allowed" must be an object');
  }
  const known = new Set(Object.keys(config.layers));
  for (const [name, targets] of Object.entries(config.allowed)) {
    if (!Array.isArray(targets) || targets.some((t) => typeof t !== "string")) {
      failConfig(`"allowed.${name}" must be an array of layer names`);
    }
    for (const target of targets) {
      if (!known.has(target)) {
        failConfig(`"allowed.${name}" references unknown layer "${target}"`);
      }
    }
  }
  if (config.exceptions !== undefined) {
    if (!Array.isArray(config.exceptions)) {
      failConfig('"exceptions" must be an array');
    }
    for (const exception of config.exceptions) {
      for (const field of ["from", "to", "file", "reason"]) {
        if (
          !isPlainObject(exception) ||
          typeof exception[field] !== "string" ||
          exception[field] === ""
        ) {
          failConfig('each exception needs "from", "to", "file", "reason"');
        }
      }
      if (!known.has(exception.from) || !known.has(exception.to)) {
        failConfig(
          `exception references unknown layer "${exception.from}" -> "${exception.to}"`,
        );
      }
    }
  }
  if (
    config.ignore !== undefined &&
    (!Array.isArray(config.ignore) ||
      config.ignore.some((g) => typeof g !== "string"))
  ) {
    failConfig('"ignore" must be an array of globs');
  }
  return {
    root: config.root ?? ".",
    layers: config.layers,
    allowed: config.allowed,
    exceptions: config.exceptions ?? [],
    ignore: config.ignore ?? [],
  };
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function collectFiles(root, ignoreMatchers) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      failUsage(`cannot scan directory: ${dir}`);
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        const rel = toPosix(relative(root, full));
        const dot = rel.toLowerCase().lastIndexOf(".");
        const ext = dot >= 0 ? rel.slice(dot) : "";
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        if (ignoreMatchers.some((pattern) => pattern.test(rel))) continue;
        files.push({ full, rel });
      }
    }
  };
  walk(root);
  return files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

function layerOf(rel, layerMatchers) {
  for (const [name, patterns] of layerMatchers) {
    if (patterns.some((pattern) => pattern.test(rel))) return name;
  }
  return null;
}

// Resolve a relative specifier to a repo-relative path, trying the exact
// path, known extensions, and /index.*. Returns null when unresolvable.
function resolveSpecifier(root, fromRel, specifier) {
  const base = resolve(root, dirname(fromRel), specifier);
  const candidates = [base];
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(`${base}${ext}`);
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(join(base, `index${ext}`));
  }
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return toPosix(relative(root, candidate));
      }
    } catch {
      // Not a file; try the next candidate.
    }
  }
  return null;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkTree(root, mapping) {
  const layerMatchers = Object.entries(mapping.layers).map(([name, globs]) => [
    name,
    globs.map((glob) => globToRegExp(glob)),
  ]);
  const ignoreMatchers = mapping.ignore.map((glob) => globToRegExp(glob));
  const exceptionMatchers = mapping.exceptions.map((exception) => ({
    ...exception,
    pattern: globToRegExp(exception.file),
  }));

  const files = collectFiles(root, ignoreMatchers);
  const violations = [];
  let importsChecked = 0;
  let exceptionsApplied = 0;
  let filesScanned = 0;

  for (const file of files) {
    const fromLayer = layerOf(file.rel, layerMatchers);
    if (fromLayer === null) continue; // Outside all layers: not mapped.
    filesScanned++;
    let text;
    try {
      text = readFileSync(file.full, "utf8");
    } catch {
      console.error(`error: cannot read file: ${file.rel}`);
      process.exit(2);
    }
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const specifier = match[1];
        if (!specifier.startsWith(".")) continue; // Packages/aliases ignored.
        importsChecked++;
        const line = lineOf(text, match.index);
        const targetRel = resolveSpecifier(root, file.rel, specifier);
        if (targetRel === null) {
          violations.push({
            file: file.rel,
            line,
            specifier,
            from_layer: fromLayer,
            to_layer: null,
            kind: "unresolved",
          });
          continue;
        }
        const toLayer = layerOf(targetRel, layerMatchers);
        if (toLayer === null) continue; // Target outside the map: skipped.
        if (toLayer === fromLayer) continue;
        const allowed = mapping.allowed[fromLayer] ?? [];
        if (allowed.includes(toLayer)) continue;
        const excused = exceptionMatchers.some(
          (exception) =>
            exception.from === fromLayer &&
            exception.to === toLayer &&
            exception.pattern.test(file.rel),
        );
        if (excused) {
          exceptionsApplied++;
          continue;
        }
        violations.push({
          file: file.rel,
          line,
          specifier,
          from_layer: fromLayer,
          to_layer: toLayer,
          kind: "violation",
        });
      }
    }
  }

  const status = violations.length > 0 ? "violations" : "ok";
  return {
    schema_version: SCHEMA_VERSION,
    filesScanned,
    importsChecked,
    violations,
    exceptionsApplied,
    status,
  };
}

function printHuman(result) {
  for (const violation of result.violations) {
    const target = violation.to_layer ?? "unmapped";
    console.log(
      `${violation.file}:${violation.line}: ${violation.specifier} ` +
        `(${violation.from_layer} -> ${target}) [${violation.kind}]`,
    );
  }
  const summary =
    result.status === "ok"
      ? "ok"
      : `${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}`;
  console.log(
    `check-layer-deps: ${summary} ` +
      `(${result.filesScanned} files, ${result.importsChecked} imports, ` +
      `${result.exceptionsApplied} exceptions applied)`,
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!options.config) failUsage("--config <file> is required");

  const configPath = resolve(process.cwd(), options.config);
  let raw;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    failUsage(`cannot read config: ${options.config}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`error: invalid config: not valid JSON: ${options.config}`);
    process.exit(2);
  }
  const mapping = validateConfig(parsed);

  const configDir = dirname(configPath);
  const root = options.root
    ? resolve(process.cwd(), options.root)
    : resolve(configDir, mapping.root);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`error: scan root is not a directory: ${root}`);
    process.exit(2);
  }

  const result = checkTree(root, mapping);
  const report = {
    schema_version: SCHEMA_VERSION,
    root,
    config: options.config,
    files_scanned: result.filesScanned,
    imports_checked: result.importsChecked,
    violations: result.violations,
    exceptions_applied: result.exceptionsApplied,
    summary: {
      status: result.status,
      violations: result.violations.length,
      exceptions_applied: result.exceptionsApplied,
    },
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(result);
  }
  process.exit(result.status === "violations" ? 1 : 0);
}

main();
