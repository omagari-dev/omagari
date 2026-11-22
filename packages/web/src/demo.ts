// The static demo (`omagari.org/demo/`, ADR-0058): only `vite build --mode demo` loads this, before the app starts.
// It answers the web's API calls and live connection in the browser from `demo/fixtures.json` (recorded from the `test/demo.ts` seed by
// `npm run demo:fixtures`). What a visitor does changes only this tab, in memory, and is gone on reload. Nothing goes to a server.
import {
  type ChannelMessage,
  encode,
  HISTORY_PAGE,
  type Prefs,
  REPO_HEADER,
  serverToWeb,
  WORKSPACE_HEADER,
} from "@omagari/contract";
import recorded from "../demo/fixtures.json" with { type: "json" };
import { format } from "./address.ts";
import { placeKey, remember, showDemoNote } from "./api.ts";

type Body = Record<string, unknown>;
type Me = { login: string; name: string; prefs: Prefs };

/** Times are moved so the seed looks as fresh now as when it was recorded. */
const shift = Date.now() - Date.parse(recorded.at);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const fresh = (value: unknown): unknown => {
  if (typeof value === "string" && ISO.test(value))
    return new Date(Date.parse(value) + shift).toISOString();
  if (Array.isArray(value)) return value.map(fresh);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fresh(v)]));
  return value;
};
const fixtures = fresh(recorded) as {
  get: Record<string, Body>;
  history: Record<string, ChannelMessage[]>;
  threads: Record<string, { messages: ChannelMessage[] }>;
  dms: Record<string, Body>;
};
const me = fixtures.get["/api/me  "] as unknown as Me;
const now = () => new Date().toISOString();
let lastId = Math.max(
  0,
  ...Object.values(fixtures.history).flatMap((list) => list.map((m) => m.id)),
);

// --- The live connection ---

const sockets = new Set<FakeSocket>();
const broadcast = (frame: string) => {
  for (const socket of sockets) socket.onmessage?.({ data: frame } as MessageEvent);
};

/** Stands in for the WebSocket `live.ts` opens. It answers hello with welcome and the member list, like the server. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      sockets.add(this);
      this.onopen?.();
    });
  }
  send(frame: string) {
    const { payload } = JSON.parse(frame) as { payload: { workspace?: string } };
    setTimeout(() => {
      this.onmessage?.({ data: encode(serverToWeb, "welcome", { seq: lastId }) } as MessageEvent);
      const members = read("/api/members", payload.workspace, undefined);
      this.onmessage?.({ data: encode(serverToWeb, "members", members as never) } as MessageEvent);
    });
  }
  close() {
    this.readyState = 3;
    sockets.delete(this);
  }
}

// --- The API ---

/** A recorded GET answer: for the repo, else the workspace, else none (the recording keeps only what differs). */
const read = (path: string, workspace = "", repo = "") =>
  fixtures.get[`${path} ${workspace} ${repo}`] ??
  fixtures.get[`${path} ${workspace} `] ??
  fixtures.get[`${path}  `];

/** Every copy of a message: the channel's history and any thread it shows in. */
const copies = (id: number) =>
  [...Object.values(fixtures.history), ...Object.values(fixtures.threads).map((t) => t.messages)]
    .flat()
    .filter((m) => m.id === id);
const update = (id: number, change: (m: ChannelMessage) => void) => {
  for (const copy of copies(id)) change(copy);
  const message = copies(id)[0];
  if (message) broadcast(encode(serverToWeb, "message", message));
  return message;
};
/** How a message looks when something points at it (`ReplyTo.original`): its author and first line. */
const original = (id: number) => {
  const message = copies(id)[0];
  if (!message || (message.kind !== "text" && message.kind !== "qa")) return null;
  const text = message.kind === "text" ? message.text : message.qa.question;
  const line = text.split("\n").find((l) => !l.startsWith(">")) ?? "";
  return { login: message.login, name: message.name, line };
};

const handlers: Record<string, (body: Body, workspace?: string) => unknown> = {
  "/api/login": () => ({
    device: "demo",
    userCode: "DEMO-0000",
    verificationUri: "https://github.com/login/device",
    intervalMs: 1000,
  }),
  "/api/login/poll": () => ({ session: "demo", login: me.login }),
  "/api/logout": () => ({}),
  "/api/channels/history": ({ channel, before, thread }) => {
    if (thread !== undefined)
      return fixtures.threads[`${channel} ${thread}`] ?? { messages: copies(thread as number) };
    const all = fixtures.history[channel as string] ?? [];
    const older = before === undefined ? all : all.filter((m) => m.id < (before as number));
    return { messages: older.slice(-HISTORY_PAGE) };
  },
  "/api/dms": ({ channel }) => fixtures.dms[channel as string] ?? { qas: [] },
  "/api/prefs": (change) => {
    Object.assign(me.prefs, change);
    broadcast(encode(serverToWeb, "prefs", me.prefs));
    return me.prefs;
  },
  "/api/channels/react": ({ message, emoji, on }) => {
    const changed = update(message as number, (m) => {
      if (m.kind !== "text" && m.kind !== "qa") return;
      const who = { login: me.login, name: me.name };
      const found = m.reactions.find((r) => r.emoji === emoji);
      if (on && !found) m.reactions.push({ emoji: emoji as string, members: [who] });
      else if (on && found && !found.members.some((one) => one.login === me.login))
        found.members.push(who);
      else if (!on && found) {
        found.members = found.members.filter((one) => one.login !== me.login);
        if (!found.members.length) m.reactions.splice(m.reactions.indexOf(found), 1);
      }
    });
    return changed
      ? { message: changed }
      : { error: { code: "not_found", message: "No such message" } };
  },
  "/api/channels/messages": (body) => {
    const {
      channel,
      text,
      replyTo,
      notify = true,
      threadOf,
      alsoInChannel,
    } = body as {
      channel: string;
      text: string;
      replyTo?: number;
      notify?: boolean;
      threadOf?: number;
      alsoInChannel?: boolean;
    };
    const message: ChannelMessage = {
      kind: "text",
      id: ++lastId,
      channel,
      login: me.login,
      name: me.name,
      text: text.trim(),
      at: now(),
      reactions: [],
      ...(replyTo !== undefined && {
        replyTo: { id: replyTo, notify, original: original(replyTo) },
      }),
      ...(threadOf !== undefined && {
        threadOf: { id: threadOf, original: original(threadOf), writers: [me.login] },
        ...(alsoInChannel && { alsoInChannel: true as const }),
      }),
    };
    if (threadOf === undefined || alsoInChannel) {
      fixtures.history[channel] ??= [];
      fixtures.history[channel].push(message);
    }
    if (threadOf !== undefined) {
      const key = `${channel} ${threadOf}`;
      fixtures.threads[key] ??= { messages: copies(threadOf).slice(0, 1) };
      fixtures.threads[key].messages.push(message);
      update(threadOf, (m) => {
        if (m.kind !== "text" && m.kind !== "qa") return;
        const writers = [
          { login: me.login, name: me.name },
          ...(m.thread?.writers ?? []).filter((w) => w.login !== me.login),
        ].slice(0, 3);
        m.thread = { count: (m.thread?.count ?? 0) + 1, writers, last: message.at };
      });
    }
    broadcast(encode(serverToWeb, "message", message));
    return { message };
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const realFetch = fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
    return realFetch(input, init);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const workspace = headers[WORKSPACE_HEADER];
  const body = init?.body ? (JSON.parse(String(init.body)) as Body) : {};
  const handle = handlers[url.pathname];
  const answer =
    init?.method === "GET"
      ? read(url.pathname, workspace, headers[REPO_HEADER])
      : handle?.(body, workspace);
  if (answer && !("error" in (answer as Body))) return json(answer);
  if (answer) return json(answer, 400);
  // Asking an agent, merge runs, decision PRs, saving settings: they need a real server, so say so instead (ADR-0058).
  showDemoNote();
  return json({ error: { code: "forbidden", message: "Not in the demo" } }, 403);
};
globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;

// I'm here, so I'm online (nobody had the screen open while recording).
for (const answer of Object.values(fixtures.get))
  for (const member of (answer.members ?? []) as { login: string; presence: string }[])
    if (member.login === me.login)
      Object.assign(member, { presence: "online", offlineSince: null });

// Come in signed in (the session is a placeholder; nothing checks it), on the first workspace's "All",
// in its busiest chat channel.
try {
  localStorage.setItem("omagari.session", "demo");
  const space = (read("/api/workspaces") as { workspaces: { id: string }[] }).workspaces[0]?.id;
  const { channels } = read("/api/channels", space) as { channels: { id: string; kind: string }[] };
  const busiest = channels
    .filter((c) => c.kind === "chat")
    .sort(
      (a, b) => (fixtures.history[b.id]?.length ?? 0) - (fixtures.history[a.id]?.length ?? 0),
    )[0];
  if (space && localStorage.getItem(placeKey(space)) === null) remember(placeKey(space), "");
  if (space && busiest && !history.state)
    history.replaceState({ path: format({ workspace: space, channel: busiest.id }) }, "");
} catch {}
