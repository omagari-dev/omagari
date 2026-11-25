// The CLI's and the hooks' own error reports (ADR-0063): a command that fails for real reaches the operator's list with its name and no arguments,
// a hook's error goes through the runner while the hook still exits 0, and neither sends nor queues anything with a variable set.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import { eventually, startWorld } from "./harness.ts";

type World = Awaited<ReturnType<typeof startWorld>>;
const queued = (world: World) =>
  readFile(join(world.config, "omagari", "reports.json"), "utf8").then(JSON.parse);

/**
 * The real server behind a go-between that makes every answer but reports and sign-in garbage (a server the CLI can't understand: a bug in the CLI, not a mistake of the member).
 * `blockReports` makes the report route fail, as a server that's down would.
 */
async function garbled(world: World, t: { after: (fn: () => Promise<unknown>) => void }) {
  const state = { blockReports: false };
  const proxy = createServer((req, res) => {
    const reports = req.url?.startsWith("/api/reports");
    if (!reports && req.url !== "/api/me" && req.url?.startsWith("/api/")) {
      req.resume();
      res.writeHead(200, { "content-type": "application/json" }).end('{"garbled":true}');
      return;
    }
    if (reports && state.blockReports) {
      req.resume();
      res.writeHead(503).end();
      return;
    }
    const up = request(new URL(req.url ?? "/", world.server.url), {
      method: req.method,
      headers: req.headers,
    });
    up.on("response", (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    req.pipe(up);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => proxy.close(resolve)));
  const url = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  await world.signInCli(world.owner);
  const sessions = join(world.config, "omagari", "sessions.json");
  const saved = JSON.parse(await readFile(sessions, "utf8"));
  await writeFile(sessions, JSON.stringify({ ...saved, [url]: saved[world.server.url] }));
  const status = (env: Record<string, string> = {}) =>
    world.launchCliWith(
      { OMAGARI_SERVER: url, ...env },
      world.repo.folder,
      "status",
      "set",
      "secret-words-xyz",
    );
  return { url, state, status };
}

const finished = async (started: ReturnType<World["launchCliWith"]>) => {
  await started.exited;
};

test("a CLI command that fails for real shows up with piece cli and the command name, never its arguments", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const { status } = await garbled(world, t);
  await finished(status());
  const row = await eventually(async () => {
    const [found] = (await call(world.owner, api.errorReports)).reports;
    assert.ok(found, "No report yet");
    return found;
  });
  assert.equal(row.piece, "cli");
  assert.equal(row.where, "cli / status");
  assert.ok(!JSON.stringify(row).includes("secret-words-xyz"));
  assert.deepEqual(await queued(world), []);
});

test("a CLI report waits on the machine while the server can't take it, and goes with the next one", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const { status, state } = await garbled(world, t);
  state.blockReports = true;
  await finished(status());
  assert.equal((await queued(world)).length, 1);
  assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);

  state.blockReports = false;
  await finished(status());
  const [row] = (await call(world.owner, api.errorReports)).reports;
  assert.equal(row?.piece, "cli");
  assert.equal(row?.count, 2);
  assert.deepEqual(await queued(world), []);
});

for (const variable of ["OMAGARI_NO_ERROR_REPORTS", "DO_NOT_TRACK"]) {
  test(`with ${variable}=1 the CLI and the hook send and queue nothing`, async (t) => {
    const world = await startWorld({ operators: ["Owner"] });
    t.after(world.stop);
    const { status } = await garbled(world, t);
    await finished(status({ [variable]: "1" }));
    const { code } = await world.hook("not json", { env: { [variable]: "1" } });
    assert.equal(code, 0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);
    await assert.rejects(queued(world), { code: "ENOENT" });
  });
}

test("a hook given broken input still exits 0 and its error shows up with piece hook through the runner", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const { code, stdout } = await world.hook("not json");
  assert.equal(code, 0);
  assert.equal(stdout, "");
  const row = await eventually(async () => {
    const [found] = (await call(world.owner, api.errorReports)).reports;
    assert.ok(found, "No report yet");
    return found;
  });
  assert.equal(row.piece, "hook");
  assert.equal(row.where, "hook / input");
  assert.equal(row.name, "SyntaxError");
});

test("with the runner down the hook still exits 0 at once and drops its error", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  await world.runner.stop();
  const began = Date.now();
  const { code, stdout } = await world.hook("not json");
  assert.equal(code, 0);
  assert.equal(stdout, "");
  // The same wait as any hook whose runner is off: nothing is added to it.
  assert.ok(Date.now() - began < 5000);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);
  await assert.rejects(queued(world), { code: "ENOENT" });
});
