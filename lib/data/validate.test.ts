import assert from "node:assert/strict";
import { test } from "node:test";
import { limits, ValidationError, validateDraft, validatePerson, validateSettings, validateTask, validateTransaction } from "./validate";
import { defaultSettings, type Transaction } from "../types";

const deal: Omit<Transaction, "id"> = {
  type: "buyer", status: "active", propertyAddress: "1 Test Street", clientId: "c", agentId: "a",
  contractDate: "2026-10-06", closingDate: null, price: null, notes: "", createdAt: "2026-10-01", archived: false,
};
const throwsFriendly = (fn: () => unknown, re: RegExp) =>
  assert.throws(fn, (e) => e instanceof ValidationError && re.test(e.message));

test("accepts ordinary records", () => {
  validateTransaction(deal);
  validatePerson({ name: "Pat Example", email: "", phone: "", role: "client" });
  validatePerson({ name: "Pat Example", email: "pat@example.test", phone: "555-0100", role: "agent" });
  validateSettings(defaultSettings);
});

test("rejects missing, oversized and malformed input with a readable message", () => {
  throwsFriendly(() => validateTransaction({ ...deal, propertyAddress: "   " }), /address is required/i);
  throwsFriendly(() => validateTransaction({ ...deal, notes: "x".repeat(limits.notes + 1) }), /too long/i);
  throwsFriendly(() => validateTransaction({ ...deal, price: -1 }), /price/i);
  throwsFriendly(() => validateTransaction({ ...deal, closingDate: "2026-02-30" }), /valid date/i);
  throwsFriendly(() => validateTransaction({ ...deal, closingDate: "tomorrow" }), /valid date/i);
  throwsFriendly(() => validateTransaction({ ...deal, status: "hacked" as never }), /allowed choices/i);
  throwsFriendly(() => validateTransaction({ ...deal, clientId: "" }), /client and an agent/i);
  throwsFriendly(() => validatePerson({ name: "", email: "", phone: "", role: "client" }), /name is required/i);
  throwsFriendly(() => validatePerson({ name: "A", email: "nope", phone: "", role: "client" }), /email/i);
  throwsFriendly(() => validateTask({ transactionId: "t", title: "", dueDate: null, status: "open", key: null, category: null } as never), /title is required/i);
  throwsFriendly(() => validateDraft({ transactionId: "t", subject: "s".repeat(limits.subject + 1) } as never), /too long/i);
  throwsFriendly(() => validateSettings({ ...defaultSettings, followUpDays: 0 }), /1 and 365/);
  throwsFriendly(() => validateSettings({ ...defaultSettings, followUpDays: 2.5 }), /1 and 365/);
});
