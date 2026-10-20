import { test } from "node:test";
import assert from "node:assert/strict";

// One fast deterministic unit test. No clock, no network, no filesystem.
function normalizeStatus(raw) {
  return raw.trim().toLowerCase() === "ok" ? "ok" : "failed";
}

test("normalizeStatus maps a raw status to ok or failed", () => {
  assert.equal(normalizeStatus(" OK "), "ok");
  assert.equal(normalizeStatus("Failed"), "failed");
});
