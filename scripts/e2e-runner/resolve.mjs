/**
 * Single resolution path for the optional Playwright driver.
 *
 * Both detection and execution go through the resolved module entry, so a
 * detected package cannot fail later on a different resolver (import() alone
 * ignores NODE_PATH while createRequire does not). The driver is looked up
 * in the operator-chosen extra bases first, then the isolated optional
 * runtime (tools/e2e-reference), then a normal root install. Nothing is
 * ever installed here.
 */
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(ADAPTER_DIR, "..", "..");
const TOOLS_RUNTIME_DIR = join(REPO_ROOT, "tools", "e2e-reference");

export const DRIVER_PACKAGES = ["playwright", "playwright-core"];
export const SUPPORTED_MAJOR = 1;

export function runtimeBases(extraBases = []) {
  return [...extraBases, TOOLS_RUNTIME_DIR, REPO_ROOT];
}

export function readRuntimePin() {
  try {
    const manifest = JSON.parse(
      readFileSync(join(TOOLS_RUNTIME_DIR, "package.json"), "utf8"),
    );
    if (manifest !== null && typeof manifest === "object" && !Array.isArray(manifest)) {
      const dependencies = manifest.dependencies;
      if (dependencies !== null && typeof dependencies === "object" && !Array.isArray(dependencies)) {
        return dependencies;
      }
    }
  } catch {
    // No manifest: only the major-version gate applies.
  }
  return null;
}

function tryBase(baseDir, packageName) {
  try {
    const require = createRequire(join(baseDir, "package.json"));
    const entry = require.resolve(packageName);
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    let version = "unknown";
    try {
      version = JSON.parse(readFileSync(packageJsonPath, "utf8")).version ?? "unknown";
    } catch {
      version = "unknown";
    }
    return { entry, version };
  } catch {
    return null;
  }
}

function majorOf(version) {
  const match = /^(\d+)\./.exec(version ?? "");
  return match === null ? null : Number(match[1]);
}

/**
 * Locate the driver. Returns
 * { available: true, name, version, entry, baseDir } or
 * { available: false, reason }.
 */
export function detectDriver(extraBases = []) {
  for (const base of runtimeBases(extraBases)) {
    for (const name of DRIVER_PACKAGES) {
      const hit = tryBase(base, name);
      if (hit !== null) {
        return { available: true, name, version: hit.version, entry: hit.entry, baseDir: base };
      }
    }
  }
  return {
    available: false,
    reason:
      "no playwright/playwright-core driver found in the optional runtime or repo root (never auto-installed)",
  };
}

/**
 * Enforce the pinned/major policy. Returns null when the driver may be
 * used, otherwise a human-readable reason to report unavailable.
 */
export function checkDriverPolicy(detected) {
  if (majorOf(detected.version) !== SUPPORTED_MAJOR) {
    return `driver ${detected.name}@${detected.version} is outside supported major ${SUPPORTED_MAJOR}.x`;
  }
  const pin = readRuntimePin();
  if (pin !== null && typeof pin[detected.name] === "string" && pin[detected.name] !== detected.version) {
    return `driver ${detected.name}@${detected.version} does not match the pinned ${pin[detected.name]} in tools/e2e-reference/package.json`;
  }
  return null;
}

/**
 * Import the already-resolved driver entry. This is the same path
 * detection used, so resolution cannot diverge between the two.
 */
export async function loadDriver(entry) {
  const module = await import(pathToFileURL(entry).href);
  const chromium = module.chromium ?? module.default?.chromium ?? null;
  if (chromium === null || typeof chromium.launch !== "function") {
    throw new Error("resolved driver does not export a usable chromium object");
  }
  return { chromium };
}

/**
 * Preflight the browser binary without launching anything.
 * Returns { ok: true, path } or { ok: false, reason }.
 */
export function preflightExecutable(chromium) {
  let path = null;
  try {
    path = chromium.executablePath();
  } catch (error) {
    return { ok: false, reason: `cannot resolve the browser executable: ${error?.message ?? error}` };
  }
  try {
    if (statSync(path).isFile()) return { ok: true, path };
  } catch {
    // Missing binary: reported below, never thrown.
  }
  return { ok: false, reason: `browser executable absent: ${path}` };
}

/**
 * A launch failure that only says the executable is missing means the
 * optional browser is absent, not that the scenario failed.
 */
export function isMissingExecutableError(error) {
  return /executable[^.]{0,80}(doesn.?t exist|not found|has not been found)|browser has not been found/i.test(
    error?.message ?? "",
  );
}
