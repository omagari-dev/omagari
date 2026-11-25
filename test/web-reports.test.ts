// The web's error reports (ADR-0063, ADR-0064): `packages/web/src/report.ts` against a real server, with the browser's globals stubbed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import { eventually, REPO, startWorld } from "./harness.ts";

const store = new Map<string, string>();
const place = { origin: "" };
Object.assign(globalThis, {
  location: place,
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/142.0.0.0 Safari/537.36" },
  configurable: true,
});
const { reportError, reportingFor, reportStuck } = await import("../packages/web/src/report.ts");

const rows = async (world: Awaited<ReturnType<typeof startWorld>>) =>
  (await call(world.owner, api.errorReports)).reports;

test("web errors wait until sign-in, go once, and honor both switches", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  place.origin = world.owner.url;
  world.github.grant("carol", REPO);
  const carol = await world.login("carol");

  // Signed out: the error and the stuck wait wait in local storage.
  reportingFor(undefined, true);
  reportError("render error", new TypeError("Cannot read properties of undefined (reading 'x')"));
  reportError("render error", new TypeError("Cannot read properties of undefined (reading 'x')"));
  reportStuck("sign-in / entering the app");
  assert.equal(JSON.parse(store.get("omagari.reports") ?? "[]").length, 2);
  assert.deepEqual(await rows(world), []);

  // After sign-in they go, once each.
  reportingFor(carol.session, true);
  await eventually(async () => assert.equal((await rows(world)).length, 2));
  const found = await rows(world);
  assert.deepEqual(found.map((r) => [r.piece, r.kind, r.count]).sort(), [
    ["web", "error", 1],
    ["web", "stuck", 1],
  ]);
  assert.equal(JSON.parse(store.get("omagari.reports") ?? "[]").length, 0);

  // The member's switch off: what waits is cleared and nothing new is kept.
  reportingFor(undefined, true);
  reportError("render error", new Error("while signed out"));
  reportingFor(carol.session, false);
  reportError("render error", new Error("with the switch off"));
  assert.equal(JSON.parse(store.get("omagari.reports") ?? "[]").length, 0);
  reportingFor(carol.session, true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await rows(world)).length, 2);

  // The operator refuses all: the first send hears `off`, and the web stops.
  await call(world.owner, api.refuseReports, { off: true });
  reportError("render error", new Error("refused one"));
  await new Promise((resolve) => setTimeout(resolve, 300));
  reportError("render error", new Error("another"));
  assert.equal(JSON.parse(store.get("omagari.reports") ?? "[]").length, 0);
});
