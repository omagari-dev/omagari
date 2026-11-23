import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { callRunner } from "@omagari/runner";
import { eventually, startWorld, tempRepo } from "./harness.ts";

const sessionStart = (cwd: string) =>
  JSON.stringify({
    session_id: "11111111-2222-3333-4444-555555555555",
    transcript_path: join(cwd, "transcript.jsonl"),
    cwd,
    hook_event_name: "SessionStart",
    source: "startup",
  });

test("the background runner starts the runner of a workspace repo once a session starts there, and leaves repos outside the server's accounts alone", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  // A runner ran in this repo by hand before. It's off now.
  await world.runner.stop();
  await world.signInCli(world.owner);
  const background = world.launchCliIn(world.repo.folder, "runner", "background");
  t.after(() => background.stop("SIGTERM"));
  await background.output(/Background runner on/);
  assert.equal((await world.agents(world.owner))[world.owner.login], "offline");

  assert.equal((await world.hook(sessionStart(world.repo.folder))).code, 0);
  await background.output(/Watching /);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "online"),
  );
  // A runner in a terminal doesn't start a second one.
  const terminal = await world.cli("runner");
  assert.deepEqual(
    { code: terminal.code, stdout: terminal.stdout },
    { code: 0, stdout: "The background runner already watches this folder\n" },
  );

  // A repo outside the server's accounts isn't started (repo-sharing.test checks nothing about it reaches the server).
  const outside = await tempRepo("someone-else/code");
  t.after(outside.remove);
  assert.equal((await world.hook(sessionStart(outside.folder), { cwd: outside.folder })).code, 0);
  await background.output(/Not watching .+: its remotes aren't under the server's accounts/);
  await assert.rejects(callRunner(outside.folder, "situation", { executor: "claude-code" }));

  // After a restart it comes back without waiting for a session.
  // Windows has no SIGTERM between processes, so there it's asked over its pipe (ADR-0060).
  const stopped =
    process.platform === "win32"
      ? await world.cli("runner", "stop").then(() => background.exited)
      : await background.stop("SIGTERM");
  assert.equal(stopped.code, 0);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "offline"),
  );
  const again = world.launchCliIn(world.repo.folder, "runner", "background");
  t.after(() => again.stop("SIGTERM"));
  await again.output(/Watching /);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "online"),
  );
});

test("omagari runner stop closes the background runner's runners and ends it, without a signal", async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  await world.runner.stop();
  await world.signInCli(world.owner);
  const background = world.launchCliIn(world.repo.folder, "runner", "background");
  t.after(() => background.stop("SIGTERM"));
  await background.output(/Background runner on/);
  assert.equal((await world.hook(sessionStart(world.repo.folder))).code, 0);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "online"),
  );

  assert.equal((await world.cli("runner", "stop")).stdout, "Stopping the background runner\n");
  await background.output(/Background runner stopped/);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "offline"),
  );
  assert.match((await world.cli("runner", "stop")).stderr, /The background runner is off/);
});

test("the background runner moves to another folder of the repo when the worktree it started in is removed", async (t) => {
  process.env.OMAGARI_BACKGROUND_RETRY_MS = "500";
  t.after(() => {
    delete process.env.OMAGARI_BACKGROUND_RETRY_MS;
  });
  const world = await startWorld();
  t.after(world.stop);
  await world.runner.stop();
  await world.signInCli(world.owner);
  const background = world.launchCliIn(world.repo.folder, "runner", "background");
  t.after(() => background.stop("SIGTERM"));
  await background.output(/Background runner on/);

  // A session opened the repo in a worktree first, and a second worktree exists.
  const first = await world.worktree("first");
  await world.worktree("second");
  assert.equal((await world.hook(sessionStart(first), { cwd: first })).code, 0);
  await background.output(/Watching .*first/);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "online"),
  );

  // The hub removes the first worktree after its PR merged.
  // On Windows a process holding the folder open (the runner's own git) can make this fail for a moment.
  await eventually(() => world.repo.git("worktree", "remove", "--force", first));
  await background.output(/is gone\. Watching .+ instead/);
  await eventually(async () =>
    assert.equal((await world.agents(world.owner))[world.owner.login], "online"),
  );

  // Work in worktrees of the same repo is still observed, new ones too, and the removed one is gone.
  await world.worktree("third");
  await eventually(async () => {
    const branches = (await world.works(world.owner)).map((w) => w.branch);
    assert.ok(branches.includes("second") && branches.includes("third"));
    assert.ok(!branches.includes("first"));
  });
  const folders = JSON.parse(await readFile(join(world.config, "omagari", "folders.json"), "utf8"));
  assert.ok(!folders.includes(first));
});
