// GIFs (ADR-0056): the browser asks GIPHY directly with the server's key, so the server only hands the key to signed-in members.
// Searching and passing GIPHY's URLs through untouched is tested in packages/web/src/giphy.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import { startWorld } from "./harness.ts";

test("with no GIPHY key on the server, GIFs are off", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  assert.equal((await call(world.owner, api.me)).giphy, null); // the web doesn't show a GIF button
});

test("a signed-in member gets the server's GIPHY key for their browser", async (t) => {
  const world = await startWorld({ giphy: "giphy-web-key" });
  t.after(world.stop);
  assert.equal((await call(world.owner, api.me)).giphy, "giphy-web-key");
  await assert.rejects(call(world.server, api.me), { code: "unauthorized" });
});

test("someone with no workspace gets no GIPHY key, even when the server has one", async (t) => {
  const world = await startWorld({ giphy: "giphy-web-key", operators: ["Owner"] });
  t.after(world.stop);
  const carol = await world.login("carol");
  assert.equal((await call(carol, api.me)).giphy, null);
});
