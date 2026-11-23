// Turning on merge runs without a sandbox on native Windows (ADR-0059). Only a person turns it on: a typed `yes` in a terminal.
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

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
 * What a person said yes to, kept apart from every file an agent can write: the Windows registry, under the current user (ADR-0059).
 * `name` is a repo (its Omagari folder) or `DEFAULT` for this machine; the value is `off` or `unsandboxed`, `undefined` removes it.
 */
export type Approvals = {
  read: (name: string) => Promise<string | undefined>;
  write: (name: string, value: string | undefined) => Promise<void>;
};

/** The name of this machine's default among the approvals. */
export const DEFAULT = "default";

/** The registry on native Windows. `key` is for tests. reg.exe by its full path, so a file in the current folder can't stand in for it. */
export function registry(key = "HKCU\\Software\\Omagari\\MergeRuns"): Approvals {
  const reg = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
  const run = (...args: string[]) => promisify(execFile)(reg, args, { windowsHide: true });
  return {
    read: (name) =>
      run("query", key, "/v", name).then(
        ({ stdout }) => stdout.match(/REG_SZ[ \t]+(.*)$/m)?.[1]?.trim(),
        () => undefined, // no key or no value
      ),
    write: async (name, value) => {
      if (value !== undefined) await run("add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f");
      else await run("delete", key, "/v", name, "/f").catch(() => {});
    },
  };
}

/**
 * The merge run a repo starts with. `chosen` is its `--merge-check`, already checked (and for `unsandboxed`, said yes to by a person).
 * `file` keeps the repo's own on or off: anyone may turn merge runs off or back to the sandbox. Without a sandbox comes only from `approvals`, never from a file,
 * so writing files can't turn it on (ADR-0059). A repo with neither starts with the machine's default, else on.
 */
export async function mergeCheckFor(
  file: string,
  chosen: "on" | "off" | "unsandboxed" | undefined,
  approvals: Approvals = registry(),
  platform = process.platform,
): Promise<"on" | "off" | "unsandboxed"> {
  const repo = dirname(file);
  if (chosen === "unsandboxed") {
    await approvals.write(repo, "unsandboxed");
    await rm(file, { force: true });
    return chosen;
  }
  if (chosen !== undefined) {
    await mkdir(repo, { recursive: true });
    await writeFile(file, `${chosen}\n`);
    if (platform === "win32") await approvals.write(repo, undefined);
    return chosen;
  }
  const saved = await readFile(file, "utf8").then(
    (text) => text.trim(),
    (error) => {
      if (error.code === "ENOENT") return undefined;
      throw error; // couldn't read what was saved, so don't fall back to the default
    },
  );
  if (saved === "on" || saved === "off") return saved;
  if (saved !== undefined && saved !== "unsandboxed")
    throw new Error(`Merge run must be one of on, off: ${saved} (${file})`);
  if (platform !== "win32") return "on";
  for (const name of [repo, DEFAULT])
    if ((await approvals.read(name)) === "unsandboxed") return "unsandboxed";
  return "on";
}

/**
 * This machine's default for repos with no choice of their own, kept in `approvals` as `off` or `unsandboxed` (ADR-0059). A repo's own `--merge-check` wins over it.
 * With `flag` (`omagari setup --merge-check`), it changes the default: `unsandboxed` goes through the same typed `yes` as everywhere, `off` goes through at once.
 * Without one, a saved answer is kept and nothing is asked; otherwise a person in a terminal is asked once, and an agent is told how (and nothing is saved, so a person is still asked later).
 * Only native Windows has the choice; elsewhere it does nothing, and a flag is refused.
 */
export async function chooseMergeDefault(
  approvals: Approvals,
  flag: string | undefined,
  io?: Parameters<typeof confirmUnsandboxed>[1],
  terminal = io?.terminal ?? isTerminal(),
  platform = io?.platform ?? process.platform,
) {
  const write = io?.write ?? ((text: string) => process.stdout.write(text));
  const save = async (value: "off" | "unsandboxed") => {
    await approvals.write(DEFAULT, value);
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
  if ((await approvals.read(DEFAULT)) !== undefined) return;
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
