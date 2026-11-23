import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  type Approvals,
  chooseMergeDefault,
  confirmUnsandboxed,
  DEFAULT,
  mergeCheckFor,
  NOT_ASKED,
  registry,
  UNSANDBOXED_QUESTION,
} from "./unsandboxed.ts";

const COMMAND = "omagari runner --merge-check unsandboxed";

/** A person (or an agent) at the prompt: whether there's a terminal, and what gets typed. */
function io(terminal: boolean, typed?: string, platform: NodeJS.Platform = "win32") {
  const shown: string[] = [];
  const asked: string[] = [];
  return {
    shown,
    asked,
    io: {
      platform,
      terminal,
      write: (text: string) => shown.push(text),
      ask: async (question: string) => {
        asked.push(question);
        return typed ?? "";
      },
    },
  };
}

test("turning on merge runs without a sandbox shows the risk and needs yes typed in a terminal", async () => {
  const yes = io(true, "yes\n");
  assert.equal(await confirmUnsandboxed(COMMAND, yes.io), true);
  assert.match(yes.shown.join(""), /^Merge runs on Windows\n/);
  assert.match(yes.shown.join(""), /it can read your SSH keys, tokens and browser cookies\./);
  assert.deepEqual(yes.asked, [UNSANDBOXED_QUESTION]);
  // Anything other than yes (Enter, y, no) keeps it off.
  for (const typed of ["", "y", "no", "yes please"])
    assert.equal(await confirmUnsandboxed(COMMAND, io(true, typed).io), false, typed);
});

test("without a terminal (an agent ran it), turning on is refused without asking, and it says a person has to run it", async () => {
  const agent = io(false, "yes");
  await assert.rejects(confirmUnsandboxed(COMMAND, agent.io), {
    message: `Merge runs without a sandbox weren't turned on. To turn them on, run ${COMMAND} in a terminal yourself; an agent can't.`,
  });
  assert.deepEqual(agent.asked, []);
  assert.match(agent.shown.join(""), /The risk:/);
});

test("off native Windows, turning on is refused even in a terminal", async () => {
  const mac = io(true, "yes", "darwin");
  await assert.rejects(confirmUnsandboxed(COMMAND, mac.io), /only for native Windows/);
  assert.deepEqual(mac.asked, []);
});

/** What a person said yes to, in memory instead of the registry. */
function approvals(): Approvals & { kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kept,
    read: async (name) => kept.get(name),
    write: async (name, value) => {
      if (value === undefined) kept.delete(name);
      else kept.set(name, value);
    },
  };
}
const saved = async () => approvals();
const read = async (file: Approvals) => file.read(DEFAULT);

test("setup asks once in a terminal: yes turns it on, anything else leaves it off, and a saved answer is kept without asking", async () => {
  for (const [typed, kept] of [
    ["yes", "unsandboxed"],
    ["", "off"],
    ["y", "off"],
  ]) {
    const file = await saved();
    const person = io(true, typed);
    await chooseMergeDefault(file, undefined, person.io);
    assert.equal(await read(file), kept, typed);
    assert.deepEqual(person.asked, [UNSANDBOXED_QUESTION]);
    // Setup again: no question, answer stays.
    const again = io(true, "yes");
    await chooseMergeDefault(file, undefined, again.io);
    assert.deepEqual(again.asked, []);
    assert.equal(await read(file), kept);
  }
});

test("setup run by an agent never turns it on: it prints how, saves nothing, and the flag is refused", async () => {
  const file = await saved();
  const agent = io(false, "yes");
  await chooseMergeDefault(file, undefined, agent.io);
  assert.deepEqual(agent.asked, []);
  assert.ok(agent.shown.join("").endsWith(`${NOT_ASKED}\n`));
  assert.equal(await read(file), undefined);
  await assert.rejects(
    chooseMergeDefault(file, "unsandboxed", io(false, "yes").io),
    /an agent can't/,
  );
  assert.equal(await read(file), undefined);
});

test("setup --merge-check changes the default: off at once, unsandboxed only with yes; not on other platforms", async () => {
  const file = await saved();
  await file.write(DEFAULT, "unsandboxed");
  await chooseMergeDefault(file, "off", io(false).io);
  assert.equal(await read(file), "off");
  await assert.rejects(
    chooseMergeDefault(file, "unsandboxed", io(true, "no").io),
    /weren't turned on/,
  );
  assert.equal(await read(file), "off");
  await chooseMergeDefault(file, "unsandboxed", io(true, "yes").io);
  assert.equal(await read(file), "unsandboxed");
  await assert.rejects(chooseMergeDefault(file, "on", io(true).io), /must be off or unsandboxed/);
  const other = await saved();
  const mac = io(true, "yes", "darwin");
  await chooseMergeDefault(other, undefined, mac.io);
  assert.deepEqual(mac.asked, []);
  await assert.rejects(chooseMergeDefault(other, "off", mac.io), /only for native Windows/);
  await assert.rejects(chooseMergeDefault(other, "unsandboxed", mac.io), /only for native Windows/);
  assert.equal(await read(other), undefined);
});

/** A repo's Omagari folder with its merge-check file, like `runnerPaths`. */
const repoFile = async () => {
  const folder = join(await mkdtemp(join(tmpdir(), "omagari-repo-")), ".git", "omagari");
  await mkdir(folder, { recursive: true });
  return join(folder, "merge-check");
};

test("without a sandbox is never read from a file: a repo's file or the old machine file saying unsandboxed starts with on", async () => {
  const file = await repoFile();
  await writeFile(file, "unsandboxed\n");
  // Where the machine's default used to be a file.
  await writeFile(join(dirname(file), "..", "..", "merge-check"), "unsandboxed\n");
  const none = approvals();
  assert.equal(await mergeCheckFor(file, undefined, none, "win32"), "on");
  assert.deepEqual([...none.kept], []);
  // Only what a person said yes to turns it on: for this repo, or as the machine's default.
  const repo = approvals();
  await repo.write(dirname(file), "unsandboxed");
  assert.equal(await mergeCheckFor(file, undefined, repo, "win32"), "unsandboxed");
  const machine = approvals();
  await machine.write(DEFAULT, "unsandboxed");
  assert.equal(await mergeCheckFor(file, undefined, machine, "win32"), "unsandboxed");
  // Off Windows the yes isn't read at all.
  assert.equal(await mergeCheckFor(file, undefined, machine, "darwin"), "on");
});

test("a repo's own on or off wins over the yes, anyone can write it, and choosing it forgets the repo's yes", async () => {
  const file = await repoFile();
  const kept = approvals();
  await kept.write(DEFAULT, "unsandboxed");
  assert.equal(await mergeCheckFor(file, "unsandboxed", kept, "win32"), "unsandboxed");
  assert.equal(kept.kept.get(dirname(file)), "unsandboxed");
  await assert.rejects(readFile(file, "utf8"));
  // Turning it off with the flag, or with a file: off.
  assert.equal(await mergeCheckFor(file, "off", kept, "win32"), "off");
  assert.equal(kept.kept.has(dirname(file)), false);
  assert.equal(await readFile(file, "utf8"), "off\n");
  await writeFile(file, "on\n");
  assert.equal(await mergeCheckFor(file, undefined, kept, "win32"), "on");
  await writeFile(file, "maybe\n");
  await assert.rejects(
    mergeCheckFor(file, undefined, kept, "win32"),
    /must be one of on, off: maybe/,
  );
});

test(
  "on native Windows the yes is kept in the registry under the current user",
  process.platform === "win32" ? {} : { skip: "The registry is only on Windows" },
  async (t) => {
    const key = `HKCU\\Software\\Omagari\\Test-${process.pid}-${Date.now()}`;
    const store = registry(key);
    const reg = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
    t.after(
      () => new Promise((done) => execFile(reg, ["delete", key, "/f"], () => done(undefined))),
    );
    const name = "C:\\repo\\.git\\omagari";
    assert.equal(await store.read(name), undefined);
    await store.write(name, "unsandboxed");
    assert.equal(await store.read(name), "unsandboxed");
    assert.equal(await store.read(DEFAULT), undefined);
    await store.write(name, undefined);
    assert.equal(await store.read(name), undefined);
  },
);
