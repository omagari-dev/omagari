// Error reports (ADR-0063): the runner's own errors go, masked, to the server it's connected to. The ones it can't send yet wait in a small file in the config folder.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { arch, homedir, platform } from "node:os";
import { dirname } from "node:path";
import { type ErrorReport, maskReport, reportKey } from "@omagari/contract";
import { checkoutVersion } from "@omagari/contract/version";

/** Most reports waiting on the machine (ADR-0063). Past it, the oldest goes. */
export const QUEUED_REPORTS = 50;

/** `OMAGARI_NO_ERROR_REPORTS=1` or `DO_NOT_TRACK=1` (ADR-0063): nothing is queued or sent. */
export const reportsDisabled = () =>
  process.env.OMAGARI_NO_ERROR_REPORTS === "1" || process.env.DO_NOT_TRACK === "1";

/** A report waiting to be sent, and the server it goes to. Only that server gets it. */
type Queued = { server: string; report: ErrorReport };

let version: string | undefined;

/** A masked report of `error` from `piece`. `where` is the command and step ("background runner / start"). `repo` is the repo folder, masked as `<repo>`. */
export function buildReport(
  piece: ErrorReport["piece"],
  error: unknown,
  where: string,
  repo?: string,
): ErrorReport {
  const failed = error instanceof Error ? error : new Error(String(error));
  version ??= checkoutVersion();
  return maskReport(
    {
      piece,
      kind: "error",
      version,
      os: platform(),
      arch: arch(),
      runtime: `Node ${process.versions.node}`,
      where,
      name: failed.name,
      message: failed.message,
      stack: (failed.stack ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("at ")),
      count: 1,
    },
    { home: homedir(), repo },
  );
}

/**
 * The runner's error reports, kept in `file` (the config folder's `reports.json`). `add` masks and queues one and sends it right away if a runner is connected to that server;
 * `connected` sends what's waiting after a welcome, or clears it if the server refuses reports. Reporting never throws: a report that can't be made is lost.
 */
export function errorReports(file: string) {
  /** How to send on each server's live runner connections. Any one of them sends. */
  const senders = new Map<string, Set<(report: ErrorReport) => void>>();
  /** Servers that said in welcome they refuse reports. Nothing is queued for them until a welcome says otherwise. */
  const refused = new Set<string>();
  const read = (): Queued[] => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  };
  const write = (queued: Queued[]) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${JSON.stringify(queued)}\n`, { mode: 0o600 });
  };
  /** Takes the server's reports out of the file and hands them to a live connection, newest first (the server keeps only 20 new rows an hour). */
  const flush = (server: string) => {
    const [send] = senders.get(server) ?? [];
    const queued = read();
    if (!send || !queued.some((q) => q.server === server)) return;
    write(queued.filter((q) => q.server !== server));
    for (const q of queued.reverse()) if (q.server === server) send(q.report);
  };

  /** Adds `report` to the file (one row per same error, with a count) and sends it if a runner is connected. */
  const put = (server: string, report: ErrorReport) => {
    if (reportsDisabled() || refused.has(server)) return;
    const key = reportKey(report);
    const queued = read();
    const same = queued.findIndex((q) => q.server === server && reportKey(q.report) === key);
    const count = same < 0 ? 1 : Math.min((queued[same]?.report.count ?? 0) + 1, 10_000);
    if (same >= 0) queued.splice(same, 1);
    queued.push({ server, report: { ...report, count } });
    write(queued.slice(-QUEUED_REPORTS));
    flush(server);
  };

  return {
    /** Queues a report of `error` from `piece` (the runner's own, or the CLI's) and sends it right away if a runner is connected to that server. */
    add(
      server: string,
      error: unknown,
      where: string,
      repo?: string,
      piece: ErrorReport["piece"] = "runner",
    ) {
      try {
        put(server, buildReport(piece, error, where, repo));
      } catch {
        // A report that can't be made is lost. It never stops the piece.
      }
    },
    /** Queues a report another piece (a hook) already masked and handed over. */
    put(server: string, report: ErrorReport) {
      try {
        put(server, report);
      } catch {
        // A report that can't be written is lost.
      }
    },
    /**
     * For a process with no runner connection (the CLI): sends what waits for `server` with `send`, which answers whether the server wants no reports (`off`).
     * What can't be sent stays in the file. If the server refuses, the waiting ones are dropped.
     */
    async deliver(server: string, send: (report: ErrorReport) => Promise<{ off: boolean }>) {
      try {
        for (const q of read()
          .filter((q) => q.server === server)
          .reverse()) {
          const { off } = await send(q.report);
          const sent = reportKey(q.report);
          write(
            read().filter((x) => x.server !== server || (!off && reportKey(x.report) !== sent)),
          );
          if (off) return;
        }
      } catch {
        // Not signed in, or the server isn't there: it waits for the next time.
      }
    },
    /** A runner got welcome from `server`. Returns what to call when that connection closes. */
    connected(server: string, reportsOff: boolean, send: (report: ErrorReport) => void) {
      if (reportsDisabled()) return () => {};
      if (reportsOff) {
        refused.add(server);
        const queued = read();
        if (queued.some((q) => q.server === server))
          write(queued.filter((q) => q.server !== server));
        return () => {};
      }
      refused.delete(server);
      const live = senders.get(server) ?? new Set();
      senders.set(server, live.add(send));
      try {
        flush(server);
      } catch {}
      return () => live.delete(send);
    },
  };
}

export type ErrorReports = ReturnType<typeof errorReports>;
