// The web's error reports and stuck waits (ADR-0063, ADR-0064): masked, sent through `api.sendReport`.
// Ones that can't go yet (not signed in, or the call failed) wait in local storage, capped, and go after sign-in.
import {
  api,
  CONTRACT_VERSION,
  call,
  type ErrorReport,
  maskReport,
  reportKey,
} from "@omagari/contract";
import { server } from "./api.ts";

const KEY = "omagari.reports";
/** Most reports waiting in this browser. Past it, the oldest goes. */
export const QUEUED_REPORTS = 20;
/** A short wait counts as stuck after this long (ADR-0064). */
export const STUCK_MS = 60_000;

let session: string | undefined;
/** The member's "Send error reports" switch. */
let mine = true;
/** The server said it takes no reports (or the member's switch is off there). */
let refused = false;
let flushing = false;
/** Grouping keys already sent from this page load, so a loop of the same error sends once. */
const sent = new Set<string>();

const read = (): ErrorReport[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
};
const write = (queued: ErrorReport[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(queued));
  } catch {} // blocked storage: the report is lost
};

/** Who is signed in and whether their switch is on. Signed out is `undefined`. Sending what waits happens here. */
export function reportingFor(next: string | undefined, on: boolean) {
  if (next !== session) refused = false;
  session = next;
  if (on && !mine) refused = false;
  mine = on;
  if (session && !on) write([]);
  void flush();
}

async function flush() {
  if (!session || !mine || refused || flushing) return;
  flushing = true;
  try {
    for (let next = read()[0]; next; next = read()[0]) {
      write(read().slice(1));
      try {
        const { off } = await call(server(session), api.sendReport, next);
        if (off) {
          refused = true;
          write([]);
          return;
        }
      } catch {
        write([next, ...read()]);
        return;
      }
    }
  } finally {
    flushing = false;
  }
}

/** The browser's name and version, and the system it runs on, from the user agent. */
export function browserInfo(ua: string) {
  const [, name, version] =
    ua.match(/(Edg|Firefox)\/(\d+)/) ??
    ua.match(/(Chrome)\/(\d+)/) ??
    ua.match(/(Version)\/(\d+).*Safari/) ??
    [];
  const runtime = name
    ? `${{ Edg: "Edge", Version: "Safari" }[name] ?? name} ${version}`
    : "unknown";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown";
  return { os, runtime };
}

const stackLines = (stack: string | undefined) =>
  (stack ?? "")
    .split("\n")
    .map((line) => line.trim().replaceAll(location.origin, ""))
    .filter((line) => /^at |@/.test(line))
    .slice(0, 20);

function send(report: Pick<ErrorReport, "kind" | "where" | "name" | "message" | "stack">) {
  try {
    const masked = maskReport({
      piece: "web",
      version: `contract ${CONTRACT_VERSION}`,
      ...browserInfo(navigator.userAgent),
      arch: "",
      count: 1,
      ...report,
    });
    const key = reportKey(masked);
    if (sent.has(key)) return;
    sent.add(key);
    // Signed in with the switch off, or refused: nothing is kept. Signed out: wait for sign-in.
    if (session && (!mine || refused)) return;
    const queued = read();
    const same = queued.findIndex((q) => reportKey(q) === key);
    if (same >= 0) queued.splice(same, 1);
    queued.push(masked);
    write(queued.slice(-QUEUED_REPORTS));
    void flush();
  } catch {
    // Reporting never throws.
  }
}

/** An error from `error`, `unhandledrejection` or the error boundary. `where` is the kind of place, never an address (those hold repo names). */
export function reportError(where: string, error: unknown) {
  const failed = error instanceof Error ? error : new Error(String(error));
  send({
    kind: "error",
    where: `web / ${where}`,
    name: failed.name,
    message: failed.message,
    stack: stackLines(failed.stack),
  });
}

/** A short wait that ran past `STUCK_MS` (ADR-0064): the screen and the step it was on. */
export function reportStuck(where: string, ms = STUCK_MS) {
  send({
    kind: "stuck",
    where,
    name: "Stuck",
    message: `Waited ${Math.round(ms / 1000)} seconds`,
    stack: [],
  });
}

/**
 * Starts the clock on a short wait. After `ms` it calls `onLate` and sends one stuck report. Once only, and the returned function stops it
 * (the wait ended). "Try again" is the screen's own business and never starts another clock.
 */
export function watchStuck(where: string, onLate: () => void, ms = STUCK_MS) {
  const timer = setTimeout(() => {
    onLate();
    reportStuck(where, ms);
  }, ms);
  return () => clearTimeout(timer);
}

/** Reports the page's uncaught errors and rejected promises. */
export function listenForErrors() {
  addEventListener("error", (event) => reportError("uncaught error", event.error ?? event.message));
  addEventListener("unhandledrejection", (event) =>
    reportError("unhandled rejection", event.reason),
  );
}
