// The background runner (ADR-0049): one process per user that runs one runner per repo folder, in-process.
// The session-start hook sends it folders over one socket. It keeps the folders in the config folder and starts them again after a restart.

import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { ContractFailure } from "@omagari/contract";
import { onPath } from "@omagari/contract/shim";
import {
  backgroundSocket,
  Expected,
  OutsideAccounts,
  readRepo,
  removeStaleSocket,
  runnerPaths,
  STOP,
  serveLocal,
} from "@omagari/runner";

/** How often it tries again the folders whose runner isn't on (server down at login, a terminal runner that ended). */
// The env var is for tests, which can't wait a minute.
const RETRY_MS = Number(process.env.OMAGARI_BACKGROUND_RETRY_MS) || 60_000;

const execFileAsync = promisify(execFile);

type Running = { ended: Promise<unknown>; stop: () => Promise<void> | void };

/**
 * Runs until SIGINT or SIGTERM, or, where there are no signals between processes (Windows, ADR-0060), until a "stop" request comes over its socket. `start` starts the runner of one repo folder; `foldersFile` keeps the folders it has seen.
 * A folder whose remotes aren't under the server's accounts is dropped without sending anything (ADR-0049). It comes back only if a session opens there again.
 */
export async function background(
  foldersFile: string,
  start: (folder: string) => Promise<Running>,
  /** Sends an error report (ADR-0063). Refusals and unreachable servers aren't bugs, so they never get here. */
  report: (error: Error, where: string, folder: string) => void = () => {},
) {
  let folders: string[] = JSON.parse(await readFile(foldersFile, "utf8").catch(() => "[]"));
  /** Runners by their per-repo socket, which is one per repo whatever worktree the folder is. Pending starts are in it too. */
  const running = new Map<string, Promise<Running | undefined>>();
  /** The last line said about each repo, so a retry every minute doesn't repeat it. */
  const said = new Map<string, string>();
  /** Says `line` unless it was the last thing said about `key`. A bug that comes with it is reported once with it too. */
  const say = (
    key: string,
    line: string,
    failed?: { error: unknown; where: string; folder: string },
  ) => {
    if (said.get(key) !== line) {
      console.log(line);
      const { error, where, folder } = failed ?? {};
      if (
        error instanceof Error &&
        !(error instanceof ContractFailure || error instanceof Expected)
      )
        report(error, where ?? "", folder ?? "");
    }
    said.set(key, line);
  };
  /** The folder each repo's runner was started in, and the other working trees of that repo seen last time it was alive (main working tree first). */
  const where = new Map<string, { folder: string; trees: string[] }>();
  /** Still a repo's own top folder. A removed worktree whose empty folder is left inside another repo doesn't count. */
  const alive = (folder: string) =>
    readRepo(folder).then(
      (repo) => repo.folder === folder,
      () => false,
    );
  const save = async () => {
    await mkdir(dirname(foldersFile), { recursive: true, mode: 0o700 });
    await writeFile(foldersFile, `${JSON.stringify(folders, null, 2)}\n`);
  };

  /** Starts the runner of `folder` unless it's on. Resolves once it's on or it's clear it won't be. */
  async function watch(folder: string) {
    const { socket } = await runnerPaths(folder);
    const current = running.get(socket);
    const at = where.get(socket);
    if (current && at && at.folder !== folder && !(await alive(at.folder))) {
      // The folder it was started in is gone (a removed worktree), so it moves to this live one (#488).
      (await current)?.stop();
      running.delete(socket);
      say(socket, `The folder ${at.folder} is gone. Watching ${folder} instead`);
      if (!folders.includes(folder)) folders.push(folder);
      await save();
    } else if (current) return current;
    const started = (async () => {
      const runner = await start(folder);
      where.set(socket, { folder, trees: (await treesOf(folder)) ?? at?.trees ?? [] });
      say(socket, `Watching ${folder}`);
      runner.ended.then((reason) => {
        if (running.get(socket) !== started) return; // it was moved to another folder
        running.delete(socket);
        say(
          socket,
          `The runner for ${folder} stopped${reason instanceof Error ? `: ${reason.message}` : ""}`,
          { error: reason, where: "background runner / stopped", folder },
        );
      });
      return runner;
    })().catch(async (error) => {
      if (error instanceof OutsideAccounts) {
        say(socket, `Not watching ${folder}: its remotes aren't under the server's accounts`);
        folders = folders.filter((kept) => kept !== folder);
        await save();
      } else
        say(socket, `Couldn't start the runner for ${folder}: ${error.message ?? error}`, {
          error,
          where: "background runner / start",
          folder,
        });
      return undefined;
    });
    running.set(socket, started);
    if (!(await started)) running.delete(socket);
    return started;
  }

  /** The working trees of the repo `folder` is in, main working tree first. */
  const treesOf = async (folder: string) => {
    const { stdout } = await execFileAsync(
      onPath("git"),
      ["-C", folder, "worktree", "list", "--porcelain", "-z"],
      { maxBuffer: 16 * 1024 * 1024 },
    ).catch(() => ({ stdout: "" }));
    const trees = stdout
      .split("\0")
      .filter((field) => field.startsWith("worktree "))
      .map((field) => field.slice("worktree ".length));
    return trees.length ? trees : undefined;
  };

  /** Remembers the other working trees of each live runner's repo, and moves a runner whose folder is gone to one of them. If none is left it stops and drops the folder. */
  async function heal() {
    for (const [socket, at] of [...where]) {
      if (await alive(at.folder)) {
        at.trees = (await treesOf(at.folder)) ?? at.trees;
        continue;
      }
      let next: string | undefined;
      for (const tree of [...at.trees, ...folders]) {
        if (tree === at.folder || !(await alive(tree))) continue;
        if ((await runnerPaths(tree).catch(() => undefined))?.socket !== socket) continue;
        next = tree;
        break;
      }
      if (next) await watch(next);
      else {
        (await running.get(socket))?.stop();
        running.delete(socket);
        where.delete(socket);
        say(socket, `The folder ${at.folder} is gone and no other folder of its repo is left`);
      }
    }
  }

  /** Starts every kept folder that isn't on. Folders that are gone (or no longer a Git repo with a GitHub remote) are dropped. */
  async function watchAll() {
    await heal();
    const kept = await Promise.all(
      folders.map((folder) =>
        alive(folder).then(async (ok) => {
          if (!ok) return undefined;
          await watch(folder);
          return folders.includes(folder) ? folder : undefined;
        }),
      ),
    );
    const left = kept.filter((folder) => folder !== undefined);
    if (left.length !== folders.length) {
      folders = left;
      await save();
    }
  }

  const stopRequested = Promise.withResolvers<void>();

  /** A folder from the hook. "stop" ends this process after its runners close. "" only asks which repos are watched. Answers with the per-repo sockets of the runners that are on. */
  async function answer(request: string) {
    if (request === STOP) {
      stopRequested.resolve();
      return "[]";
    }
    const repo = request ? await readRepo(request).catch(() => undefined) : undefined;
    if (repo) {
      if (!folders.includes(repo.folder)) {
        folders.push(repo.folder);
        await save();
      }
      await watch(repo.folder);
    }
    const on = await Promise.all(
      [...running].map(async ([socket, runner]) => ((await runner) ? [socket] : [])),
    );
    return JSON.stringify(on.flat());
  }

  const socket = backgroundSocket();
  const local = createServer(serveLocal(answer));
  await removeStaleSocket(socket); // left behind by a background runner that was killed
  local.listen(socket);
  await once(local, "listening");
  console.log(`Background runner on: ${socket}`);
  await watchAll();
  const retry = setInterval(() => watchAll().catch(() => {}), RETRY_MS);
  // Only test runners set this (test/harness.ts). The one `omagari setup` registers never does, so it outlives the terminal.
  const testParent = Number(process.env.OMAGARI_TEST_PARENT_PID);
  if (testParent)
    setInterval(() => {
      try {
        process.kill(testParent, 0);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") process.exit(0); // the test run that started us is gone
      }
    }, 1000).unref();

  await Promise.race([
    ...["SIGINT", "SIGTERM"].map((signal) => once(process, signal)),
    stopRequested.promise,
  ]);
  clearInterval(retry);
  local.close();
  await Promise.all([...running.values()].map(async (runner) => (await runner)?.stop()));
  console.log("Background runner stopped");
}
