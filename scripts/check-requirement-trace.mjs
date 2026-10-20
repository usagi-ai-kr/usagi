#!/usr/bin/env node
/**
 * Requirement traceability checker for PRD/SRS/ADR documents.
 *
 * Contract: docs/requirement-traceability.md
 *
 * Usage: node scripts/check-requirement-trace.mjs --docs <dir> [--mode light|full] [--json]
 *
 * Exit codes:
 *   0  valid (warnings allowed)
 *   1  traceability errors
 *   2  usage or read error
 *
 * The checker only reads files: it never writes and installs nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const USAGE = `Check requirement IDs, test mappings and ADR references in Markdown documents.

Usage:
  node scripts/check-requirement-trace.mjs --docs <dir> [options]

Options:
  --docs <dir>           directory that holds the Markdown documents (required)
  --mode light|full      light: presence and references only (default)
                         full: every requirement needs a mapping and an ADR reference
  --json                 print a machine-readable report (only JSON on stdout)
  --help                 show this help

Exit codes:
  0  valid (warnings allowed)
  1  traceability errors
  2  usage or read error
`;

const MODES = ["light", "full"];
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "tmp"]);
const REQUIREMENT_PATTERN = /REQ-[A-Z]+-\d+(?![0-9A-Za-z])/g;
const REQUIREMENT_HEAD_PATTERN = /^REQ-[A-Z]+-\d+(?![0-9A-Za-z가-힣])/;
const ADR_PATTERN = /ADR-\d+(?![0-9A-Za-z])/g;
const ADR_HEAD_PATTERN = /^ADR-\d+(?![0-9A-Za-z가-힣])/;
const ADR_FILE_PATTERN = /ADR-\d+/i;
const PLACEHOLDER_CELLS = new Set([
  "n/a",
  "na",
  "tbd",
  "todo",
  "-",
  "--",
  "---",
  "—",
  "?",
]);

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    docs: null,
    mode: "light",
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
      case "--docs":
        options.docs = readValue();
        break;
      case "--mode":
        options.mode = readValue();
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
  if (!MODES.includes(options.mode)) {
    throw new UsageError(
      `--mode must be one of ${MODES.join("|")}, got: ${options.mode}`,
    );
  }
  return options;
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

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

function stripLineMarkers(line) {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^[*_~`]+/, "")
    .replace(/[`*_~]+$/, "")
    .trim();
}

function parseMappingRow(cells) {
  if (!cells || cells.length < 2) return null;
  const ids = [...cells[0].matchAll(REQUIREMENT_PATTERN)].map((match) => match[0]);
  if (ids.length === 0) return null;
  const evidence = cells[1];
  if (evidence === "") return null;
  if (/^[-—:_\s]+$/.test(evidence)) return null;
  if (PLACEHOLDER_CELLS.has(evidence.toLowerCase())) return null;
  return { ids, evidence };
}

function analyzeFile(filePath, root) {
  const file = relative(root, filePath);
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    const failure = new Error(`cannot read ${file}: ${error.message}`);
    failure.readError = true;
    throw failure;
  }
  const lines = text.split(/\r?\n/);

  const declarations = new Map();
  const mappings = new Map();
  const references = [];
  const adrReferences = new Map();
  const adrDeclarations = new Set();
  const lineAdrs = new Map();
  const lineIds = new Map();

  const addTo = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };

  lines.forEach((raw, index) => {
    const line = index + 1;
    const ids = [...raw.matchAll(REQUIREMENT_PATTERN)].map((match) => match[0]);
    const adrs = [...raw.matchAll(ADR_PATTERN)].map((match) => match[0]);
    if (ids.length === 0 && adrs.length === 0) return;

    const stripped = stripLineMarkers(raw);
    const leadingRequirement = REQUIREMENT_HEAD_PATTERN.exec(stripped);
    const leadingAdr = ADR_HEAD_PATTERN.exec(stripped);
    const mapping = parseMappingRow(splitRow(raw));

    if (leadingAdr) {
      adrDeclarations.add(leadingAdr[0]);
      addTo(adrReferences, leadingAdr[0], { file, line });
    }
    for (const adr of adrs) {
      addTo(adrReferences, adr, { file, line });
    }
    if (adrs.length > 0) lineAdrs.set(line, adrs);

    if (ids.length > 0) lineIds.set(line, ids);

    for (const id of ids) {
      if (mapping && mapping.ids.includes(id)) {
        addTo(mappings, id, { file, line, evidence: mapping.evidence });
        continue;
      }
      if (leadingRequirement && leadingRequirement[0] === id) {
        addTo(declarations, id, { file, line });
        continue;
      }
      references.push({ id, file, line });
    }
  });

  return {
    file,
    declarations,
    mappings,
    references,
    adrReferences,
    adrDeclarations,
    lineAdrs,
    lineIds,
  };
}

function buildReport(docsRoot, mode, files) {
  const errors = [];
  const warnings = [];
  const documents = [];
  const declaredAdrs = new Set();
  const adrOccurrences = new Map();

  for (const filePath of files) {
    const name = filePath.split("/").pop();
    const fileMatch = ADR_FILE_PATTERN.exec(name);
    if (fileMatch) declaredAdrs.add(fileMatch[0].toUpperCase());
  }

  for (const filePath of files) {
    documents.push(analyzeFile(filePath, docsRoot));
  }

  const declarationCounts = new Map();
  const mappingRows = new Map();
  const referenceRows = new Map();
  const requirementFiles = new Map();
  const adrByRequirement = new Map();

  for (const document of documents) {
    for (const adr of document.adrDeclarations) {
      declaredAdrs.add(adr);
    }
    for (const [id, places] of document.declarations) {
      declarationCounts.set(id, (declarationCounts.get(id) ?? 0) + places.length);
      if (!requirementFiles.has(id)) requirementFiles.set(id, new Set());
      requirementFiles.get(id).add(document.file);
    }
    for (const [id, places] of document.mappings) {
      if (!mappingRows.has(id)) mappingRows.set(id, []);
      mappingRows.get(id).push(...places);
      if (!requirementFiles.has(id)) requirementFiles.set(id, new Set());
      requirementFiles.get(id).add(document.file);
    }
    for (const reference of document.references) {
      if (!referenceRows.has(reference.id)) referenceRows.set(reference.id, []);
      referenceRows.get(reference.id).push(reference);
      if (!requirementFiles.has(reference.id)) {
        requirementFiles.set(reference.id, new Set());
      }
      requirementFiles.get(reference.id).add(reference.file);
    }
    for (const [adr, places] of document.adrReferences) {
      if (!adrOccurrences.has(adr)) adrOccurrences.set(adr, []);
      adrOccurrences.get(adr).push(...places);
    }
    for (const [line, ids] of document.lineIds) {
      const adrs = document.lineAdrs.get(line);
      if (!adrs) continue;
      for (const id of ids) {
        if (!adrByRequirement.has(id)) adrByRequirement.set(id, new Set());
        for (const adr of adrs) adrByRequirement.get(id).add(adr);
      }
    }
  }

  const requirementIds = [...requirementFiles.keys()].sort();

  // Duplicate declarations.
  for (const id of requirementIds) {
    const count = declarationCounts.get(id) ?? 0;
    if (count > 1) {
      errors.push({
        code: "duplicate_requirement",
        id,
        file: requirementFiles.get(id).values().next().value,
        line: null,
        message: `requirement ${id} is declared ${count} times; keep one declaration`,
      });
    }
  }

  // References to requirements that are never declared.
  for (const [id, places] of referenceRows) {
    if ((declarationCounts.get(id) ?? 0) > 0) continue;
    const first = places[0];
    errors.push({
      code: "unknown_requirement",
      id,
      file: first.file,
      line: first.line,
      message: `requirement ${id} is referenced but never declared (${places.length} reference(s))`,
    });
  }

  // Mapped requirements without a declaration. A mapping row is a reference to
  // an unknown ID, so it is an error in light mode as well as in full mode.
  for (const [id, places] of mappingRows) {
    if ((declarationCounts.get(id) ?? 0) > 0) continue;
    const first = places[0];
    errors.push({
      code: "mapped_not_declared",
      id,
      file: first.file,
      line: first.line,
      message: `requirement ${id} has a mapping row but no declaration`,
    });
  }

  // ADR references that point to an unknown ADR.
  for (const [adr, places] of adrOccurrences) {
    if (declaredAdrs.has(adr)) continue;
    const first = places[0];
    const payload = {
      code: "unknown_adr",
      id: adr,
      file: first.file,
      line: first.line,
      message: `ADR ${adr} is referenced but no ADR document or declaration was found`,
    };
    if (mode === "full") errors.push(payload);
    else warnings.push(payload);
  }

  const requirements = requirementIds.map((id) => {
    const adrRefs = [...(adrByRequirement.get(id) ?? new Set())].sort();
    return {
      id,
      files: [...requirementFiles.get(id)].sort(),
      declared: (declarationCounts.get(id) ?? 0) > 0,
      mapped: (mappingRows.get(id) ?? []).length > 0,
      adr_refs: adrRefs,
    };
  });

  if (mode === "full") {
    for (const requirement of requirements) {
      if (!requirement.declared) continue;
      if (!requirement.mapped) {
        errors.push({
          code: "requirement_without_mapping",
          id: requirement.id,
          file: requirement.files[0] ?? null,
          line: null,
          message: `requirement ${requirement.id} has no test mapping row`,
        });
      }
      if (requirement.adr_refs.length === 0) {
        errors.push({
          code: "requirement_without_adr",
          id: requirement.id,
          file: requirement.files[0] ?? null,
          line: null,
          message: `requirement ${requirement.id} has no ADR reference on the same line`,
        });
      }
    }
  }

  if (requirementIds.length === 0) {
    warnings.push({
      code: "no_requirement_ids",
      id: null,
      file: null,
      line: null,
      message: "no requirement IDs were found; nothing was traced",
    });
  }

  const declaredCount = requirements.filter((item) => item.declared).length;
  const mappedCount = requirements.filter((item) => item.mapped).length;
  const withAdrCount = requirements.filter((item) => item.adr_refs.length > 0).length;

  return {
    schema_version: 1,
    mode,
    docs: docsRoot,
    requirements,
    errors,
    warnings,
    summary: {
      files_scanned: files.length,
      requirements: declaredCount,
      mapped: mappedCount,
      with_adr: withAdrCount,
      errors: errors.length,
      warnings: warnings.length,
      status: errors.length === 0 ? "ok" : "errors",
    },
  };
}

function emitHuman(report) {
  for (const error of report.errors) {
    const where = error.file
      ? ` at ${error.file}${error.line ? `:${error.line}` : ""}`
      : "";
    console.log(`error ${error.code}${where}: ${error.message}`);
  }
  for (const warning of report.warnings) {
    const where = warning.file
      ? ` at ${warning.file}${warning.line ? `:${warning.line}` : ""}`
      : "";
    console.log(`warning ${warning.code}${where}: ${warning.message}`);
  }
  console.log(
    `requirement-trace: ${report.summary.status} (${report.summary.requirements} requirement(s), ${report.summary.mapped} mapped, ${report.summary.errors} error(s), ${report.summary.warnings} warning(s))`,
  );
}

function run(argv) {
  try {
    return runChecked(argv);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`error: ${message}`);
    console.error("run with --help for usage");
    return 2;
  }
}

function runChecked(argv) {
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

  if (options.docs === null) {
    console.error("error: --docs is required");
    console.error("run with --help for usage");
    return 2;
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

  const { files, readErrors } = collectMarkdownFiles(docsRoot);
  if (readErrors.length > 0) {
    for (const failure of readErrors) {
      console.error(
        `error: cannot read directory ${failure.path}: ${failure.message}`,
      );
    }
    return 2;
  }

  let report;
  try {
    report = buildReport(docsRoot, options.mode, files);
  } catch (error) {
    if (error && error.readError) {
      console.error(`error: ${error.message}`);
      return 2;
    }
    throw error;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    emitHuman(report);
  }

  return report.errors.length === 0 ? 0 : 1;
}

process.exit(run(process.argv.slice(2)));
