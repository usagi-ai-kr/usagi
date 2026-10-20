import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const checkerPath = fileURLToPath(
  new URL("./check-layer-deps.mjs", import.meta.url),
);
const exampleConfigPath = fileURLToPath(
  new URL("../docs/architecture-map.example.json", import.meta.url),
);
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const BASE_CONFIG = {
  root: ".",
  layers: {
    domain: ["src/domain/**"],
    app: ["src/app/**"],
    ui: ["src/ui/**"],
    infra: ["src/infra/**"],
  },
  allowed: {
    domain: [],
    app: ["domain"],
    ui: ["app", "domain"],
    infra: ["domain"],
  },
  exceptions: [],
  ignore: ["**/*.test.*", "**/*.spec.*", "**/node_modules/**"],
};

function makeTree(files, config = BASE_CONFIG) {
  const dir = mkdtempSync(join(tmpdir(), "layers-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  const configPath = join(dir, "map.json");
  writeFileSync(configPath, JSON.stringify(config));
  return { dir, configPath };
}

function runChecker(args = [], options = {}) {
  return spawnSync(process.execPath, [checkerPath, ...args], {
    encoding: "utf8",
    timeout: 30000,
    ...options,
  });
}

function runJson(dir, configPath, extraArgs = []) {
  const result = runChecker(
    ["--config", configPath, "--json", ...extraArgs],
    { cwd: dir },
  );
  return { result, report: JSON.parse(result.stdout) };
}

const CLEAN_FILES = {
  "src/domain/user.ts": "export interface User { id: string }\n",
  "src/app/service.ts":
    'import type { User } from "../domain/user";\nexport function get(id: string): User { return { id }; }\n',
  "src/ui/view.ts":
    'import { get } from "../app/service";\nimport type { User } from "../domain/user";\nexport const render = (u: User) => get(u.id);\n',
  "src/infra/repo.ts":
    'import type { User } from "../domain/user";\nexport function save(u: User): void { void u; }\n',
};

test("clean fixture exits 0 with ok summary", () => {
  const { dir, configPath } = makeTree(CLEAN_FILES);
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 0);
  assert.equal(report.schema_version, 1);
  assert.equal(report.summary.status, "ok");
  assert.deepEqual(report.violations, []);
  assert.equal(report.files_scanned, 4);
  assert.ok(report.imports_checked >= 4);
});

test("domain importing infra exits 1 with a domain->infra violation", () => {
  const { dir, configPath } = makeTree({
    ...CLEAN_FILES,
    "src/infra/db.ts": "export const db = {};\n",
    "src/domain/order.ts": 'import { db } from "../infra/db";\nexport const o = db;\n',
  });
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 1);
  assert.equal(report.summary.status, "violations");
  assert.equal(report.violations.length, 1);
  const [violation] = report.violations;
  assert.equal(violation.from_layer, "domain");
  assert.equal(violation.to_layer, "infra");
  assert.equal(violation.kind, "violation");
  assert.match(violation.file, /order\.ts$/);
});

test("infra importing an app port module is allowed", () => {
  const config = {
    ...BASE_CONFIG,
    allowed: { ...BASE_CONFIG.allowed, infra: ["domain", "app"] },
  };
  const { dir, configPath } = makeTree(
    {
      "src/app/ports.ts": "export interface Store { save(id: string): void }\n",
      "src/infra/adapter.ts":
        'import type { Store } from "../app/ports";\nexport const adapter: Store = { save: (id) => void id };\n',
    },
    config,
  );
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 0);
  assert.deepEqual(report.violations, []);
});

test("exception allows only the listed file", () => {
  const config = {
    ...BASE_CONFIG,
    exceptions: [
      {
        from: "app",
        to: "infra",
        file: "src/app/legacy/**",
        reason: "legacy migration",
      },
    ],
  };
  const { dir, configPath } = makeTree(
    {
      "src/infra/db.ts": "export const db = {};\n",
      "src/app/legacy/old.ts":
        'import { db } from "../../infra/db";\nexport const o = db;\n',
      "src/app/current.ts":
        'import { db } from "../infra/db";\nexport const c = db;\n',
    },
    config,
  );
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 1);
  assert.equal(report.violations.length, 1);
  assert.match(report.violations[0].file, /current\.ts$/);
  assert.equal(report.violations[0].kind, "violation");
  assert.equal(report.exceptions_applied, 1);
});

test("export-from and require are detected", () => {
  const { dir, configPath } = makeTree({
    "src/infra/y.ts": "export const y = 1;\n",
    "src/infra/z.ts": "module.exports = {};\n",
    "src/app/b.ts": 'export { y } from "../infra/y";\n',
    "src/app/c.ts": 'const z = require("../infra/z");\nexport default z;\n',
  });
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 1);
  const files = report.violations.map((v) => v.file).sort();
  assert.deepEqual(files, ["src/app/b.ts", "src/app/c.ts"]);
  for (const violation of report.violations) {
    assert.equal(violation.kind, "violation");
    assert.equal(violation.to_layer, "infra");
  }
});

test("unresolved relative import is a kind=unresolved violation", () => {
  const { dir, configPath } = makeTree({
    "src/app/broken.ts": 'import "./does-not-exist";\nexport const b = 1;\n',
  });
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 1);
  assert.equal(report.violations.length, 1);
  assert.equal(report.violations[0].kind, "unresolved");
  assert.equal(report.violations[0].to_layer, null);
});

test("--json carries schema and counts; --help exits 0", () => {
  const { dir, configPath } = makeTree(CLEAN_FILES);
  const { report } = runJson(dir, configPath);
  for (const field of [
    "schema_version",
    "root",
    "config",
    "files_scanned",
    "imports_checked",
    "violations",
    "exceptions_applied",
    "summary",
  ]) {
    assert.ok(field in report, `report must include ${field}`);
  }
  const help = runChecker(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});

test("missing config and invalid config exit 2", () => {
  const dir = mkdtempSync(join(tmpdir(), "layers-missing-"));
  tempDirs.push(dir);
  const missing = runChecker(["--config", join(dir, "nope.json")]);
  assert.equal(missing.status, 2);

  const badPath = join(dir, "bad.json");
  writeFileSync(badPath, JSON.stringify({ layers: [], allowed: {} }));
  const invalid = runChecker(["--config", badPath]);
  assert.equal(invalid.status, 2);

  const unknownOption = runChecker(["--bogus"]);
  assert.equal(unknownOption.status, 2);
});

test("ignore glob skips test files", () => {
  const { dir, configPath } = makeTree({
    "src/infra/db.ts": "export const db = {};\n",
    "src/app/bad.test.ts":
      'import { db } from "../infra/db";\nexport const t = db;\n',
  });
  const { result, report } = runJson(dir, configPath);
  assert.equal(result.status, 0);
  assert.deepEqual(report.violations, []);
});

test("shipped example map is a valid config for a clean tree", () => {
  const dir = mkdtempSync(join(tmpdir(), "layers-example-"));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(CLEAN_FILES)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  const { result, report } = runJson(dir, exampleConfigPath, [
    "--root",
    dir,
  ]);
  assert.equal(result.status, 0);
  assert.equal(report.summary.status, "ok");
});
