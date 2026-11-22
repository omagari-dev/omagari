// Records what the seeded demo server answers, for the static demo (`omagari.org/demo/`, ADR-0058).
// `test/demo.ts` calls it with DEMO_RECORD=<file> once everything is seeded, then quits. Run it with `npm run demo:fixtures`.
// The web's demo mode (`packages/web/src/demo.ts`) answers the same calls from this file in the browser.
import { writeFile } from "node:fs/promises";
import { api, CONTRACT_VERSION, type ContractFailure, call, HISTORY_PAGE } from "@omagari/contract";

type As = { url: string; session: string; login: string };
type Server = As & { workspace?: string; repos?: string[] };

/** The key a GET answer is kept under: its path, the workspace, and the repo the web sends with it. */
export const getKey = (path: string, workspace = "", repo = "") => `${path} ${workspace} ${repo}`;

/** An error answer is kept too, so the demo answers it the same way. */
const read = async <T>(go: () => Promise<T>) => {
  try {
    return await go();
  } catch (error) {
    const { code, message, limit } = error as ContractFailure;
    return { error: { code, message, ...(limit && { limit }) } };
  }
};

export async function record(as: As, file: string) {
  const gets = Object.values(api).filter((route) => route.method === "GET" && !("body" in route));
  const get: Record<string, unknown> = {};
  const history: Record<string, unknown[]> = {};
  const threads: Record<string, unknown> = {};
  const dms: Record<string, unknown> = {};
  const readAll = async (server: Server, workspace?: string, repo?: string) => {
    for (const route of gets)
      get[getKey(route.path, workspace, repo)] = await read(() => call(server, route));
  };
  await readAll(as);
  const { workspaces } = await call(as, api.workspaces);
  for (const space of workspaces) {
    const server = { ...as, workspace: space.id };
    await readAll(server, space.id);
    for (const repo of space.repos) await readAll({ ...server, repos: [repo] }, space.id, repo);
    // Every channel and post this workspace shows, with its whole history (read a page at a time, oldest first).
    const { channels } = await call(server, api.channels);
    const posts = (
      await Promise.all(space.repos.map((repo) => call({ ...server, repos: [repo] }, api.posts)))
    ).flatMap((one) => one.posts);
    for (const channel of new Set([...channels.map((c) => c.id), ...posts.map((p) => p.channel)])) {
      const all: Awaited<ReturnType<typeof call<typeof api.history>>>["messages"] = [];
      for (let before: number | undefined; ; ) {
        const { messages } = await call(server, api.history, { channel, before });
        all.unshift(...messages);
        if (messages.length < HISTORY_PAGE) break;
        before = messages[0]?.id;
      }
      history[channel] = all;
      for (const message of all)
        if ("thread" in message && message.thread)
          threads[`${channel} ${message.id}`] = await read(() =>
            call(server, api.history, { channel, thread: message.id }),
          );
      dms[channel] = await read(() => call(server, api.dms, { channel }));
    }
  }
  // Keep only what differs from the less specific key; the demo falls back to it (repo → workspace → none).
  for (const key of Object.keys(get).reverse()) {
    const [path, workspace, repo] = key.split(" ");
    const less = repo ? getKey(path, workspace) : workspace ? getKey(path) : undefined;
    if (less && JSON.stringify(get[less]) === JSON.stringify(get[key])) delete get[key];
  }
  const fixtures = {
    contract: CONTRACT_VERSION,
    at: new Date().toISOString(),
    get,
    history,
    threads,
    dms,
  };
  await writeFile(file, `${JSON.stringify(fixtures)}\n`);
  console.log(`Recorded the demo to ${file}`);
}
