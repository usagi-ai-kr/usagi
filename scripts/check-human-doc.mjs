#!/usr/bin/env node
// Advisory reading-load and metadata checker for human-facing Markdown.
// Length warnings never fail the run. Metadata errors fail with exit 1.
import { readFileSync } from "node:fs";

const BUDGET = Object.freeze({
  document: 1024,
  paragraph: 256,
  sentence: 64,
});

const DOC_TYPES = new Set([
  "proposal",
  "retrospective",
  "learning",
  "job-search",
  "reference",
]);

const REQUIRED_FIELDS = Object.freeze({
  proposal: ["evaluation"],
  retrospective: ["evidence"],
  learning: ["competency"],
  "job-search": ["competency"],
  reference: [],
});

function usage() {
  console.error(`Usage: node scripts/check-human-doc.mjs [options] <file.md> [...]

Options:
  --require-metadata  require valid human-doc frontmatter in every file
  --json              print a machine-readable report
  -h, --help          show this help

Exit codes:
  0  length warnings only (advisory)
  1  metadata error
  2  usage or read error`);
}

function parseArgs(argv) {
  const options = { requireMetadata: false, json: false, paths: [] };
  for (const arg of argv) {
    if (arg === "--require-metadata") options.requireMetadata = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      console.error(`unknown option: ${arg}`);
      usage();
      process.exit(2);
    } else {
      options.paths.push(arg);
    }
  }
  if (options.paths.length === 0) {
    usage();
    process.exit(2);
  }
  return options;
}

function count(value) {
  return [...value.replace(/\r?\n/g, "")].length;
}

function snippet(value, length = 48) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized;
}

function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return { data: null, body: source, lineOffset: 0 };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!field) continue;
    let value = field[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[field[1]] = value;
  }

  return {
    data,
    body: source.slice(match[0].length),
    lineOffset: match[0].split(/\r?\n/).length - 1,
  };
}

function validateMetadata(data, requireMetadata) {
  const errors = [];
  if (!data) {
    if (requireMetadata) errors.push({ message: "missing frontmatter metadata" });
    return errors;
  }

  const type = data.doc_type;
  if (!type) {
    if (requireMetadata) errors.push({ message: "missing doc_type" });
    return errors;
  }
  if (!DOC_TYPES.has(type)) {
    errors.push({ message: `unsupported doc_type: ${type}` });
  }
  if (!data.audience) {
    errors.push({ message: "missing audience" });
  }
  for (const field of REQUIRED_FIELDS[type] ?? []) {
    if (!data[field]) {
      errors.push({ message: `missing ${field} for doc_type ${type}` });
    }
  }
  return errors;
}

function stripForLength(source) {
  return source
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/[^\n]/g, ""))
    .replace(/~~~[\s\S]*?~~~/g, (match) => match.replace(/[^\n]/g, ""))
    .replace(/`[^`\n]*`/g, (match) => " ".repeat(match.length))
    .replace(/!?\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/<[^>]+>/g, (match) => " ".repeat(match.length))
    .replace(/(?<!\\)[*_~]{1,2}/g, " ");
}

function splitBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  let current = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) {
      flush();
      continue;
    }

    const heading = /^#{1,6}\s+/.test(line);
    const list = /^(?:[-*+]|\d+[.)])\s+/.test(line);
    const table = /^\|.*\|$/.test(line);
    const quote = /^>\s?/.test(line);
    const rule = /^(?:-{3,}|\*{3,}|_{3,})$/.test(line);

    if (heading || list || table || quote || rule) {
      flush();
      current = { lines: [line], startLine: index + 1, heading, table, rule };
      if (heading || table || quote || rule) flush();
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      current = { lines: [line], startLine: index + 1, heading: false, table: false, rule: false };
    }
  }
  flush();

  return blocks
    .map((block) => {
      const text = block.lines
        .map((line) =>
          line
            .replace(/^#{1,6}\s+/, "")
            .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
            .replace(/^>\s?/, "")
            .replace(/^\[[ xX]\]\s*/, ""),
        )
        .join(" ")
        .replace(/\|/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { ...block, text };
    })
    .filter((block) => block.text.length > 0);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?。！？])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function inspectFile(path, requireMetadata) {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    return {
      path,
      metadata: null,
      warnings: [],
      errors: [{ message: `cannot read file: ${error.message}` }],
      readError: true,
    };
  }

  const { data, body, lineOffset } = parseFrontmatter(source);
  const metadataErrors = validateMetadata(data, requireMetadata);
  const blocks = splitBlocks(stripForLength(body));
  const warnings = [];
  const documentLength = blocks.reduce((total, block) => total + count(block.text), 0);
  const docType = data?.doc_type;

  if (docType !== "reference" && documentLength > BUDGET.document) {
    warnings.push({
      kind: "document",
      line: 1,
      length: documentLength,
      budget: BUDGET.document,
      text: path,
    });
  }

  for (const block of blocks) {
    if (block.heading || block.table || block.rule) continue;

    const line = block.startLine + lineOffset;
    const paragraphLength = count(block.text);
    if (paragraphLength > BUDGET.paragraph) {
      warnings.push({
        kind: "paragraph",
        line,
        length: paragraphLength,
        budget: BUDGET.paragraph,
        text: snippet(block.text),
      });
    }

    const sentences = splitSentences(block.text);
    for (let index = 0; index < sentences.length; index++) {
      const sentenceLength = count(sentences[index]);
      if (sentenceLength > BUDGET.sentence) {
        warnings.push({
          kind: "sentence",
          line,
          sentence: index + 1,
          length: sentenceLength,
          budget: BUDGET.sentence,
          text: snippet(sentences[index]),
        });
      }
    }
  }

  return {
    path,
    metadata: data,
    warnings,
    errors: metadataErrors,
    readError: false,
  };
}

function printHuman(results) {
  let warningCount = 0;
  let errorCount = 0;

  for (const result of results) {
    for (const error of result.errors) {
      errorCount += 1;
      console.error(`${result.path}: error: ${error.message}`);
    }
    for (const warning of result.warnings) {
      warningCount += 1;
      const position = warning.sentence
        ? `line ${warning.line}, sentence ${warning.sentence}`
        : `line ${warning.line}`;
      console.error(
        `${result.path}: ${position}: warning: ${warning.kind} ${warning.length}/${warning.budget} — ${warning.text}`,
      );
    }
    if (result.warnings.length === 0 && result.errors.length === 0) {
      console.log(`${result.path}: within budgets (advisory)`);
    }
  }

  if (warningCount > 0 || errorCount > 0) {
    console.log(
      `${warningCount} advisory warning(s), ${errorCount} metadata/read error(s); review structure before editing.`,
    );
  }
}

function printJson(results) {
  const payload = {
    schema_version: 1,
    files: results.map((result) => ({
      path: result.path,
      doc_type: result.metadata?.doc_type ?? null,
      warnings: result.warnings,
      errors: result.errors,
    })),
    summary: {
      files: results.length,
      warnings: results.reduce((total, result) => total + result.warnings.length, 0),
      errors: results.reduce((total, result) => total + result.errors.length, 0),
      read_errors: results.filter((result) => result.readError).length,
    },
  };
  console.log(JSON.stringify(payload, null, 2));
}

const options = parseArgs(process.argv.slice(2));
const results = options.paths.map((path) => inspectFile(path, options.requireMetadata));

if (options.json) printJson(results);
else printHuman(results);

if (results.some((result) => result.readError)) process.exitCode = 2;
else if (results.some((result) => result.errors.length > 0)) process.exitCode = 1;
else process.exitCode = 0;
