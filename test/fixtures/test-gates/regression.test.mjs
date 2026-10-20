import { test } from "node:test";
import assert from "node:assert/strict";

// One BDD-style acceptance scenario. BDD is not forced on every test: this is
// the single connected scenario that shows the three steps side by side.
function login(user, password, knownUsers) {
  if (!knownUsers.has(user)) {
    return { ok: false, reason: "unknown user" };
  }
  if (password !== knownUsers.get(user)) {
    return { ok: false, reason: "wrong password" };
  }
  return { ok: true, reason: null };
}

test("Given a known user, When the password is wrong, Then the login is rejected", () => {
  // Given
  const knownUsers = new Map([["mini", "correct-horse"]]);

  // When
  const result = login("mini", "wrong-horse", knownUsers);

  // Then
  assert.equal(result.ok, false);
  assert.equal(result.reason, "wrong password");
});
