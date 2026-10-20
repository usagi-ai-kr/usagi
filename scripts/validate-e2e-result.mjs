#!/usr/bin/env node
/**
 * Fail-closed validator for the E2E result contract.
 *
 * Contract: docs/e2e-contract.md
 * Schema:   docs/e2e-result.schema.json
 *
 * Usage: node scripts/validate-e2e-result.mjs --result <file> [options]
 *
 * Exit codes:
 *   0  valid result (warnings allowed)
 *   1  invalid result
 *   2  usage, read or config error
 *
 * The validator only reads files: it never writes and installs nothing.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import process from "node:process";

const USAGE = `Validate an E2E result document against docs/e2e-contract.md.

Usage:
  node scripts/validate-e2e-result.mjs --result <file> [options]

Options:
  --result <file>            result JSON document to validate (required)
  --expected-sha <sha>       require target.commit_sha to match (case-insensitive)
  --expected-viewport <WxH>  require environment.viewport to match, e.g. 1280x720
  --expected-dpr <number>    require environment.dpr to match, e.g. 2
  --artifact-root <dir>      resolve artifacts under this root, check existence, size and SHA-256
  --json                     print a machine-readable report (only JSON on stdout)
  --help                     show this help

Exit codes:
  0  valid result (warnings allowed)
  1  invalid result
  2  usage, read or config error
`;

const TOP_LEVEL_FIELDS = [
  "schema_version",
  "run_id",
  "target",
  "environment",
  "scenario",
  "budgets",
  "result",
  "artifacts",
  "evidence",
  "masking",
  "started_at",
  "duration_ms",
  "completeness",
];

const SCENARIO_KINDS = ["behavior", "visual", "mixed"];
const RESULT_STATUSES = ["passed", "failed", "blocked", "unavailable"];
const ASSERTION_STATUSES = ["passed", "failed", "blocked"];
const ARTIFACT_TYPES = ["screenshot", "trace", "video", "log", "json"];
const COMPLETENESS_VALUES = ["complete", "partial", "unavailable"];

const COMMIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = {
    result: null,
    expectedSha: null,
    expectedViewport: null,
    expectedDpr: null,
    artifactRoot: null,
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
      case "--result":
        options.result = readValue();
        break;
      case "--expected-sha":
        options.expectedSha = readValue();
        break;
      case "--expected-viewport":
        options.expectedViewport = readValue();
        break;
      case "--expected-dpr":
        options.expectedDpr = readValue();
        break;
      case "--artifact-root":
        options.artifactRoot = readValue();
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
  return options;
}

function parseExpectedSha(value) {
  if (!COMMIT_SHA_PATTERN.test(value)) {
    throw new UsageError(
      `--expected-sha must be 40 or 64 hexadecimal characters, got: ${value}`,
    );
  }
  return value.toLowerCase();
}

function parseExpectedViewport(value) {
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) {
    throw new UsageError(`--expected-viewport must be <WxH>, got: ${value}`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseExpectedDpr(value) {
  const dpr = Number(value);
  if (!Number.isFinite(dpr) || dpr <= 0) {
    throw new UsageError(`--expected-dpr must be a positive number, got: ${value}`);
  }
  return dpr;
}

function validateResult(result, expectations) {
  const errors = [];
  const warnings = [];
  const artifactChecks = [];

  const err = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  const joinPath = (basePath, key) => (basePath ? `${basePath}.${key}` : key);

  const checkKeys = (object, basePath, known) => {
    for (const key of Object.keys(object)) {
      if (!known.includes(key)) {
        err(
          "unknown_field",
          joinPath(basePath, key),
          `unknown field "${joinPath(basePath, key)}"; allowed fields: ${known.join(", ")}`,
        );
      }
    }
  };

  const requireString = (object, key, basePath, optional = false) => {
    const path = joinPath(basePath, key);
    if (!has(object, key)) {
      if (!optional) err("missing_field", path, `missing required field "${path}"`);
      return null;
    }
    const value = object[key];
    if (typeof value !== "string" || value.trim() === "") {
      err("invalid_type", path, `"${path}" must be a non-empty string`);
      return null;
    }
    return value;
  };

  const requireInteger = (object, key, basePath, { min = null } = {}) => {
    const path = joinPath(basePath, key);
    if (!has(object, key)) {
      err("missing_field", path, `missing required field "${path}"`);
      return null;
    }
    const value = object[key];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      err("invalid_type", path, `"${path}" must be an integer`);
      return null;
    }
    if (min !== null && value < min) {
      const code = min === 0 ? "negative_value" : "invalid_value";
      err(code, path, `"${path}" must be >= ${min}, got ${value}`);
      return null;
    }
    return value;
  };

  const requireEnum = (object, key, basePath, allowed) => {
    const path = joinPath(basePath, key);
    if (!has(object, key)) {
      err("missing_field", path, `missing required field "${path}"`);
      return null;
    }
    const value = object[key];
    if (!allowed.includes(value)) {
      err(
        "invalid_enum",
        path,
        `"${path}" must be one of ${allowed.map((item) => JSON.stringify(item)).join(" | ")}, got ${JSON.stringify(value)}`,
      );
      return null;
    }
    return value;
  };

  const requireBoolean = (object, key, basePath) => {
    const path = joinPath(basePath, key);
    if (!has(object, key)) {
      err("missing_field", path, `missing required field "${path}"`);
      return null;
    }
    const value = object[key];
    if (typeof value !== "boolean") {
      err("invalid_type", path, `"${path}" must be a boolean`);
      return null;
    }
    return value;
  };

  if (!isObject(result)) {
    err("invalid_type", "", "result document must be a JSON object");
    return { errors, warnings };
  }

  checkKeys(result, "", TOP_LEVEL_FIELDS);
  for (const key of TOP_LEVEL_FIELDS) {
    if (!has(result, key)) {
      err("missing_field", key, `missing required field "${key}"`);
    }
  }

  if (has(result, "schema_version") && result.schema_version !== 1) {
    err(
      "unsupported_schema_version",
      "schema_version",
      `unsupported schema_version: expected 1, got ${JSON.stringify(result.schema_version)}`,
    );
  }

  requireString(result, "run_id", "");

  if (has(result, "target")) {
    const target = result.target;
    if (!isObject(target)) {
      err("invalid_type", "target", `"target" must be an object`);
    } else {
      checkKeys(target, "target", ["url", "commit_sha", "start_command"]);
      requireString(target, "url", "target");
      if (!has(target, "commit_sha")) {
        err("missing_field", "target.commit_sha", `missing required field "target.commit_sha"`);
      } else {
        const sha = target.commit_sha;
        if (typeof sha !== "string") {
          err("invalid_type", "target.commit_sha", `"target.commit_sha" must be a string`);
        } else if (!COMMIT_SHA_PATTERN.test(sha)) {
          err(
            "invalid_commit_sha",
            "target.commit_sha",
            `"target.commit_sha" must be 40 or 64 hexadecimal characters, got ${sha.length} characters`,
          );
        } else if (expectations.expectedSha !== null && sha.toLowerCase() !== expectations.expectedSha) {
          err(
            "sha_mismatch",
            "target.commit_sha",
            `target.commit_sha does not match --expected-sha: got ${sha}, expected ${expectations.expectedSha}`,
          );
        }
      }
      requireString(target, "start_command", "target", true);
    }
  }

  let dpr = null;
  let fontReady = null;
  let viewport = null;
  if (has(result, "environment")) {
    const environment = result.environment;
    if (!isObject(environment)) {
      err("invalid_type", "environment", `"environment" must be an object`);
    } else {
      checkKeys(environment, "environment", [
        "os",
        "arch",
        "browser",
        "browser_version",
        "viewport",
        "dpr",
        "locale",
        "timezone",
        "theme",
        "font_ready",
      ]);
      for (const key of ["os", "arch", "browser", "browser_version", "locale", "timezone", "theme"]) {
        requireString(environment, key, "environment");
      }
      fontReady = requireBoolean(environment, "font_ready", "environment");
      if (has(environment, "dpr")) {
        const value = environment.dpr;
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          err("invalid_value", "environment.dpr", `"environment.dpr" must be a positive number`);
        } else {
          dpr = value;
        }
      } else {
        err("missing_field", "environment.dpr", `missing required field "environment.dpr"`);
      }
      if (has(environment, "viewport")) {
        const candidate = environment.viewport;
        if (!isObject(candidate)) {
          err("invalid_type", "environment.viewport", `"environment.viewport" must be an object`);
        } else {
          checkKeys(candidate, "environment.viewport", ["width", "height"]);
          const width = requireInteger(candidate, "width", "environment.viewport", { min: 1 });
          const height = requireInteger(candidate, "height", "environment.viewport", { min: 1 });
          if (width !== null && height !== null) viewport = { width, height };
        }
      } else {
        err("missing_field", "environment.viewport", `missing required field "environment.viewport"`);
      }
    }
  }

  if (
    expectations.expectedViewport !== null &&
    viewport !== null &&
    (viewport.width !== expectations.expectedViewport.width ||
      viewport.height !== expectations.expectedViewport.height)
  ) {
    err(
      "viewport_mismatch",
      "environment.viewport",
      `environment.viewport does not match --expected-viewport: got ${viewport.width}x${viewport.height}, expected ${expectations.expectedViewport.width}x${expectations.expectedViewport.height}`,
    );
  }
  if (expectations.expectedDpr !== null && dpr !== null && dpr !== expectations.expectedDpr) {
    err(
      "dpr_mismatch",
      "environment.dpr",
      `environment.dpr does not match --expected-dpr: got ${dpr}, expected ${expectations.expectedDpr}`,
    );
  }

  let kind = null;
  if (has(result, "scenario")) {
    const scenario = result.scenario;
    if (!isObject(scenario)) {
      err("invalid_type", "scenario", `"scenario" must be an object`);
    } else {
      checkKeys(scenario, "scenario", ["id", "kind"]);
      requireString(scenario, "id", "scenario");
      kind = requireEnum(scenario, "kind", "scenario", SCENARIO_KINDS);
    }
  }

  let wallTimeMs = null;
  if (has(result, "budgets")) {
    const budgets = result.budgets;
    if (!isObject(budgets)) {
      err("invalid_type", "budgets", `"budgets" must be an object`);
    } else {
      checkKeys(budgets, "budgets", ["wall_time_ms", "peak_rss_mb", "max_processes"]);
      wallTimeMs = requireInteger(budgets, "wall_time_ms", "budgets", { min: 0 });
      requireInteger(budgets, "peak_rss_mb", "budgets", { min: 0 });
      requireInteger(budgets, "max_processes", "budgets", { min: 0 });
    }
  }

  let status = null;
  let exitCode = null;
  let assertions = null;
  if (has(result, "result")) {
    const outcome = result.result;
    if (!isObject(outcome)) {
      err("invalid_type", "result", `"result" must be an object`);
    } else {
      checkKeys(outcome, "result", ["status", "exit_code", "assertions"]);
      status = requireEnum(outcome, "status", "result", RESULT_STATUSES);
      if (has(outcome, "exit_code")) {
        const value = outcome.exit_code;
        if (typeof value !== "number" || !Number.isInteger(value)) {
          err("invalid_type", "result.exit_code", `"result.exit_code" must be an integer`);
        } else {
          exitCode = value;
        }
      } else {
        err("missing_field", "result.exit_code", `missing required field "result.exit_code"`);
      }
      if (has(outcome, "assertions")) {
        const list = outcome.assertions;
        if (!Array.isArray(list)) {
          err("invalid_type", "result.assertions", `"result.assertions" must be an array`);
        } else {
          assertions = list;
          list.forEach((assertion, index) => {
            const basePath = `result.assertions[${index}]`;
            if (!isObject(assertion)) {
              err("invalid_type", basePath, `"${basePath}" must be an object`);
              return;
            }
            checkKeys(assertion, basePath, ["id", "status", "message"]);
            requireString(assertion, "id", basePath);
            requireEnum(assertion, "status", basePath, ASSERTION_STATUSES);
            requireString(assertion, "message", basePath, true);
          });
        }
      } else {
        err("missing_field", "result.assertions", `missing required field "result.assertions"`);
      }
    }
  }

  let artifacts = null;
  if (has(result, "artifacts")) {
    const list = result.artifacts;
    if (!Array.isArray(list)) {
      err("invalid_type", "artifacts", `"artifacts" must be an array`);
    } else {
      artifacts = list;
      list.forEach((artifact, index) => {
        const basePath = `artifacts[${index}]`;
        if (!isObject(artifact)) {
          err("invalid_type", basePath, `"${basePath}" must be an object`);
          return;
        }
        checkKeys(artifact, basePath, ["type", "path", "sha256", "size_bytes"]);
        requireEnum(artifact, "type", basePath, ARTIFACT_TYPES);
        const declaredSize = requireInteger(artifact, "size_bytes", basePath, { min: 0 });

        let declaredSha = null;
        if (!has(artifact, "sha256")) {
          err("missing_field", `${basePath}.sha256`, `missing required field "${basePath}.sha256"`);
        } else if (typeof artifact.sha256 !== "string") {
          err("invalid_type", `${basePath}.sha256`, `"${basePath}.sha256" must be a string`);
        } else if (!SHA256_PATTERN.test(artifact.sha256)) {
          err(
            "invalid_artifact_sha",
            `${basePath}.sha256`,
            `"${basePath}.sha256" must be 64 hexadecimal characters`,
          );
        } else {
          declaredSha = artifact.sha256.toLowerCase();
        }

        const artifactPath = requireString(artifact, "path", basePath);
        if (artifactPath !== null) {
          if (isAbsolute(artifactPath)) {
            err(
              "artifact_path_absolute",
              `${basePath}.path`,
              `artifact path must be relative: ${artifactPath}`,
            );
          } else if (artifactPath.split(/[\\/]/).includes("..")) {
            err(
              "artifact_path_escape",
              `${basePath}.path`,
              `artifact path must not contain ".." segments: ${artifactPath}`,
            );
          } else {
            artifactChecks.push({ artifactPath, basePath, declaredSha, declaredSize });
          }
        }
      });
    }
  }

  let consoleErrors = null;
  let networkFailures = null;
  if (has(result, "evidence")) {
    const evidence = result.evidence;
    if (!isObject(evidence)) {
      err("invalid_type", "evidence", `"evidence" must be an object`);
    } else {
      checkKeys(evidence, "evidence", ["console_errors", "network_failures", "stdout_ref", "stderr_ref"]);
      consoleErrors = requireInteger(evidence, "console_errors", "evidence", { min: 0 });
      networkFailures = requireInteger(evidence, "network_failures", "evidence", { min: 0 });
      requireString(evidence, "stdout_ref", "evidence", true);
      requireString(evidence, "stderr_ref", "evidence", true);
    }
  }

  let maskingApplied = null;
  if (has(result, "masking")) {
    const masking = result.masking;
    if (!isObject(masking)) {
      err("invalid_type", "masking", `"masking" must be an object`);
    } else {
      checkKeys(masking, "masking", ["applied", "fields"]);
      maskingApplied = requireBoolean(masking, "applied", "masking");
      if (has(masking, "fields")) {
        const fields = masking.fields;
        if (!Array.isArray(fields)) {
          err("invalid_type", "masking.fields", `"masking.fields" must be an array of strings`);
        } else {
          fields.forEach((field, index) => {
            if (typeof field !== "string" || field.trim() === "") {
              err("invalid_type", `masking.fields[${index}]`, `"masking.fields[${index}]" must be a non-empty string`);
            }
          });
        }
      } else {
        err("missing_field", "masking.fields", `missing required field "masking.fields"`);
      }
    }
  }

  if (has(result, "started_at")) {
    const value = result.started_at;
    if (typeof value !== "string") {
      err("invalid_type", "started_at", `"started_at" must be a string`);
    } else if (!ISO_DATETIME.test(value) || Number.isNaN(Date.parse(value))) {
      err("invalid_date", "started_at", `"started_at" must be an ISO 8601 date-time, got: ${value}`);
    }
  }
  const durationMs = requireInteger(result, "duration_ms", "", { min: 0 });
  const completeness = requireEnum(result, "completeness", "", COMPLETENESS_VALUES);

  if (expectations.artifactRoot !== null) {
    const rootResolved = resolve(expectations.artifactRoot);
    for (const { artifactPath, basePath, declaredSha, declaredSize } of artifactChecks) {
      const resolved = resolve(rootResolved, artifactPath);
      if (resolved !== rootResolved && !resolved.startsWith(rootResolved + sep)) {
        err(
          "artifact_outside_root",
          `${basePath}.path`,
          `artifact path resolves outside --artifact-root: ${artifactPath}`,
        );
        continue;
      }
      let stats;
      try {
        stats = statSync(resolved);
      } catch {
        err("artifact_missing", `${basePath}.path`, `artifact file not found: ${artifactPath}`);
        continue;
      }
      if (!stats.isFile()) {
        err("artifact_missing", `${basePath}.path`, `artifact is not a regular file: ${artifactPath}`);
        continue;
      }
      if (declaredSize !== null && stats.size !== declaredSize) {
        err(
          "artifact_size_mismatch",
          `${basePath}.path`,
          `artifact size mismatch for ${artifactPath}: declared ${declaredSize}, actual ${stats.size}`,
        );
        continue;
      }
      if (declaredSha !== null) {
        let content;
        try {
          content = readFileSync(resolved);
        } catch {
          err("artifact_unreadable", `${basePath}.path`, `artifact file cannot be read: ${artifactPath}`);
          continue;
        }
        const actualSha = createHash("sha256").update(content).digest("hex");
        if (actualSha !== declaredSha) {
          err(
            "artifact_hash_mismatch",
            `${basePath}.path`,
            `artifact SHA-256 mismatch for ${artifactPath}: declared ${declaredSha}, actual ${actualSha}`,
          );
        }
      }
    }
  }

  const passed = status === "passed";
  const failed = status === "failed";
  const visual = kind === "visual" || kind === "mixed";
  const hasScreenshot =
    Array.isArray(artifacts) && artifacts.some((item) => isObject(item) && item.type === "screenshot");

  if (passed && exitCode !== null && exitCode !== 0) {
    err(
      "passed_exit_code_mismatch",
      "result.exit_code",
      `status "passed" requires exit_code 0, got ${exitCode}`,
    );
  }
  if (failed && exitCode !== null && exitCode === 0) {
    err(
      "failed_exit_code_mismatch",
      "result.exit_code",
      `status "failed" requires a non-zero exit_code, got 0`,
    );
  }
  if (passed && Array.isArray(assertions)) {
    const index = assertions.findIndex((item) => isObject(item) && item.status === "failed");
    if (index !== -1) {
      const id = isObject(assertions[index]) ? assertions[index].id : null;
      err(
        "passed_failed_assertion",
        `result.assertions[${index}].status`,
        `status "passed" must not have a failed assertion: ${typeof id === "string" ? id : `index ${index}`}`,
      );
    }
  }
  if (passed && completeness !== null && completeness !== "complete") {
    err(
      "passed_incomplete",
      "completeness",
      `status "passed" requires completeness "complete", got "${completeness}"`,
    );
  }
  if (passed && durationMs !== null && wallTimeMs !== null && durationMs > wallTimeMs) {
    err(
      "budget_exceeded",
      "duration_ms",
      `duration_ms ${durationMs} exceeds budgets.wall_time_ms ${wallTimeMs} for a passed run`,
    );
  }
  if (passed && visual && fontReady === false) {
    err(
      "font_not_ready",
      "environment.font_ready",
      `scenario.kind "${kind}" requires font_ready true for a passed run`,
    );
  }
  if (passed && visual && Array.isArray(artifacts) && !hasScreenshot) {
    err(
      "missing_screenshot",
      "artifacts",
      `scenario.kind "${kind}" requires a screenshot artifact for a passed run`,
    );
  }

  if (Array.isArray(artifacts) && artifacts.length > 0 && expectations.artifactRoot === null) {
    warn(
      "artifacts_unverified",
      "artifacts",
      `${artifacts.length} artifact(s) present but --artifact-root was not provided; existence, size and SHA-256 were not verified`,
    );
  }
  if (hasScreenshot && maskingApplied === false) {
    warn(
      "masking_not_applied",
      "masking.applied",
      "a screenshot artifact is present but masking.applied is false; treat artifacts as sensitive",
    );
  }
  if (passed && consoleErrors !== null && consoleErrors > 0) {
    warn(
      "passed_console_errors",
      "evidence.console_errors",
      `passed run has ${consoleErrors} console error(s); review them before trusting the result`,
    );
  }
  if (passed && networkFailures !== null && networkFailures > 0) {
    warn(
      "passed_network_failures",
      "evidence.network_failures",
      `passed run has ${networkFailures} network failure(s); review them before trusting the result`,
    );
  }
  if (passed && Array.isArray(artifacts) && artifacts.length === 0) {
    warn(
      "passed_no_artifacts",
      "artifacts",
      "passed run has no artifacts; evidence is behavior-only",
    );
  }

  return { errors, warnings };
}

function usageFailure(json, message, resultPath, code = "usage_error") {
  if (json) {
    console.log(
      JSON.stringify(
        {
          schema_version: 1,
          result: resultPath,
          valid: false,
          errors: [{ code, path: null, message }],
          warnings: [],
          summary: { errors: 1, warnings: 0 },
        },
        null,
        2,
      ),
    );
  } else {
    console.error(`error: ${message}`);
    console.error("run with --help for usage");
  }
  return 2;
}

function emitHuman(report) {
  for (const error of report.errors) {
    console.log(`error ${error.code}${error.path ? ` at ${error.path}` : ""}: ${error.message}`);
  }
  for (const warning of report.warnings) {
    console.log(`warning ${warning.code}${warning.path ? ` at ${warning.path}` : ""}: ${warning.message}`);
  }
  console.log(
    `summary: ${report.valid ? "valid" : "invalid"} (${report.summary.errors} error(s), ${report.summary.warnings} warning(s))`,
  );
}

function run(argv) {
  // Pre-scan so usage failures can also honor --json.
  const json = argv.includes("--json");

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    return usageFailure(json, error.message, null);
  }

  if (options.help) {
    console.log(USAGE.trimEnd());
    return 0;
  }

  if (options.result === null) {
    return usageFailure(json, "--result is required", null);
  }

  let expectedSha = null;
  let expectedViewport = null;
  let expectedDpr = null;
  try {
    if (options.expectedSha !== null) expectedSha = parseExpectedSha(options.expectedSha);
    if (options.expectedViewport !== null) {
      expectedViewport = parseExpectedViewport(options.expectedViewport);
    }
    if (options.expectedDpr !== null) expectedDpr = parseExpectedDpr(options.expectedDpr);
  } catch (error) {
    return usageFailure(json, error.message, options.result);
  }

  if (options.artifactRoot !== null) {
    let isDirectory = false;
    try {
      isDirectory = statSync(options.artifactRoot).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      return usageFailure(json, `--artifact-root is not a directory: ${options.artifactRoot}`, options.result, "config_error");
    }
  }

  let raw;
  try {
    raw = readFileSync(options.result, "utf8");
  } catch (error) {
    return usageFailure(json, `cannot read result file ${options.result}: ${error.message}`, options.result, "read_error");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return usageFailure(json, `invalid JSON in result file ${options.result}: ${error.message}`, options.result, "parse_error");
  }

  const { errors, warnings } = validateResult(parsed, {
    expectedSha,
    expectedViewport,
    expectedDpr,
    artifactRoot: options.artifactRoot,
  });

  const report = {
    schema_version: 1,
    result: options.result,
    valid: errors.length === 0,
    errors,
    warnings,
    summary: { errors: errors.length, warnings: warnings.length },
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    emitHuman(report);
  }

  return report.valid ? 0 : 1;
}

process.exit(run(process.argv.slice(2)));
