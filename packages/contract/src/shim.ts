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
import { existsSync, statSync } from "node:fs";
import { isAbsolute, win32 } from "node:path";
import { promisify } from "node:util";

const WINDOWS = () => process.platform === "win32";

/**
 * Where a program name points on Windows, looked up in PATH only: Windows would otherwise try the current folder first, and a repo can hold a `git.exe` or `npm.cmd` (ADR-0060).
 * Elsewhere, and for names with a folder in them, the name as given. A name not on PATH comes back as a path that doesn't exist, so starting it fails the usual way.
 */
export function onPath(name: string, env: NodeJS.ProcessEnv = process.env) {
  if (!WINDOWS() || /[\\/]/.test(name)) return name;
  const get = (key: string) => env[Object.keys(env).find((k) => k.toUpperCase() === key) ?? key];
  const extensions = name.includes(".")
    ? [""]
    : (get("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD").split(";");
  for (const dir of (get("PATH") ?? "").split(";")) {
    if (!isAbsolute(dir)) continue; // "" and "." are the current folder
    for (const extension of extensions) {
      const found = win32.join(dir.replace(/^"|"$/g, ""), name + extension);
      try {
        if (existsSync(found) && statSync(found).isFile()) return found;
      } catch {}
    }
  }
  return win32.join(get("SYSTEMROOT") ?? "C:\\Windows", "omagari-not-on-path", name);
}

/** Quotes one argument for cmd.exe: C runtime quoting first, then a caret before every cmd metacharacter (the way cross-spawn does). */
function quote(arg: string, twice = false) {
  const crt = `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1")}"`;
  const caret = (text: string) => text.replace(/[()%!^"<>&|]/g, "^$&");
  // A batch file reads its command line a second time, so its arguments need the carets twice.
  return twice ? caret(caret(crt)) : caret(crt);
}

/** The file and arguments to hand to Node: on Windows, `cmd.exe /d /s /c "<file> <args>"` with the arguments left as built. */
function through(file: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  if (!WINDOWS()) return { file, args: [...args], verbatim: false, env };
  const target = onPath(file, env);
  const batch = /\.(cmd|bat)$/i.test(target);
  // The program itself is escaped like cross-spawn does: carets before metacharacters and spaces, no quotes.
  const line = [
    target.replace(/[()[\]%!^"`<>&|;, *?]/g, "^$&"),
    ...args.map((arg) => quote(arg, batch)),
  ].join(" ");
  return {
    file: env.ComSpec || onPath("cmd.exe", env),
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
    // cmd.exe looks in the current folder before PATH unless told not to.
    env: { ...env, NoDefaultCurrentDirectoryInExePath: "1" },
  };
}

/** `execFile` that finds `.cmd` shims on Windows. Returns the same promise (with `.child`) as `promisify(execFile)`. */
export function execShim(file: string, args: readonly string[], options: ExecFileOptions = {}) {
  const run = through(file, args, options.env);
  return promisify(execFile)(run.file, run.args, {
    ...options,
    env: run.env,
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
  const run = through(file, args, options.env);
  return spawn(run.file, run.args, {
    ...options,
    env: run.env,
    windowsVerbatimArguments: run.verbatim,
    windowsHide: true,
  });
}
