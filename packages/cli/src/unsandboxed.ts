// Turning on merge runs without a sandbox on native Windows (ADR-0059). Only a person turns it on: a typed `yes` in a terminal.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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

/** What an agent (no terminal) sees where a person would be asked. */
export const NOT_ASKED =
  "Merge runs are off. To turn them on, run `omagari setup --merge-check unsandboxed` in a terminal yourself; an agent can't.";

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
    terminal: isTerminal(),
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

export const isTerminal = () => !!(process.stdin.isTTY && process.stdout.isTTY);

/**
 * This machine's default for repos with no choice of their own, kept in `file` as `off` or `unsandboxed` (ADR-0059). A repo's own `--merge-check` wins over it.
 * With `flag` (`omagari setup --merge-check`), it changes the default: `unsandboxed` goes through the same typed `yes` as everywhere, `off` goes through at once.
 * Without one, a saved answer is kept and nothing is asked; otherwise a person in a terminal is asked once, and an agent is told how (and nothing is saved, so a person is still asked later).
 * Only native Windows has the choice; elsewhere it does nothing, and a flag is refused.
 */
export async function chooseMergeDefault(
  file: string,
  flag: string | undefined,
  io?: Parameters<typeof confirmUnsandboxed>[1],
  terminal = io?.terminal ?? isTerminal(),
  platform = io?.platform ?? process.platform,
) {
  const write = io?.write ?? ((text: string) => process.stdout.write(text));
  const save = async (value: "off" | "unsandboxed") => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${value}\n`);
    write(
      `Merge runs ${value === "off" ? "are off" : "run without a sandbox"} on this machine by default\n`,
    );
  };
  if (flag !== undefined && flag !== "off" && flag !== "unsandboxed")
    throw new Error(`--merge-check for setup must be off or unsandboxed: ${flag}`);
  if (flag === "off" && platform === "win32") return save("off");
  if (flag === "unsandboxed") {
    // Not a terminal (or not Windows) throws here, before anything is saved.
    if (!(await confirmUnsandboxed("omagari setup --merge-check unsandboxed", io)))
      throw new Error("Merge runs without a sandbox weren't turned on");
    return save("unsandboxed");
  }
  if (flag === "off") throw new Error("Merge runs without a sandbox are only for native Windows");
  if (platform !== "win32") return;
  if (
    await readFile(file, "utf8").then(
      () => true,
      () => false,
    )
  )
    return;
  if (!terminal) {
    write(`${UNSANDBOXED_WARNING}\n${NOT_ASKED}\n`);
    return;
  }
  return save(
    (await confirmUnsandboxed("omagari setup --merge-check unsandboxed", io))
      ? "unsandboxed"
      : "off",
  );
}
