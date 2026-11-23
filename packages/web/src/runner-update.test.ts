import assert from "node:assert/strict";
import { test } from "node:test";
import { DIST_TAG, newestVersion, older, shortVersion } from "./runner-update.ts";

test("the newest version comes from npm's dist-tag that members install", async (t) => {
  const asked: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    asked.push(String(url));
    return Response.json({ name: "omagari", version: "0.0.0-dev.60" });
  });
  assert.equal(await newestVersion(), "0.0.0-dev.60");
  assert.deepEqual(asked, [`https://registry.npmjs.org/omagari/${DIST_TAG}`]);
});

test("when npm can't answer, there's no newest version", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 503 }));
  assert.equal(await newestVersion(), undefined);
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(await newestVersion(), undefined);
});

test("versions compare in SemVer order", () => {
  assert.ok(older("0.0.0-dev.57", "0.0.0-dev.60"));
  assert.ok(older("0.0.0-dev.9", "0.0.0-dev.10"));
  assert.ok(!older("0.0.0-dev.60", "0.0.0-dev.60"));
  assert.ok(!older("0.0.0-dev.61", "0.0.0-dev.60"));
  assert.ok(older("0.0.0-dev.60", "0.1.0"));
  assert.ok(!older("0.1.0", "0.0.0-dev.60"));
  assert.ok(older("0.1.0-dev.1", "0.1.0"));
  assert.ok(older("0.9.9", "0.10.0"));
  assert.equal(shortVersion("0.0.0-dev.57"), "dev.57");
  assert.equal(shortVersion("0.1.0"), "0.1.0");
});
