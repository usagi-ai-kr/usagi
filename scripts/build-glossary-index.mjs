#!/usr/bin/env node
/**
 * Generate docs/glossary.md from the category documents.
 *
 * Usage:
 *   node scripts/build-glossary-index.mjs          # write
 *   node scripts/build-glossary-index.mjs --check  # fail if stale
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGlossary, renderIndex } from "./lib/glossary.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "docs/glossary.md");
const check = process.argv.includes("--check");
const glossary = loadGlossary(root);

if (glossary.errors.length > 0) {
  console.error(`✗ ${glossary.errors.length} glossary error(s):`);
  for (const error of glossary.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const rendered = renderIndex(glossary);

if (check) {
  if (!existsSync(target)) {
    console.error("✗ docs/glossary.md is missing; run node scripts/build-glossary-index.mjs");
    process.exit(1);
  }
  const current = readFileSync(target, "utf8");
  if (current !== rendered) {
    const currentLines = current.split("\n");
    const renderedLines = rendered.split("\n");
    const limit = Math.max(currentLines.length, renderedLines.length);
    for (let index = 0; index < limit; index += 1) {
      if (currentLines[index] !== renderedLines[index]) {
        console.error("✗ docs/glossary.md is out of date; run node scripts/build-glossary-index.mjs");
        console.error(`  first difference at line ${index + 1}`);
        console.error(`  current:  ${currentLines[index] ?? "<missing>"}`);
        console.error(`  expected: ${renderedLines[index] ?? "<missing>"}`);
        break;
      }
    }
    process.exit(1);
  }
  console.log(
    `✓ glossary index is current (${glossary.terms.length} terms in ${glossary.categories.length} categories)`,
  );
  process.exit(0);
}

writeFileSync(target, rendered);
console.log(
  `wrote docs/glossary.md (${glossary.terms.length} terms in ${glossary.categories.length} categories)`,
);
