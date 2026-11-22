import { useSyncExternalStore } from "react";

/**
 * Where an app address points (ADR-0057): `/channels/<workspace>[/<channel id>[/<post number>[/big]]]`.
 * `workspace` is missing at `/` and in an old `#…` link, whose workspace is found from the channel (`workspaceOf`).
 */
export type Address = { workspace?: string; channel?: string; post?: number; big?: true };

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
};

/** `<channel>[/<post number>[/big]]`, the same in a path and an old hash. Undefined when the parts don't make an address. */
function place(parts: (string | undefined)[]): Address | undefined {
  const [channel, post, size, ...more] = parts;
  if (parts.includes(undefined) || more.length || channel === "") return undefined;
  if (post !== undefined && !/^[1-9]\d*$/.test(post)) return undefined;
  if (size !== undefined && size !== "big") return undefined;
  return {
    ...(channel && { channel }),
    ...(post && { post: Number(post) }),
    ...(size && { big: true }),
  };
}

/** Reads a path with its hash (`location.pathname + location.hash`). `"login"` is the sign-in page; undefined is an unknown address. */
export function parse(address: string): Address | "login" | undefined {
  const at = address.indexOf("#");
  const path = at < 0 ? address : address.slice(0, at);
  const hash = at < 0 ? "" : address.slice(at + 1);
  if (hash) return place(hash.split("/").map(decode));
  if (path === "/" || path === "") return {};
  if (path === "/login") return "login";
  const [root, channels, workspace, ...parts] = path.split("/").map(decode);
  if (root !== "" || channels !== "channels" || !workspace) return undefined;
  const found = place(parts);
  return found && { workspace: workspace.toLowerCase(), ...found };
}

/** The path of an address. A post number needs a channel, and `big` needs a post. */
export function format({ workspace, channel, post, big }: Address & { workspace: string }) {
  let path = `/channels/${encodeURIComponent(workspace)}`;
  if (!channel) return path;
  path += `/${encodeURIComponent(channel)}`;
  if (!post) return path;
  return `${path}/${post}${big ? "/big" : ""}`;
}

/**
 * The workspace an old `#…` link's channel (or forum) is in: the first of `workspaces` that has it, else the first one.
 * Put the likely one first. "Other posts" is in no channel list, so it lands in the first one too.
 */
export async function workspaceOf(
  channel: string,
  workspaces: string[],
  channelsOf: (workspace: string) => Promise<{ id: string }[]>,
) {
  for (const workspace of workspaces) {
    if ((await channelsOf(workspace)).some((one) => one.id === channel)) return workspace;
  }
  return workspaces[0] ?? "";
}

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("popstate", listener);
  };
};
/**
 * The static demo (ADR-0058) sits at one page (`/demo/`) of a host that knows no app paths, so its address stays there
 * and the app's path lives in the history entry instead. Back and Forward still work; a reload starts over, like the demo's data.
 */
const DEMO = import.meta.env?.MODE === "demo";
/** The path and hash now (`location.pathname + location.hash`, or the demo's). */
export const here = (): string =>
  DEMO ? (history.state?.path ?? "/") : location.pathname + location.hash;

/** The path and hash now. Redraws on `go`, Back, and Forward. */
export const usePath = () => useSyncExternalStore(subscribe, here);
/** The address now (`parse` of `usePath`). */
export const useAddress = () => parse(usePath());

/** Move to `path`: a new history entry, or with `replace` the same one (a redirect). */
export function go(path: string, replace = false) {
  if (path === here()) return;
  if (DEMO) history[replace ? "replaceState" : "pushState"]({ path }, "");
  else history[replace ? "replaceState" : "pushState"](null, "", path);
  for (const listener of listeners) listener();
}

/** Links to app addresses move with `go`, so the page doesn't reload. ⌘/Ctrl/Shift-click and the middle button still open a new tab. */
export function followLinks() {
  document.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a") : null;
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    if (link.origin !== location.origin || !link.pathname.startsWith("/channels/")) return;
    event.preventDefault();
    go(link.pathname);
  });
}
