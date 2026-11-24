// GitHub tokens are sealed with AES-256-GCM (ADR-0053). A stored text whose tag is cut short must not open.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { decryptToken, encryptToken } from "./index.ts";

test("a sealed token opens, and one whose tag is cut to a prefix doesn't", () => {
  const key = randomBytes(32);
  const sealed = encryptToken(key, "");
  assert.equal(decryptToken(key, sealed), "");
  const raw = Buffer.from(sealed.slice("enc1:".length), "base64");
  const cut = Buffer.concat([raw.subarray(0, 12), raw.subarray(12, 16)]).toString("base64");
  assert.equal(decryptToken(key, `enc1:${cut}`), null);
});
