/**
 * Playwright behavior scenario for scripts/e2e-runner.mjs.
 *
 * The chromium module is injected by the caller (resolved through
 * resolve.mjs), so this file never resolves or installs anything itself.
 * A trace starts before navigation. On any scenario failure the runner
 * gets a screenshot (only if the page is still alive) and the stopped
 * trace archive; paths that were never written are reported as null and
 * must never be fabricated into artifacts by the caller.
 * Untested where no browser exists; do not claim otherwise.
 */
import { existsSync, statSync } from "node:fs";

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

function writtenFile(path) {
  try {
    if (path !== null && existsSync(path) && statSync(path).isFile() && statSync(path).size > 0) {
      return path;
    }
  } catch {
    // Treated as absent below.
  }
  return null;
}

/**
 * Drive the reference behavior scenario: load the page, wait for the
 * readiness marker, flip the action control and read the outcome.
 * Returns { observations|null, screenshot, trace, failed } where failed is
 * an error message or null. Never throws for scenario failures; launch and
 * context failures propagate to the caller.
 */
export async function runBehaviorScenario({
  chromium,
  url,
  viewport,
  dpr,
  locale,
  timezone,
  theme,
  opTimeoutMs,
  screenshotPath,
  tracePath,
}) {
  const startedAt = Date.now();
  const counters = { consoleErrors: 0, networkFailures: 0 };
  const browser = await chromium.launch({ headless: true });
  let browserVersion = "unavailable";
  try {
    const reported = browser.version();
    if (typeof reported === "string" && reported !== "") browserVersion = reported;
  } catch {
    browserVersion = "unavailable";
  }
  let context = null;
  let page = null;
  let observations = null;
  let failed = null;
  let traced = false;
  try {
    context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: dpr,
      locale,
      timezoneId: timezone,
      colorScheme: theme === "dark" ? "dark" : "light",
    });
    page = await context.newPage();
    observeConsole(page, counters);
    try {
      await context.tracing.start({ screenshots: true, snapshots: false });
      traced = true;
    } catch {
      traced = false;
    }
    try {
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
      await page.screenshot({ path: screenshotPath, timeout: opTimeoutMs });
      observations = {
        httpStatus,
        title,
        heading: heading?.trim() ?? null,
        statusAfterClick: statusAfterClick?.trim() ?? null,
        fontReady: fontReady === true,
        consoleErrors: counters.consoleErrors,
        networkFailures: counters.networkFailures,
        wallMs: Date.now() - startedAt,
      };
    } catch (scenarioError) {
      failed = scenarioError?.message ?? String(scenarioError);
      try {
        if (page !== null && !page.isClosed()) {
          await page.screenshot({ path: screenshotPath, timeout: 10000 });
        }
      } catch {
        // A dead page yields no screenshot; the trace below may still exist.
      }
    }
    if (traced) {
      try {
        await context.tracing.stop({ path: tracePath });
      } catch {
        // A broken context yields no trace archive.
      }
    }
  } finally {
    try {
      await browser.close();
    } catch {
      // Best effort; leftovers are reported by the caller where observable.
    }
  }
  return {
    observations,
    browserVersion,
    screenshot: writtenFile(screenshotPath),
    trace: traced ? writtenFile(tracePath) : null,
    failed,
    consoleErrors: counters.consoleErrors,
    networkFailures: counters.networkFailures,
    wallMs: Date.now() - startedAt,
  };
}
