import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir, platform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const checkerPath = fileURLToPath(new URL("./check-diagrams.mjs", import.meta.url));
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

function writeDocs(files) {
  const dir = makeTemp("diagrams-docs-");
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Block body lines joined with \n plus one trailing newline.
function sourceHash(...lines) {
  return sha256Hex(`${lines.join("\n")}\n`);
}

function runChecker(args = []) {
  return spawnSync(process.execPath, [checkerPath, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
}

function mermaidDoc(...bodies) {
  const parts = ["# Doc", ""];
  for (const body of bodies) {
    parts.push("```mermaid", ...body, "```", "");
  }
  return `${parts.join("\n")}`;
}

const FLOW = ["flowchart TD", "    A-->B"];
const SEQ = ["sequenceDiagram", "    A->>B: hi"];

function manifestFile(dir, entries) {
  const manifest = { schema_version: 1, artifacts: entries };
  writeFileSync(join(dir, "diagram-artifacts.json"), JSON.stringify(manifest, null, 2));
}

function manifestEntry({ source, block, body, artifact, artifactBytes, renderer = "mermaid-cli@11.4.1" }) {
  return {
    source,
    block,
    source_sha256: sourceHash(...body),
    artifact,
    artifact_sha256: sha256Hex(artifactBytes),
    renderer,
  };
}

test("normal mermaid blocks pass with no warnings", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW, SEQ) });
  const run = runChecker(["--docs", dir]);
  assert.equal(run.status, 0);
  assert.doesNotMatch(run.stdout, /^(error|warning) /m);
  assert.match(run.stdout, /diagram-gate: valid/);
});

test("tilde fences are extracted too", () => {
  const dir = writeDocs({ "doc.md": ["# Doc", "", "~~~mermaid", ...FLOW, "~~~", ""].join("\n") });
  const run = runChecker(["--docs", dir, "--json"]);
  assert.equal(run.status, 0);
  const report = JSON.parse(run.stdout);
  assert.equal(report.summary.blocks, 1);
  assert.equal(report.blocks[0].type, "flowchart");
});

test("empty and whitespace-only blocks are hard errors", () => {
  const dir = writeDocs({
    "doc.md": ["# Doc", "", "```mermaid", "```", "", "```mermaid", "   ", "```", ""].join("\n"),
  });
  const run = runChecker(["--docs", dir]);
  assert.equal(run.status, 1);
  const matches = run.stdout.match(/error empty_diagram/g) ?? [];
  assert.equal(matches.length, 2);
});

test("unknown diagram type is a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(["notAType foo", "    x"]) });
  const run = runChecker(["--docs", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error unknown_diagram_type/);
});

test("unbalanced brackets are a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(["flowchart TD", "    A[broken"]) });
  const run = runChecker(["--docs", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error unbalanced_brackets/);
});

test("quoted brackets do not count as unbalanced", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(["flowchart TD", '    A["a]b"]-->B']) });
  const run = runChecker(["--docs", dir]);
  assert.equal(run.status, 0);
});

test("artifact source hash mismatch is a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  const svg = "<svg></svg>";
  writeFileSync(join(dir, "a.svg"), svg);
  manifestFile(dir, [
    { ...manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "a.svg", artifactBytes: svg }), source_sha256: "0".repeat(64) },
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_source_hash_mismatch/);
});

test("artifact hash mismatch is a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  writeFileSync(join(dir, "a.svg"), "<svg></svg>");
  manifestFile(dir, [
    { ...manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "a.svg", artifactBytes: "<svg></svg>" }), artifact_sha256: "1".repeat(64) },
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_hash_mismatch/);
});

test("missing artifact file is a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  manifestFile(dir, [
    manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "gone.svg", artifactBytes: "<svg></svg>" }),
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_missing/);
});

test("orphan manifest entry is a hard error", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  manifestFile(dir, [
    manifestEntry({ source: "other.md", block: 3, body: FLOW, artifact: "a.svg", artifactBytes: "<svg></svg>" }),
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_orphan/);
});

test("absent manifest is an unavailable warning, not a success claim", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /warning manifest_unavailable/);
});

test("--require-svg fails blocks without a matching svg entry", () => {
  const noEntry = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  manifestFile(noEntry, []);
  const missing = runChecker(["--docs", noEntry, "--artifact-root", noEntry, "--require-svg"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /error missing_manifest_entry/);

  const pngDir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  writeFileSync(join(pngDir, "a.png"), "PNGDATA");
  manifestFile(pngDir, [
    manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "a.png", artifactBytes: "PNGDATA" }),
  ]);
  const nonSvg = runChecker(["--docs", pngDir, "--artifact-root", pngDir, "--require-svg"]);
  assert.equal(nonSvg.status, 1);
  assert.match(nonSvg.stdout, /error non_svg_artifact/);
});

test("svg with external url or script warns but stays valid", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    '<image href="https://evil.example/p.png"/>',
    "<script>alert(1)</script>",
    "</svg>",
    "",
  ].join("\n");
  writeFileSync(join(dir, "a.svg"), svg);
  manifestFile(dir, [
    manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "a.svg", artifactBytes: svg }),
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /warning svg_external_url/);
  assert.match(run.stdout, /warning svg_script_content/);
});

test("symlink escape from the artifact root is a hard error", (t) => {
  if (platform() === "win32") {
    t.skip("symlink creation needs privileges unavailable on this platform");
    return;
  }
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  const outside = makeTemp("diagrams-outside-");
  const secret = "<svg>outside</svg>";
  writeFileSync(join(outside, "evil.svg"), secret);
  try {
    symlinkSync(join(outside, "evil.svg"), join(dir, "leak.svg"));
  } catch {
    t.skip("symlink creation failed on this platform");
    return;
  }
  manifestFile(dir, [
    manifestEntry({ source: "doc.md", block: 1, body: FLOW, artifact: "leak.svg", artifactBytes: secret }),
  ]);
  const run = runChecker(["--docs", dir, "--artifact-root", dir]);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /error artifact_outside_root/);
});

test("--json output parses and carries stable fields", () => {
  const dir = writeDocs({ "doc.md": mermaidDoc(FLOW, SEQ) });
  const run = runChecker(["--docs", dir, "--json"]);
  assert.equal(run.status, 0);
  const report = JSON.parse(run.stdout);
  assert.equal(report.schema_version, 1);
  assert.equal(report.docs, dir);
  assert.equal(Array.isArray(report.blocks), true);
  assert.equal(report.blocks.length, 2);
  assert.deepEqual(
    report.blocks.map((block) => block.type),
    ["flowchart", "sequenceDiagram"],
  );
  for (const block of report.blocks) {
    for (const field of ["source", "index", "type", "source_sha256", "mapped", "artifact"]) {
      assert.ok(field in block, `block must include ${field}`);
    }
    assert.match(block.source_sha256, /^[0-9a-f]{64}$/);
  }
  for (const field of ["errors", "warnings", "summary"]) {
    assert.ok(field in report, `report must include ${field}`);
  }
  assert.equal(typeof report.summary.blocks, "number");
  assert.equal(typeof report.summary.errors, "number");
  assert.equal(typeof report.summary.warnings, "number");
});

test("usage and read errors exit 2", () => {
  assert.equal(runChecker([]).status, 0, "default docs is cwd");
  assert.equal(runChecker(["--bogus"]).status, 2);
  assert.equal(runChecker(["--docs"]).status, 2);
  const dir = makeTemp("diagrams-missing-");
  assert.equal(runChecker(["--docs", join(dir, "nope")]).status, 2);

  const badManifest = writeDocs({ "doc.md": mermaidDoc(FLOW) });
  writeFileSync(join(badManifest, "diagram-artifacts.json"), "{ not json");
  assert.equal(runChecker(["--docs", badManifest, "--artifact-root", badManifest]).status, 2);
});

test("--help exits 0 and documents the flags", () => {
  const run = runChecker(["--help"]);
  assert.equal(run.status, 0);
  for (const flag of ["--docs", "--json", "--require-svg", "--artifact-root", "--help"]) {
    assert.ok(run.stdout.includes(flag), `help must document ${flag}`);
  }
});
