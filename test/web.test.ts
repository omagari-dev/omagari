import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { api, CONTRACT_VERSION, call } from "@omagari/contract";
import { format, parse, workspaceOf } from "../packages/web/src/address.ts";
import { REPO, REPO3, startWorld, stubbed } from "./harness.ts";

test("the server serves the built web screen at the same address as the API, and sends a missing path to the first file", async (t) => {
  const web = await mkdtemp(join(tmpdir(), "omagari-web-"));
  t.after(() => rm(web, { recursive: true, force: true }));
  await writeFile(join(web, "index.html"), "<!doctype html><title>Omagari</title>");
  await writeFile(join(web, "app.js"), "console.log(1)");
  const world = await startWorld({ webDir: web });
  t.after(world.stop);
  const url = world.server.url;

  assert.match(await (await fetch(`${url}/`)).text(), /<title>Omagari/);
  assert.equal(await (await fetch(`${url}/app.js`)).text(), "console.log(1)");
  // A route inside the screen opens even on refresh.
  assert.match(await (await fetch(`${url}/forum/42`)).text(), /<title>Omagari/);
  // An API that doesn't exist is a contract error, not the screen.
  const missing = await fetch(`${url}/api/nope`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: { code: string } }).error.code, "not_found");
  // Health check
  assert.deepEqual(await call({ url, session: "", ...stubbed() }, api.health), {
    contract: CONTRACT_VERSION,
  });
});

test("an old `#channel` link opens the same channel at its path: the web finds its workspace from the channel lists, and the server serves the screen there", async (t) => {
  const web = await mkdtemp(join(tmpdir(), "omagari-web-"));
  t.after(() => rm(web, { recursive: true, force: true }));
  await writeFile(join(web, "index.html"), "<!doctype html><title>Omagari</title>");
  const world = await startWorld({ webDir: web, accept: [REPO, REPO3] });
  t.after(world.stop);
  world.github.grant("owner", REPO3);
  const owner = await world.login("owner");
  const B = "other-team";
  const channel = await world.channel({ ...owner, workspace: B } as typeof owner, "plans");
  const channelsOf = async (workspace: string) =>
    (await call({ ...owner, workspace }, api.channels)).channels;

  // `/#<channel>/<post>/big` from a GitHub comment, opened while the other workspace was the last one seen.
  const old = parse(`/#${channel}/3/big`);
  assert.ok(typeof old === "object" && old.channel);
  const workspace = await workspaceOf(old.channel, ["omagari-test", B], channelsOf);
  const path = format({ ...old, workspace });
  assert.equal(path, `/channels/${B}/${channel}/3/big`);
  assert.match(await (await fetch(`${world.server.url}${path}`)).text(), /<title>Omagari/);
  assert.match(await (await fetch(`${world.server.url}/login`)).text(), /<title>Omagari/);
});

test("the server sends the browser security headers with the web screen and its API", async (t) => {
  const web = await mkdtemp(join(tmpdir(), "omagari-web-"));
  t.after(() => rm(web, { recursive: true, force: true }));
  await writeFile(join(web, "index.html"), "<!doctype html><title>Omagari</title>");
  const world = await startWorld({ webDir: web });
  t.after(world.stop);

  for (const path of ["/", "/api/health", "/api/nope"]) {
    const response = await fetch(`${world.server.url}${path}`);
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/, path);
    assert.match(csp, /frame-ancestors 'none'/, path);
    assert.match(
      csp,
      /img-src 'self' data: https:\/\/\*\.giphy\.com https:\/\/avatars\.githubusercontent\.com/,
      path,
    );
    assert.match(csp, /font-src 'self' data:/, path);
    assert.match(csp, /connect-src 'self' https:\/\/api\.giphy\.com/, path);
    assert.equal(response.headers.get("x-frame-options"), "DENY", path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
  }
});
