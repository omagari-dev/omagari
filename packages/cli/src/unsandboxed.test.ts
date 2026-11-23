import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  chooseMergeDefault,
  confirmUnsandboxed,
  NOT_ASKED,
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

const saved = async () => join(await mkdtemp(join(tmpdir(), "omagari-md-")), "merge-check");
const read = (file: string) => readFile(file, "utf8").catch(() => undefined);

test("setup asks once in a terminal: yes turns it on, anything else leaves it off, and a saved answer is kept without asking", async () => {
  for (const [typed, kept] of [
    ["yes", "unsandboxed\n"],
    ["", "off\n"],
    ["y", "off\n"],
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
  await writeFile(file, "unsandboxed\n");
  await chooseMergeDefault(file, "off", io(false).io);
  assert.equal(await read(file), "off\n");
  await assert.rejects(
    chooseMergeDefault(file, "unsandboxed", io(true, "no").io),
    /weren't turned on/,
  );
  assert.equal(await read(file), "off\n");
  await chooseMergeDefault(file, "unsandboxed", io(true, "yes").io);
  assert.equal(await read(file), "unsandboxed\n");
  await assert.rejects(chooseMergeDefault(file, "on", io(true).io), /must be off or unsandboxed/);
  const other = await saved();
  const mac = io(true, "yes", "darwin");
  await chooseMergeDefault(other, undefined, mac.io);
  assert.deepEqual(mac.asked, []);
  await assert.rejects(chooseMergeDefault(other, "off", mac.io), /only for native Windows/);
  await assert.rejects(chooseMergeDefault(other, "unsandboxed", mac.io), /only for native Windows/);
  assert.equal(await read(other), undefined);
});
