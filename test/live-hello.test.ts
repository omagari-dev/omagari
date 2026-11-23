// The web's live hello does its work once per connection, only for someone in a workspace, and a login can hold only so many connections.
import assert from "node:assert/strict";
import { test } from "node:test";
import { encode, LIVE_SOCKET, webToServer } from "@omagari/contract";
import { startWorld } from "./harness.ts";

test("a second hello on one live connection is refused", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  const url = new URL(LIVE_SOCKET, world.server.url);
  url.protocol = "ws:";
  const socket = new WebSocket(url);
  const closed = new Promise<number>((resolve) =>
    socket.addEventListener("close", ({ code }) => resolve(code)),
  );
  const hello = encode(webToServer, "hello", { session: world.owner.session, after: 0 });
  socket.addEventListener("open", () => {
    socket.send(hello);
    socket.send(hello);
  });
  assert.equal(await closed, 1008);
});

test("someone in no workspace gets an empty welcome and no messages", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const outsider = await world.login("outsider");
  const live = await world.live(outsider, 0);
  t.after(() => live.close());
  assert.deepEqual(live.received.find((m) => m.kind === "welcome")?.payload, { seq: 0 });
  assert.deepEqual(live.messages(), []);
});

test("one login can't hold more than 20 live connections", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  const open: Awaited<ReturnType<typeof world.live>>[] = [];
  for (let i = 0; i < 20; i++) open.push(await world.live(world.owner));
  t.after(() => Promise.all(open.map((l) => l.close())));
  const extra = await world.live(world.owner);
  assert.equal(await extra.closed, 1008);
  assert.equal(
    extra.received.find((m) => m.kind === "welcome"),
    undefined,
  );
});
