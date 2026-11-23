// `npm`, `claude` and `codex` are `.cmd` shims on Windows, and Node won't spawn those without a shell (ADR-0060).
// These wrap child_process so callers keep passing a file and its arguments; elsewhere they are the plain calls.
import {
  type ExecFileOptions,
  execFile,
  type SpawnOptionsWithStdioTuple,
  type StdioNull,
  type StdioPipe,
  spawn,
} from "node:child_process";
import { promisify } from "node:util";

const WINDOWS = () => process.platform === "win32";

/** Quotes one argument for cmd.exe: C runtime quoting first, then a caret before every cmd metacharacter (the way cross-spawn does). */
function quote(arg: string) {
  const crt = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  return crt.replace(/[()%!^"<>&|]/g, "^$&");
}

/** The file and arguments to hand to Node: on Windows, `cmd.exe /d /s /c "<file> <args>"` with the arguments left as built. */
function through(file: string, args: readonly string[]) {
  if (!WINDOWS()) return { file, args: [...args], verbatim: false };
  const line = [file, ...args.map(quote)].join(" ");
  return {
    file: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
  };
}

/** `execFile` that finds `.cmd` shims on Windows. Returns the same promise (with `.child`) as `promisify(execFile)`. */
export function execShim(file: string, args: readonly string[], options: ExecFileOptions = {}) {
  const run = through(file, args);
  return promisify(execFile)(run.file, run.args, {
    ...options,
    windowsVerbatimArguments: run.verbatim,
    // ponytail: aborting kills cmd.exe only, so its child may outlive it on Windows; add taskkill /T if that shows up.
    windowsHide: true,
  } as ExecFileOptions & { encoding?: BufferEncoding }) as Promise<{
    stdout: string;
    stderr: string;
  }> & {
    child: ReturnType<typeof execFile>;
  };
}

/** `spawn` that finds `.cmd` shims on Windows. The one caller reads stdout and writes stdin, so that's the stdio shape it types. */
export function spawnShim(
  file: string,
  args: readonly string[],
  options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioNull>,
) {
  const run = through(file, args);
  return spawn(run.file, run.args, {
    ...options,
    windowsVerbatimArguments: run.verbatim,
    windowsHide: true,
  });
}
