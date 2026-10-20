/**
 * Optional Playwright adapter for scripts/e2e-runner.mjs.
 *
 * Playwright is NEVER installed here. Detection only reads what is already
 * installed; absence is reported as unavailable, never worked around.
 * Expected version when present: playwright 1.x (uses only the stable
 * chromium.launch / newContext / page API surface). Untested where no
 * browser exists; record that explicitly instead of claiming success.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

export function detectPlaywright() {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve("playwright/package.json");
    let version = "unknown";
    try {
      version = JSON.parse(readFileSync(packagePath, "utf8")).version ?? "unknown";
    } catch {
      version = "unknown";
    }
    return { available: true, version };
  } catch {
    return {
      available: false,
      reason: "playwright package is not installed (optional dependency, never auto-installed)",
    };
  }
}

function observeConsole(page, counters) {
  page.on("console", (message) => {
    if (message.type() === "error") counters.consoleErrors += 1;
  });
  page.on("pageerror", () => {
    counters.consoleErrors += 1;
  });
  page.on("requestfailed", () => {
    counters.networkFailures += 1;
  });
}

/**
 * Drive the reference behavior scenario: load the page, wait for the
 * readiness marker, flip the action control and read the outcome.
 * Throws on any failure; the caller preserves partial evidence.
 */
export async function runBehaviorScenario({
  url,
  viewport,
  dpr,
  locale,
  timezone,
  theme,
  opTimeoutMs,
  screenshotPath,
}) {
  const { chromium } = await import("playwright");
  const startedAt = Date.now();
  const counters = { consoleErrors: 0, networkFailures: 0 };
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: dpr,
      locale,
      timezoneId: timezone,
      colorScheme: theme === "dark" ? "dark" : "light",
    });
    try {
      const page = await context.newPage();
      observeConsole(page, counters);
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: opTimeoutMs,
      });
      const httpStatus = response?.status() ?? null;
      await page.waitForSelector('body[data-ready="true"]', {
        state: "attached",
        timeout: opTimeoutMs,
      });
      const title = await page.title();
      const heading = await page.textContent("#title");
      await page.click("#action", { timeout: opTimeoutMs });
      const statusAfterClick = await page.textContent("#status");
      const fontReady = await page.evaluate(() =>
        typeof document !== "undefined" && document.fonts
          ? document.fonts.status === "loaded"
          : true,
      );
      await page.screenshot({ path: screenshotPath });
      return {
        httpStatus,
        title,
        heading: heading?.trim() ?? null,
        statusAfterClick: statusAfterClick?.trim() ?? null,
        fontReady: fontReady === true,
        consoleErrors: counters.consoleErrors,
        networkFailures: counters.networkFailures,
        wallMs: Date.now() - startedAt,
      };
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
