import { api, call } from "@omagari/contract";
import { format, parse, workspaceOf } from "./address.ts";

type Server = Parameters<typeof call>[0];

/**
 * The path for an address once signed in: an old `#…` link gets its workspace from its channel (`workspaces`, the likely one first),
 * and `/login` and unknown addresses go to `/`.
 */
export async function settle(address: string, srv: Server, workspaces: string[]) {
  const at = parse(address);
  if (typeof at !== "object" || !(at.workspace || at.channel)) return "/";
  const workspace =
    at.workspace ??
    (await workspaceOf(at.channel ?? "", workspaces, (id) =>
      call({ ...srv, workspace: id }, api.channels).then(
        (list) => list.channels,
        () => [],
      ),
    ));
  return format({ ...at, workspace });
}

/**
 * Everything the web needs once a session exists: me, the workspaces, the one to open (the one seen last, else the first) and the path to go to.
 * A person with no workspace still comes in, with `workspace: ""`: a server that takes access requests shows them the Access screen (ADR-0052).
 */
export async function loadEntry(srv: Server, saved: string | undefined, back: string) {
  const [me, { workspaces }] = await Promise.all([call(srv, api.me), call(srv, api.workspaces)]);
  const workspace = workspaces.find((space) => space.id === saved)?.id ?? workspaces[0]?.id ?? "";
  const others = workspaces.map((space) => space.id).filter((id) => id !== workspace);
  const target = workspace ? await settle(back, srv, [workspace, ...others]) : "/";
  return { me, workspaces, workspace, target };
}
