import {
  type api,
  type ContractError,
  ContractFailure,
  type call,
  type ExecutorId,
  type ModelPick,
} from "@omagari/contract";
import { useSyncExternalStore } from "react";
import { format, parse } from "./address.ts";

export type Me = Awaited<ReturnType<typeof call<typeof api.me>>>;

export type Workspace = Awaited<
  ReturnType<typeof call<typeof api.workspaces>>
>["workspaces"][number];

/**
 * The workspace picked now (`Workspace.id`). Switching workspaces redraws the app frame, so every API sends this as a header (ADR-0043).
 * For per-repo APIs, pass `repo` to call that repo.
 */
let workspace: string | undefined;
export const setWorkspace = (id: string) => {
  workspace = id;
};

/** The address of a channel (or a post in it) in the workspace picked now (ADR-0057). */
export const link = (channel: string, post?: number, big?: boolean) =>
  format({ workspace: workspace ?? "", channel, post, big: big || undefined });

/** The last limit the server said was hit (ADR-0052), until the banner is closed. Every call goes through `server`, so any screen's hit lands here. */
let hit: ContractError["limit"];
const hitListeners = new Set<() => void>();
const setHit = (limit: ContractError["limit"]) => {
  hit = limit;
  for (const listener of hitListeners) listener();
};
export const clearLimit = () => setHit(undefined);
export const useLimit = () =>
  useSyncExternalStore(
    (listener) => {
      hitListeners.add(listener);
      return () => hitListeners.delete(listener);
    },
    () => hit,
  );

/** In the static demo (ADR-0058): something needed a real server, so the demo note says so until closed. */
let demoNote = false;
const demoListeners = new Set<() => void>();
const setDemoNote = (on: boolean) => {
  demoNote = on;
  for (const listener of demoListeners) listener();
};
export const showDemoNote = () => setDemoNote(true);
export const clearDemoNote = () => setDemoNote(false);
export const useDemoNote = () =>
  useSyncExternalStore(
    (listener) => {
      demoListeners.add(listener);
      return () => demoListeners.delete(listener);
    },
    () => demoNote,
  );

/** The server the web calls. It serves the API from the same place as the screen (in development, Vite forwards it). */
export const server = (session?: string, repo?: string) => ({
  url: location.origin,
  session,
  workspace,
  repos: repo ? [repo] : undefined,
  onFailure: (failure: ContractFailure) => {
    if (failure.code === "limited") setHit(failure.limit);
  },
});

const KEY = "omagari.session";

/**
 * Keeps the session in this browser so you stay logged in after a refresh. In a browser that blocks storage (a private window, etc.),
 * you stay logged in only in this tab.
 */
export function savedSession() {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveSession(session: string | undefined) {
  try {
    if (session) localStorage.setItem(KEY, session);
    else localStorage.removeItem(KEY);
  } catch {}
}

/** The model and effort picked in the DM, per member and per Agent (executor). Kept only in this browser (ADR-0020). */
const picksKey = (login: string) => `omagari.picks.${login}`;

export function savedPicks(login: string): Partial<Record<ExecutorId, ModelPick>> {
  try {
    const saved = JSON.parse(localStorage.getItem(picksKey(login)) ?? "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export function savePicks(login: string, picks: Partial<Record<ExecutorId, ModelPick>>) {
  try {
    localStorage.setItem(picksKey(login), JSON.stringify(picks));
  } catch {}
}

/** Has the session ended or is it missing? Kept apart from not reaching the server. */
export const signedOut = (error: unknown) =>
  error instanceof ContractFailure && error.code === "unauthorized";

/** A small value kept on this device. In a browser that blocks storage, it isn't kept. */
export function remembered(key: string) {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
export function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** A repo name (the name in `owner/name`). */
export const repoName = (repo: string) => repo.split("/")[1] ?? repo;

/** The last place seen per workspace (a repo name or "All"), and the last channel seen per place (its path). Kept on this device. */
export const placeKey = (workspace: string) => `omagari.place.${workspace}`;
export const lastKey = (workspace: string, place: string) =>
  `omagari.last-channel.${workspace}.${place}`;

/** The path of the last channel seen in a place. One kept before paths (`#…`) is read in that workspace. */
export function lastPath(workspace: string, place: string) {
  const saved = remembered(lastKey(workspace, place));
  const at = saved ? parse(saved) : undefined;
  return typeof at === "object" && at.channel
    ? format({ ...at, workspace: at.workspace ?? workspace })
    : undefined;
}
