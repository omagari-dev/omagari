// The update card's request (ADR-0061): only the owner can ask their own runners to update, the server's message names nothing to install,
// and the owner's web hears their runners' versions and how the update went. Runners are imitated with a raw WebSocket (a connection pretending to be a runner),
// since the real runner in a test runs from a clone and has no npm version. The real runner's side is in `self-update.test.ts`.
import assert from "node:assert/strict";
import { once } from "node:events";
import { type TestContext, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import {
  api,
  CONTRACT_VERSION,
  type ContractFailure,
  call,
  RUNNER_SOCKET,
} from "@omagari/contract";
import { eventually, REPO, startWorld } from "./harness.ts";

type World = Awaited<ReturnType<typeof startWorld>>;
// biome-ignore lint/suspicious/noExplicitAny: raw frame
type Frame = { kind: string; id: string; re?: string; payload: any };

/** How long to wait when checking that something must not happen. */
const SETTLE_MS = 400;

/** Attaches a runner of `as` that says it's npm version `version`. What it receives piles up in `got`. */
async function runner(t: TestContext, world: World, as: { session: string }, version?: string) {
  const socket = new WebSocket(world.server.url.replace("http", "ws") + RUNNER_SOCKET);
  t.after(() => socket.close());
  const got: Frame[] = [];
  socket.addEventListener("message", ({ data }) => got.push(JSON.parse(String(data))));
  await once(socket, "open");
  const send = (kind: string, payload: object, re?: string) =>
    socket.send(
      JSON.stringify({ v: CONTRACT_VERSION, id: crypto.randomUUID(), re, kind, payload }),
    );
  send("hello", {
    session: as.session,
    ...(version && { version }),
    repos: [REPO],
    shareRepo: true,
    executors: ["claude-code"],
    choices: {},
    mergeCheck: "off",
  });
  await eventually(() => assert.ok(got.some((g) => g.kind === "welcome")));
  return {
    got,
    send,
    close: () => socket.close(),
    updates: () => got.filter((g) => g.kind === "update"),
  };
}

test("only the owner's npm runners get an update, and it names nothing to install", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  world.github.grant("alice");
  const alice = await world.login("alice");
  const ownerLive = await world.live(world.owner);
  const aliceLive = await world.live(alice);
  const mine = await runner(t, world, world.owner, "0.0.0-dev.1");
  const hers = await runner(t, world, alice, "0.0.0-dev.1");

  // The owner's web hears their own runners' versions; the clone runner the world started has none.
  const runners = (live: typeof ownerLive) =>
    live.received.findLast((m) => m.kind === "runners")?.payload;
  await eventually(() =>
    assert.deepEqual(runners(ownerLive), { versions: ["0.0.0-dev.1"], update: null }),
  );

  // Alice has a runner, but asking only reaches hers: the owner's runner hears nothing.
  await call(alice, api.updateRunner);
  await eventually(() => assert.equal(hers.updates().length, 1));
  await sleep(SETTLE_MS);
  assert.equal(mine.updates().length, 0);
  assert.equal(runners(ownerLive)?.update, null);
  // The owner asks, even with a body naming a version and a package: the route takes no body, so the runner gets an empty update.
  const asked = await fetch(new URL(api.updateRunner.path, world.server.url), {
    method: "POST",
    headers: { authorization: `Bearer ${world.owner.session}`, "content-type": "application/json" },
    body: JSON.stringify({ version: "6.6.6", package: "evil", url: "https://evil.invalid" }),
  });
  assert.equal(asked.status, 200);
  await eventually(() => assert.equal(mine.updates().length, 1));
  assert.deepEqual(mine.updates()[0]?.payload, {});
  assert.deepEqual(hers.updates()[0]?.payload, {});
  assert.equal(hers.updates().length, 1);
  await eventually(() => assert.deepEqual(runners(ownerLive)?.update, { state: "updating" }));

  // The runner couldn't: the owner's web gets its reason, Alice's web gets nothing about the owner's runners.
  const last = mine.updates().at(-1) as Frame;
  mine.send("error", { code: "internal", message: "npm i -g failed: EACCES" }, last.id);
  await eventually(() =>
    assert.deepEqual(runners(ownerLive)?.update, {
      state: "failed",
      message: "npm i -g failed: EACCES",
    }),
  );
  assert.ok(
    aliceLive.received
      .filter((m) => m.kind === "runners")
      .every((m) => m.kind === "runners" && m.payload.update?.state !== "failed"),
  );

  // The runner comes back on a new version: the update is over.
  mine.close();
  await runner(t, world, world.owner, "0.0.0-dev.2");
  await eventually(() =>
    assert.deepEqual(runners(ownerLive), { versions: ["0.0.0-dev.2"], update: null }),
  );
});

test("with no npm runner connected, asking says the runner is offline and sends nothing", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  // The world's own runner runs from a clone: it has no version, so it isn't asked.
  await assert.rejects(
    call(world.owner, api.updateRunner),
    (error: ContractFailure) => error.code === "runner_offline",
  );
  world.github.grant("alice");
  const alice = await world.login("alice");
  const hers = await runner(t, world, alice, "0.0.0-dev.1");
  await assert.rejects(
    call(world.owner, api.updateRunner),
    (error: ContractFailure) => error.code === "runner_offline",
  );
  await sleep(SETTLE_MS);
  assert.equal(hers.updates().length, 0);
});
