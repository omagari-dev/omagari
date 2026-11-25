// A runner reports an executor only when it is installed (#544): Claude Code by `claude --version`, Codex by `codex login status`.
// Codex is also looked for in the Codex desktop app's folders, since the app puts it on PATH only inside its own shell.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import { eventually, startWorld, tempRepo, writer } from "./harness.ts";

/** A PATH that has node and git and nothing else, so no `claude` or `codex` of this machine is found. */
const bare = () => {
  const git = execFileSync(process.platform === "win32" ? "where" : "which", ["git"], {
    encoding: "utf8",
  }).split(/\r?\n/)[0];
  return [dirname(process.execPath), dirname(git)].join(delimiter);
};

const agentsOf = async (world: Awaited<ReturnType<typeof startWorld>>, login: string) =>
  (await call(world.owner, api.members)).members
    .find((m) => m.login === login)
    ?.agents.map(({ executor }) => executor);

async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const world = await startWorld();
  t.after(world.stop);
  world.github.grant("alice");
  await world.signInCli(await world.login("alice"));
  const desk = await tempRepo();
  t.after(desk.remove);
  return { world, desk };
}

test("with neither Claude Code nor Codex installed, the runner reports no agent", async (t) => {
  const { world, desk } = await setup(t);
  const out = world.launchCliWith({ PATH: bare() }, desk.folder, "runner");
  t.after(() => out.stop("SIGKILL"));
  await out.output(/Agents: \n/);
  assert.deepEqual(await agentsOf(world, "alice"), []);
});

test("a runner finds Codex in the desktop app's folder when it isn't on PATH, and reports Codex alone without Claude Code", async (t) => {
  const { world, desk } = await setup(t);
  // The app's folder, in the shape of the Windows package: <ProgramFiles>\WindowsApps\OpenAI.Codex_<version>_x64__<id>\app\resources
  const root = await realpath(await mkdtemp(join(tmpdir(), "omagari-codex-app-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const resources = join(root, "WindowsApps", "OpenAI.Codex_1.0.0.0_x64__abc", "app", "resources");
  await mkdir(resources, { recursive: true });
  const script = join(import.meta.dirname, "fake-codex.ts");
  await writeFile(
    join(resources, process.platform === "win32" ? "codex.cmd" : "codex"),
    process.platform === "win32"
      ? `@"${process.execPath}" "${script}" %*\r\n`
      : `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`,
    { mode: 0o755 },
  );
  await writer(world.codex)("auth.json", "{}");

  const out = world.launchCliWith({ PATH: bare(), ProgramFiles: root }, desk.folder, "runner");
  t.after(() => out.stop("SIGKILL"));
  await out.output(/Agents: Codex\n/);
  await eventually(async () => assert.deepEqual(await agentsOf(world, "alice"), ["codex"]));
});
