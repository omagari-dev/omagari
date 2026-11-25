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

// The app's folders, as #544's sources give them. Windows sets ProgramFiles again for every 64-bit process, so a test can't point it elsewhere there:
// the WindowsApps package is checked off Windows only, and the per-user copy under LOCALAPPDATA everywhere.
const layouts = [
  {
    name: "the WindowsApps package",
    env: "ProgramFiles",
    folder: ["WindowsApps", "OpenAI.Codex_1.0.0.0_x64__abc", "app", "resources"],
    skip: process.platform === "win32",
  },
  { name: "the per-user copy", env: "LOCALAPPDATA", folder: ["OpenAI", "Codex", "bin", "abc123"] },
];

for (const layout of layouts)
  test(`a runner finds Codex in the desktop app's folder (${layout.name}) when it isn't on PATH, and reports Codex alone without Claude Code`, {
    skip: layout.skip,
  }, async (t) => {
    const { world, desk } = await setup(t);
    const root = await realpath(await mkdtemp(join(tmpdir(), "omagari-codex-app-")));
    t.after(() => rm(root, { recursive: true, force: true }));
    const folder = join(root, ...layout.folder);
    await mkdir(folder, { recursive: true });
    const script = join(import.meta.dirname, "fake-codex.ts");
    await writeFile(
      join(folder, process.platform === "win32" ? "codex.cmd" : "codex"),
      process.platform === "win32"
        ? `@"${process.execPath}" "${script}" %*\r\n`
        : `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`,
      { mode: 0o755 },
    );
    await writer(world.codex)("auth.json", "{}");

    const out = world.launchCliWith({ PATH: bare(), [layout.env]: root }, desk.folder, "runner");
    t.after(() => out.stop("SIGKILL"));
    await out.output(/Agents: Codex\n/);
    await eventually(async () => assert.deepEqual(await agentsOf(world, "alice"), ["codex"]));
  });
