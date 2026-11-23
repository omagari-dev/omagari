import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmUnsandboxed, UNSANDBOXED_QUESTION } from "./unsandboxed.ts";

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
