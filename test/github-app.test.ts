// Sign-in through a GitHub App (ADR-0053): expiring tokens are refreshed, a rejected refresh ends the session,
// a repo hidden because the App isn't installed says to install it, and an OAuth app's token works as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { api, ContractFailure, call } from "@omagari/contract";
import { REPO, startWorld } from "./harness.ts";

const INSTALL = "https://github.com/apps/omagari-test/installations/new";

// On slow windows-latest a 300 ms token can expire between a refresh and the GitHub call it's for.
const LIFETIME_MS = process.platform === "win32" ? 1_500 : 300;

test("with a GitHub App, an expiring token is refreshed before GitHub calls, so a member stays signed in past expiry", async (t) => {
  // Each re-check reads push access on GitHub with the member's token. With an expired token it would read "no access" and end the session.
  const world = await startWorld({
    recheckMs: 50,
    githubApp: "omagari-test",
    setup: (github) => github.app(LIFETIME_MS),
  });
  t.after(world.stop);

  await sleep(LIFETIME_MS * 3);
  assert.ok(world.github.refreshes > 0);
  assert.equal((await call(world.owner, api.me)).login, "owner");
  assert.deepEqual(await world.agents(world.owner), { owner: "online" });
});

test("when GitHub rejects the refresh token, the session ends cleanly, and the web and CLI ask to sign in again", async (t) => {
  const world = await startWorld({
    recheckMs: 50,
    githubApp: "omagari-test",
    setup: (github) => github.app(300),
  });
  t.after(world.stop);
  const web = await world.live(world.owner);

  world.github.refreshTokens.clear();
  const reason = await world.runner.ended;
  assert.ok(reason instanceof ContractFailure);
  assert.equal(reason.code, "unauthorized");
  assert.equal(reason.message, "GitHub sign-in expired. Log in again (omagari setup)");
  assert.equal(await web.closed, 1008); // the web goes back to its login screen
  await assert.rejects(call(world.owner, api.me), { code: "unauthorized" });

  // The CLI kept the ended session. Setup notices and signs in again.
  await world.signInCli(world.owner);
  const setup = world.launchCliIn(world.repo.folder, "setup");
  t.after(() => setup.stop("SIGKILL"));
  const [, code] = await setup.output(/enter code (\S+)/);
  world.github.approve(code, "owner");
  const done = await setup.exited;
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /Logged in as owner/);
});

test("a repo hidden because the GitHub App isn't installed on its account says to install it, with the link, in the web and CLI", async (t) => {
  const world = await startWorld({ githubApp: "omagari-test" });
  t.after(world.stop);
  world.github.grant("alice");
  world.github.admin("owner");
  world.github.create("omagari-test/later");
  world.github.admin("owner", "omagari-test/later");

  // The add-repo list only has repos the App can see, and links to installing it.
  const listed = await call(world.owner, api.adminRepos);
  assert.equal(listed.install, INSTALL);

  world.github.uninstall("omagari-test");
  assert.deepEqual((await call(world.owner, api.adminRepos)).repos, []);
  // The web's login gets the link to show when it's refused.
  assert.equal((await call(world.server, api.login)).install, INSTALL);
  await assert.rejects(world.login("alice"), {
    code: "forbidden",
    message: `alice can't join: no push access to any of this server's workspace repos. If the Omagari GitHub App isn't installed on that account, its admin installs it: ${INSTALL}`,
  });

  // The CLI prints the same.
  const runner = world.launchCliIn(world.repo.folder, "runner");
  t.after(() => runner.stop("SIGKILL"));
  const [, code] = await runner.output(/enter code (\S+)/);
  world.github.approve(code, "alice");
  const result = await runner.exited;
  assert.equal(result.code, 1);
  assert.ok(result.stderr.includes(INSTALL), result.stderr);
});

test("a public repo the GitHub App isn't installed on isn't reachable: it's left out of the add-repo list instead of failing it, and nobody counts as push or Admin there", async (t) => {
  const world = await startWorld({ githubApp: "omagari-test" });
  t.after(world.stop);
  world.github.admin("owner");
  world.github.create("omagari-test/profile");
  world.github.admin("owner", "omagari-test/profile");
  world.github.grant("alice", "omagari-test/profile");
  world.github.uninstallPublic("omagari-test/profile");

  const listed = await call(world.owner, api.adminRepos);
  assert.deepEqual(
    listed.repos.map((repo) => repo.name),
    [REPO],
  );
  assert.equal(listed.install, INSTALL); // the link to install it is still there
  await assert.rejects(call(world.owner, api.addRepo, { repo: "omagari-test/profile" }), {
    code: "forbidden",
  });
  // The same repo with the App installed adds fine.
  world.github.create("omagari-test/ok");
  world.github.admin("owner", "omagari-test/ok");
  assert.deepEqual(
    (await call(world.owner, api.adminRepos)).repos.map((repo) => repo.name),
    ["omagari-test/ok", REPO].sort(),
  );
  await call(world.owner, api.addRepo, { repo: "omagari-test/ok" });
});

test("an OAuth app's token, which doesn't expire, works as before: no refresh and no install hint", async (t) => {
  const world = await startWorld({ recheckMs: 50 });
  t.after(world.stop);
  world.github.admin("owner");

  await sleep(300);
  assert.equal(world.github.refreshes, 0);
  assert.deepEqual(await world.agents(world.owner), { owner: "online" });
  assert.equal((await call(world.server, api.login)).install, undefined);
  assert.equal((await call(world.owner, api.adminRepos)).install, undefined);
  await assert.rejects(world.login("stranger"), {
    code: "forbidden",
    message: "stranger can't join: no push access to any of this server's workspace repos.",
  });
  assert.equal((await call(world.owner, api.me)).repo, REPO);
});

test("a recheck whose GitHub answer came back after its token expired doesn't end the session as forbidden (#483)", async (t) => {
  // The ordering that gave `forbidden`: the recheck read the member's token, GitHub's answer for it was slow, and by then the token had expired.
  // An expired token reads "no push permission" (GitHub answers 401), which the recheck took for a real answer. It's forced here with a held answer.
  const world = await startWorld({
    recheckMs: 50,
    githubApp: "omagari-test",
    setup: (github) => github.app(200),
  });
  t.after(world.stop);
  await world.live(world.owner);

  const release = world.github.hold("owner", REPO);
  await sleep(600); // the recheck is waiting on GitHub, and its token expires meanwhile
  release();
  await sleep(300); // the recheck gets its answer and decides
  assert.equal((await call(world.owner, api.me)).login, "owner");
  assert.deepEqual(await world.agents(world.owner), { owner: "online" });

  // The first reason wins: when GitHub rejects the refresh token now, the person is told to sign in again.
  world.github.refreshTokens.clear();
  const reason = await world.runner.ended;
  assert.ok(reason instanceof ContractFailure);
  assert.equal(reason.code, "unauthorized");
});
