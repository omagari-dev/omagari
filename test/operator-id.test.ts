// Operators are GitHub account ids (ADR-0062): a name that someone else takes later doesn't carry the operator role.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import { startWorld } from "./harness.ts";

/** The owner moves to another GitHub name and their rows are deleted (ADR-0054), so the old name is free. */
const freeOwnerName = async (world: Awaited<ReturnType<typeof startWorld>>) => {
  world.github.rename("owner", "owner-moved");
  await world.stopServer();
  const db = new DatabaseSync(world.database);
  db.prepare("DELETE FROM sessions WHERE login = ?").run("owner");
  db.prepare("DELETE FROM people WHERE login = ?").run("owner");
  db.close();
  await world.restartServer();
};

test("an operator named by login loses the role when someone else takes that login", async (t) => {
  const world = await startWorld({ operators: ["owner"] });
  t.after(world.stop);
  assert.equal((await call(world.owner, api.me)).operator, true);

  await freeOwnerName(world);
  const newcomer = await world.login("owner");
  assert.equal((await call(newcomer, api.me)).operator, false);
});

test("an operator named by id keeps the role, and someone who later takes the old name doesn't get it", async (t) => {
  const world = await startWorld({ operators: ["owner"] });
  t.after(world.stop);
  const db = new DatabaseSync(world.database);
  const { github_id: id } = db
    .prepare("SELECT github_id FROM people WHERE login = ?")
    .get("owner") as { github_id: number };
  db.close();
  await world.restartServer({ operators: [`id:${id}`] });
  assert.equal((await call(world.owner, api.me)).operator, true);

  await freeOwnerName(world);
  const newcomer = await world.login("owner");
  assert.equal((await call(newcomer, api.me)).operator, false);
});
