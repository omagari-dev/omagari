// The runner's own error reports (ADR-0063): a real failure in the background runner reaches the operator's list, waits on the machine while the server is down,
// and nothing is queued or sent when the member or the operator turns reports off.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { api, call, type ErrorReport } from "@omagari/contract";
import { checkoutVersion } from "@omagari/contract/version";
import { runnerPaths } from "@omagari/runner";
import { eventually, startWorld, tempRepo } from "./harness.ts";

type World = Awaited<ReturnType<typeof startWorld>>;

/**
 * A world whose background runner watches two folders: the world's repo, which connects, and one whose saved share level is broken, so its runner can't start.
 * That failure is real: it's the same "Couldn't start the runner" a member sees in `background.log`.
 */
async function twoFolders(t: { after: (fn: () => Promise<unknown>) => void }) {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  await world.runner.stop();
  await world.signInCli(world.owner);
  const broken = await tempRepo();
  t.after(broken.remove);
  const { share } = await runnerPaths(broken.folder);
  await mkdir(dirname(share), { recursive: true });
  await writeFile(share, "everything\n");
  await writeFile(
    join(world.config, "omagari", "folders.json"),
    JSON.stringify([world.repo.folder, broken.folder]),
  );
  return { world, broken: broken.folder, queue: join(world.config, "omagari", "reports.json") };
}

/** Starts the background runner with `env` set for it (and only it: the test process's server and runners don't read these). */
function background(world: World, t: { after: (fn: () => Promise<unknown>) => void }, env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const started = world.launchCliIn(world.repo.folder, "runner", "background");
  process.env = saved;
  t.after(() => started.stop("SIGTERM"));
  return started;
}

const queued = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const online = (world: World) =>
  eventually(async () => assert.equal((await world.agents(world.owner)).owner, "online"));

test("a runner that fails for real shows up in the operator's list as the runner's, with its version and OS, masked", async (t) => {
  const { world, broken, queue } = await twoFolders(t);
  const running = background(world, t);
  await running.output(/Couldn't start the runner for .+: Share level must be one of/);

  const row = await eventually(async () => {
    const [found] = (await call(world.owner, api.errorReports)).reports;
    assert.ok(found, "No report yet");
    return found;
  });
  assert.equal(row.piece, "runner");
  assert.equal(row.kind, "error");
  assert.equal(row.where, "background runner / start");
  assert.equal(row.version, checkoutVersion());
  assert.equal(row.os, process.platform);
  assert.equal(row.arch, process.arch);
  assert.equal(row.runtime, `Node ${process.versions.node}`);
  assert.match(row.message, /^Share level must be one of .+: everything \(<repo>/);
  assert.ok(!JSON.stringify(row).includes(broken), "The folder isn't in the report");
  assert.ok(row.stack.some((line) => line.includes("packages/cli/src")));
  // Sent, so nothing waits on the machine.
  assert.deepEqual(await queued(queue), []);
});

test("a report made while the server is down waits on the machine and arrives after reconnecting", async (t) => {
  const { world, queue } = await twoFolders(t);
  await world.stopServer();
  const running = background(world, t, { OMAGARI_BACKGROUND_RETRY_MS: "200" });
  await running.output(/Couldn't start the runner for .+: Share level must be one of/);
  // Not reaching the server isn't a bug, so only the broken folder waits. The line is printed just before the file is written.
  await eventually(async () =>
    assert.deepEqual(
      (await queued(queue)).map((q: { report: { where: string } }) => q.report.where),
      ["background runner / start"],
    ),
  );

  await world.restartServer();
  await eventually(async () => {
    const { reports } = await call(world.owner, api.errorReports);
    assert.deepEqual(
      reports.map((r) => [r.piece, r.where]),
      [["runner", "background runner / start"]],
    );
  });
  assert.deepEqual(await queued(queue), []);
});

for (const variable of ["OMAGARI_NO_ERROR_REPORTS", "DO_NOT_TRACK"])
  test(`with ${variable}=1 nothing is queued or sent`, async (t) => {
    const { world, queue } = await twoFolders(t);
    const running = background(world, t, { [variable]: "1" });
    await running.output(/Couldn't start the runner for .+: Share level must be one of/);
    await online(world);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);
    await assert.rejects(readFile(queue), { code: "ENOENT" });
  });

test("while the server refuses reports, the runner sends none and drops the ones waiting", async (t) => {
  const { world, queue } = await twoFolders(t);
  await call(world.owner, api.refuseReports, { off: true });
  // One from before waits on the machine, as a runner that couldn't reach the server left it.
  const seeded: ErrorReport = {
    piece: "runner",
    kind: "error",
    version: "0.4.1",
    os: "linux",
    arch: "x64",
    runtime: "Node 24.3.0",
    where: "runner / observation",
    name: "Error",
    message: "waited from before",
    stack: [],
    count: 1,
  };
  await writeFile(queue, JSON.stringify([{ server: world.server.url, report: seeded }]));
  const first = background(world, t);
  await first.output(/Couldn't start the runner for .+: Share level must be one of/);
  await online(world);
  await eventually(async () => assert.deepEqual(await queued(queue), [], "Still waiting"));
  await first.stop("SIGTERM");

  // Once reports are taken again, a new failure goes, but what was dropped never comes back.
  await call(world.owner, api.refuseReports, { off: false });
  const again = background(world, t);
  await again.output(/Couldn't start the runner for .+: Share level must be one of/);
  await eventually(async () =>
    assert.deepEqual(
      (await call(world.owner, api.errorReports)).reports.map((r) => r.where),
      ["background runner / start"],
    ),
  );
});
