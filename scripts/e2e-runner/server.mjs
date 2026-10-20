#!/usr/bin/env node
/**
 * Static fixture server owned by scripts/e2e-runner.mjs.
 *
 * Serves a fixture directory over loopback only and reports a start-token
 * identity that the runner binds to the served response. Never probes or
 * attaches to another server: a port conflict surfaces as a bind error.
 *
 * Usage:
 *   node scripts/e2e-runner/server.mjs --port <n> --root <dir> --token <str> --commit-sha <hex> [--watch-parent <pid>] [--respond-delay-ms <ms>]
 *
 * Exit codes:
 *   0  stopped cleanly (parent gone, or SIGTERM/SIGINT)
 *   1  startup failure (bad root, bind error such as EADDRINUSE)
 *   2  usage error
 *
 * --respond-delay-ms delays every response (fault injection for slow apps).
 * --watch-parent makes the server exit when the watched pid disappears
 * (POSIX only; ignored on Windows where reparenting is not observable).
 */
import http from "node:http";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { platform } from "node:os";
import process from "node:process";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function failUsage(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    port: 0,
    root: null,
    token: null,
    commitSha: null,
    watchParent: null,
    respondDelayMs: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      if (index + 1 >= argv.length) {
        console.error(`error: missing value for ${arg}`);
        process.exit(2);
      }
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case "--port":
        options.port = Number(readValue());
        break;
      case "--root":
        options.root = readValue();
        break;
      case "--token":
        options.token = readValue();
        break;
      case "--commit-sha":
        options.commitSha = readValue();
        break;
      case "--watch-parent":
        options.watchParent = Number(readValue());
        break;
      case "--respond-delay-ms":
        options.respondDelayMs = Number(readValue());
        break;
      case "--help":
        console.log("Static fixture server owned by scripts/e2e-runner.mjs. See file header.");
        process.exit(0);
        break;
      default:
        failUsage(`unknown option: ${arg}`);
        break;
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

if (options.root === null || options.token === null || options.commitSha === null) {
  failUsage("--root, --token and --commit-sha are required");
}
if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
  failUsage("--port must be an integer between 0 and 65535");
}
if (!Number.isInteger(options.respondDelayMs) || options.respondDelayMs < 0) {
  failUsage("--respond-delay-ms must be a non-negative integer");
}

const root = resolve(options.root);
try {
  if (!statSync(root).isDirectory()) {
    console.error(`error: --root is not a directory: ${options.root}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`error: cannot read --root ${options.root}: ${error.message}`);
  process.exit(1);
}

const startedAt = new Date().toISOString();

function sendJson(res, status, object) {
  const body = JSON.stringify(object);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function handler(req, res) {
  const respond = () => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("bad path");
      console.log(`serve ${req.method} <undecodable> 400`);
      return;
    }
    if (pathname === "/__identity") {
      console.log(`serve ${req.method} /__identity 200`);
      sendJson(res, 200, {
        pid: process.pid,
        token: options.token,
        commitSha: options.commitSha,
        startedAt,
      });
      return;
    }
    const resolved = normalize(join(root, pathname));
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      console.log(`serve ${req.method} ${pathname} 404`);
      return;
    }
    let target = resolved;
    try {
      if (statSync(target).isDirectory()) target = join(target, "index.html");
      const bytes = readFileSync(target);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      });
      res.end(bytes);
      console.log(`serve ${req.method} ${pathname} 200`);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      console.log(`serve ${req.method} ${pathname} 404`);
    }
  };
  if (options.respondDelayMs > 0) setTimeout(respond, options.respondDelayMs);
  else respond();
}

const server = http.createServer(handler);
server.on("error", (error) => {
  console.error(`error: bind failed: ${error.message}`);
  process.exit(1);
});
server.listen(options.port, "127.0.0.1", () => {
  console.log(`ready pid=${process.pid} port=${server.address().port}`);
});

if (options.watchParent !== null && platform() !== "win32") {
  const parent = options.watchParent;
  setInterval(() => {
    try {
      process.kill(parent, 0);
    } catch (error) {
      if (error.code === "ESRCH") {
        console.error(`parent ${parent} gone, exiting`);
        process.exit(0);
      }
    }
  }, 100);
}
