// Merge runs without a sandbox on native Windows (ADR-0059).
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { api, call } from "@omagari/contract";
import {
  CHECK_LIMITS,
  checkWork,
  type MergeWith,
  unsandboxed,
} from "../packages/runner/src/check.ts";
import { eventually, startWorld, tempRepo, writer } from "./harness.ts";

const windowsOnly =
  process.platform === "win32" ? {} : { skip: "Without a sandbox is only for native Windows" };

/** Commits the files to the default branch (origin/main) so they look merged. */
async function merge(
  repo: { folder: string; git: (...args: string[]) => Promise<string> },
  files: Record<string, string>,
) {
  const write = writer(repo.folder);
  for (const [path, content] of Object.entries(files)) await write(path, content);
  await repo.git("add", "--all");
  await repo.git("commit", "--message=merged");
  await repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
}

const config = (check: string) => `${JSON.stringify({ check })}\n`;

const run = (folder: string, limits = CHECK_LIMITS, merge?: MergeWith) =>
  checkWork({ folder, remote: "origin", sandbox: unsandboxed, limits, merge });

test(
  "on native Windows without a sandbox, the check command runs in cmd.exe, and a merge run gives pass and broken verdicts",
  windowsOnly,
  async (t) => {
    const repo = await tempRepo();
    t.after(repo.remove);
    await merge(repo, {
      ".omagari.json": config("echo checking && node check.js"),
      "check.js": "process.exit(require('fs').existsSync('fail.txt') ? 1 : 0);\n",
    });
    const base = await repo.git("rev-parse", "HEAD");
    const theirs = (path: string): MergeWith => ({
      base,
      theirs: { base, files: [{ path, content: "" }] },
    });
    // Merged with another work that adds a harmless file it passes; with one that adds fail.txt it breaks.
    const passed = await run(repo.folder, CHECK_LIMITS, theirs("other.txt"));
    assert.equal(passed.verdict, "pass", passed.reason ?? passed.output);
    assert.match(passed.output, /checking/);
    const broken = await run(repo.folder, CHECK_LIMITS, theirs("fail.txt"));
    assert.equal(broken.verdict, "broken", broken.reason ?? broken.output);
  },
);

test(
  "on native Windows without a sandbox, tokens and keys in the runner's environment don't reach the check command",
  windowsOnly,
  async (t) => {
    const repo = await tempRepo();
    t.after(repo.remove);
    const names = [
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "OMAGARI_SESSION",
      "ANTHROPIC_API_KEY",
      "ssh_auth_sock",
    ];
    for (const name of names) process.env[name] = "secret-value";
    t.after(() => {
      for (const name of names) delete process.env[name];
    });
    await merge(repo, {
      ".omagari.json": config("node env.js"),
      "env.js": `const seen = Object.entries(process.env).filter(([, v]) => v === "secret-value").map(([k]) => k);
console.log("seen:" + seen.join(","));
console.log("home:" + (process.env.USERPROFILE === process.env.TEMP));
process.exit(seen.length);
`,
    });
    const result = await run(repo.folder);
    assert.equal(result.verdict, "pass", result.output);
    assert.match(result.output, /^seen:$/m);
    // The home and temp folders point to this run's temp folder.
    assert.match(result.output, /home:true/);
  },
);

test(
  "on native Windows without a sandbox, a process the check command started is gone after the run, even detached and after its parent ended",
  windowsOnly,
  async (t) => {
    const repo = await tempRepo();
    t.after(repo.remove);
    const outside = await mkdtemp(join(tmpdir(), "omagari-left-"));
    t.after(() => rm(outside, { recursive: true, force: true }));
    const pidFile = join(outside, "pid");
    await merge(repo, {
      ".omagari.json": config("node leave.js"),
      // A detached grandchild that would keep running forever. Its parent (node leave.js) ends right away.
      "leave.js": `const { spawn } = require("child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
child.unref();
require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
`,
    });
    const result = await run(repo.folder);
    assert.equal(result.verdict, "pass", result.reason ?? result.output);
    const pid = Number(await readFile(pidFile, "utf8"));
    assert.ok(pid > 0);
    await eventually(() => assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }), 5_000);

    // A command cut off at the time limit leaves nothing either.
    await rm(pidFile);
    await merge(repo, {
      "leave.js": `const { spawn } = require("child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
setInterval(() => {}, 1000);
`,
    });
    const cut = await run(repo.folder, { ...CHECK_LIMITS, checkMs: 5_000 });
    assert.equal(cut.verdict, "not_run");
    assert.match(cut.reason ?? "", /cut off at the 5 s limit/);
    const second = Number(await readFile(pidFile, "utf8"));
    await eventually(() => assert.throws(() => process.kill(second, 0), { code: "ESRCH" }), 5_000);
  },
);

test("without a sandbox can't be turned on by an agent: with no terminal it's refused and nothing is kept, and off Windows it's refused", {
  timeout: 60_000,
}, async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  const desk = await tempRepo();
  t.after(desk.remove);
  // The test's CLI runs with pipes, not a terminal, like a command an agent ran.
  const refused = await world.cliIn(desk.folder, "runner", "--merge-check", "unsandboxed");
  assert.equal(refused.code, 1);
  assert.match(
    refused.stderr,
    process.platform === "win32"
      ? /To turn them on, run omagari runner --merge-check unsandboxed in a terminal yourself; an agent can't\./
      : /only for native Windows/,
  );
  if (process.platform === "win32")
    assert.match(refused.stdout, /The risk: teammates' unpushed code/);
  await assert.rejects(access(join(desk.folder, ".git", "omagari", "merge-check")));
});

test(
  "on native Windows without a sandbox, the web reads the runner's merge run as on without a sandbox, and omagari runner check gives verdicts from a real check command",
  process.platform === "win32" ? { timeout: 120_000 } : windowsOnly,
  async (t) => {
    const world = await startWorld({ mergeCheck: "unsandboxed", observeMs: 50 });
    t.after(world.stop);
    await eventually(async () =>
      assert.equal((await call(world.owner, api.settings)).mergeCheck.runner, "unsandboxed"),
    );
    await merge(world.repo, {
      ".omagari.json": config("node check.js"),
      "check.js": "process.exit(require('fs').existsSync('fail.txt') ? 1 : 0);\n",
    });
    const passed = await world.cli("runner", "check");
    assert.match(passed.stdout, /Verdict: Pass/, passed.stdout);
    await writer(world.repo.folder)("fail.txt", "");
    const broken = await world.cli("runner", "check");
    assert.match(broken.stdout, /Verdict: Broken/, broken.stdout);
  },
);

test("omagari setup run without a terminal doesn't ask about merge runs, and on Windows says how to turn them on and keeps nothing; --merge-check unsandboxed is refused", {
  timeout: 60_000,
}, async (t) => {
  const world = await startWorld();
  t.after(world.stop);
  const plain = await world.setup();
  assert.equal(plain.code, 0, plain.stderr);
  const note =
    "Merge runs are off. To turn them on, run `omagari setup --merge-check unsandboxed` in a terminal yourself; an agent can't.";
  if (process.platform === "win32") assert.ok(plain.stdout.includes(note), plain.stdout);
  else assert.ok(!plain.stdout.includes("Merge runs"), plain.stdout);
  const refused = await world.setup("--merge-check", "unsandboxed");
  assert.equal(refused.code, 1);
  assert.match(
    refused.stderr,
    process.platform === "win32" ? /an agent can't\./ : /only for native Windows/,
  );
});

test(
  "without a sandbox doesn't come from a file: a runner started where the repo's and the machine's files say unsandboxed runs with the sandbox setting",
  process.platform === "win32" ? { timeout: 60_000 } : windowsOnly,
  async (t) => {
    const world = await startWorld();
    t.after(world.stop);
    world.github.grant("alice");
    await world.signInCli(await world.login("alice"));
    const desk = await tempRepo();
    t.after(desk.remove);
    // Files anything on this machine can write, without a person typing yes.
    await writer(join(desk.folder, ".git", "omagari"))("merge-check", "unsandboxed\n");
    await writer(join(world.config, "omagari"))("merge-check", "unsandboxed\n");
    const runner = world.launchCliIn(desk.folder, "runner");
    t.after(() => runner.stop("SIGKILL"));
    const [, state] = await runner.output(/Merge run \(([^)]+)\)/);
    await runner.stop();
    assert.notEqual(state, "on, without a sandbox");
  },
);
