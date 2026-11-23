// Turning on merge runs without a sandbox on native Windows (ADR-0059). Only a person turns it on: a typed `yes` in a terminal.
import { createInterface } from "node:readline/promises";

/** What on and off do, and the risk (`docs/stage8-questions.md` Q8). Shown wherever the switch is turned on. */
export const UNSANDBOXED_WARNING = `Merge runs on Windows
A merge run merges your work with a teammate's for a moment and runs the
check command (npm test) on this machine. Windows has no sandbox yet that
holds that code in, so here it would run as you, with no sandbox.

The risk: teammates' unpushed code comes through the server and runs as your
Windows account. If the server is broken into, or a teammate's test is
malicious, it can read your SSH keys, tokens and browser cookies.

  Off: no merge runs on this machine. Teammates' verdicts still show.
       For sandboxed merge runs, use WSL2.
  On:  merge runs run here without a sandbox. Only if you trust the server
       and everyone in your workspaces.
`;

export const UNSANDBOXED_QUESTION =
  "Turn on merge runs without a sandbox? Type yes to turn on (Enter keeps it off): ";

/**
 * Asks a person to turn on merge runs without a sandbox. True only when `yes` was typed in a terminal. Without a terminal (an agent ran it) it throws, so an agent,
 * or a prompt injected into one, can't turn it on. `command` is what the person runs in a terminal to turn it on.
 */
export async function confirmUnsandboxed(
  command: string,
  io: {
    platform: NodeJS.Platform;
    terminal: boolean;
    write: (text: string) => void;
    ask: (question: string) => Promise<string>;
  } = {
    platform: process.platform,
    terminal: !!(process.stdin.isTTY && process.stdout.isTTY),
    write: (text) => process.stdout.write(text),
    ask: async (question) => {
      const lines = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await lines.question(question);
      } finally {
        lines.close();
      }
    },
  },
) {
  if (io.platform !== "win32")
    throw new Error(
      "Merge runs without a sandbox are only for native Windows. Here merge runs run inside the sandbox: omagari runner --merge-check on",
    );
  io.write(`${UNSANDBOXED_WARNING}\n`);
  if (!io.terminal)
    throw new Error(
      `Merge runs without a sandbox weren't turned on. To turn them on, run ${command} in a terminal yourself; an agent can't.`,
    );
  return (await io.ask(UNSANDBOXED_QUESTION)).trim() === "yes";
}
