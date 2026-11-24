// Access rows are written only from a live session's current token (ADR-0043, ADR-0054).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { api, call } from "@omagari/contract";
import { REPO, REPO2, startWorld } from "./harness.ts";

const accessOf = (database: string, login: string) => {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return (
      db.prepare("SELECT repo FROM access WHERE login = ? ORDER BY repo").all(login) as {
        repo: string;
      }[]
    ).map((row) => row.repo);
  } finally {
    db.close();
  }
};

test("a recheck whose GitHub answer arrives after the account was deleted doesn't bring its access back", async (t) => {
  const world = await startWorld({ recheckMs: 50 });
  t.after(world.stop);
  world.github.grant("alice");
  const alice = await world.login("alice");
  assert.deepEqual(accessOf(world.database, "alice"), [REPO]);

  const release = world.github.hold("alice", REPO);
  await sleep(300); // a recheck is waiting on GitHub's answer for alice
  await call(alice, api.deleteAccount);
  release();
  await sleep(300); // the recheck gets its "yes" and decides
  assert.deepEqual(accessOf(world.database, "alice"), []);
});

test("add-repo reads each member's access with the token of their newest session", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  world.github.grant("alice");
  world.github.grant("alice", REPO2);
  world.github.create(REPO2);
  world.github.admin("owner", REPO2);
  // Older sessions whose tokens GitHub no longer accepts.
  for (let i = 0; i < 4; i++) {
    await world.login("alice");
    for (const [token, login] of world.github.tokens)
      if (login === "alice") world.github.tokens.delete(token);
  }
  await world.login("alice");

  await call(world.owner, api.addRepo, { repo: REPO2 });
  assert.deepEqual(accessOf(world.database, "alice"), [REPO2, REPO].sort());
});
