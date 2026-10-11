import assert from "node:assert/strict";
import { test } from "node:test";
import { friendlyAuthError } from "./authMessages";

test("common login problems get plain-English messages", () => {
  assert.match(friendlyAuthError("Invalid login credentials"), /don't match/);
  assert.match(friendlyAuthError("Email not confirmed"), /confirm your email/);
  assert.match(friendlyAuthError("Signups not allowed for this instance"), /turned off/);
  assert.match(friendlyAuthError("User already registered"), /already an account/);
  assert.match(friendlyAuthError("Password should be at least 8 characters."), /too weak/);
  assert.match(friendlyAuthError("email rate limit exceeded"), /Too many attempts/);
  assert.match(friendlyAuthError("TypeError: Failed to fetch"), /reach the server/);
});

test("messages it doesn't know are passed through unchanged", () => {
  assert.equal(friendlyAuthError("Something brand new"), "Something brand new");
});
