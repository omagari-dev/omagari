// Error reports (ADR-0063): the server keeps masked reports, one row per error with a count, and only operators see them.
// The first source is the server's own unexpected errors (the ones that answer 500).
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { api, type ContractFailure, call, type ErrorReport } from "@omagari/contract";
import { eventually, REPO, startWorld } from "./harness.ts";

const refused = (code: string) => (error: ContractFailure) => error.code === code;

/** Breaks a table the settings read uses, so `api.settings` fails inside the server like a real bug would. */
const breakSettings = (database: string) => {
  const db = new DatabaseSync(database);
  db.exec("DROP TABLE ask_off");
  db.close();
};

const report = (message: string): ErrorReport => ({
  piece: "cli",
  kind: "error",
  version: "0.4.1",
  os: "win32",
  arch: "x64",
  runtime: "Node 24.3.0",
  where: "omagari setup",
  name: "Error",
  message,
  stack: ["at setup (C:\\Users\\minjun\\omagari\\packages\\cli\\src\\main.ts:10:3)"],
  count: 1,
});

test("a server error shows once to operators and counts up when it happens again; others get forbidden", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  world.github.grant("carol", REPO);
  const carol = await world.login("carol");
  assert.deepEqual(await call(world.owner, api.errorReports), { reports: [], off: false });

  breakSettings(world.database);
  await assert.rejects(call(world.owner, api.settings), refused("internal"));
  await assert.rejects(call(carol, api.settings), refused("internal"));

  const { reports } = await call(world.owner, api.errorReports);
  assert.equal(reports.length, 1);
  const [row] = reports;
  assert.equal(row?.piece, "server");
  assert.equal(row?.kind, "error");
  assert.equal(row?.where, "GET /api/settings");
  assert.match(row?.message ?? "", /no such table: ask_off/);
  assert.equal(row?.count, 2);
  assert.ok(row?.stack.some((line) => line.includes("packages/server/src")));
  // Whoever hit it, the operator never sees a login.
  assert.doesNotMatch(JSON.stringify(reports), /carol|owner/i);

  // Only operators list, resolve and refuse.
  await assert.rejects(call(carol, api.errorReports), refused("forbidden"));
  await assert.rejects(call(carol, api.resolveReport, { id: row?.id ?? 0 }), refused("forbidden"));
  await assert.rejects(call(carol, api.refuseReports, { off: true }), refused("forbidden"));

  // Resolving deletes the row; when it happens again it comes back as new.
  assert.deepEqual(await call(world.owner, api.resolveReport, { id: row?.id ?? 0 }), {
    reports: [],
    off: false,
  });
  await assert.rejects(call(carol, api.settings), refused("internal"));
  assert.equal((await call(world.owner, api.errorReports)).reports[0]?.count, 1);
});

test("the server masks a sent report again, and one sender starts at most 20 rows an hour", async (t) => {
  // The test clock: one hour shortened to 2 seconds.
  const world = await startWorld({ operators: ["Owner"], hourMs: 2_000 });
  t.after(world.stop);
  const carol = await world.login("carol");

  const sent = await call(carol, api.sendReport, {
    ...report(`push failed with ghp_${"a".repeat(36)} for minjun@example.com`),
    count: 3,
  });
  assert.deepEqual(sent, { off: false });
  const [row] = (await call(world.owner, api.errorReports)).reports;
  assert.equal(row?.message, "push failed with <redacted> for <redacted>");
  assert.deepEqual(row?.stack, ["at setup (<home>\\omagari\\packages\\cli\\src\\main.ts:10:3)"]);
  assert.equal(row?.count, 3);

  // 19 more new errors fill carol's hour; the 21st is dropped, but adding to a row she has still counts.
  for (let i = 1; i <= 20; i++) await call(carol, api.sendReport, report(`kind ${"x".repeat(i)}`));
  await call(carol, api.sendReport, report(`push failed with ghp_${"b".repeat(36)} for a@b.io`));
  let { reports } = await call(world.owner, api.errorReports);
  assert.equal(reports.length, 20);
  assert.ok(!reports.some((r) => r.message === `kind ${"x".repeat(20)}`));
  assert.equal(reports.find((r) => r.message.startsWith("push"))?.count, 4);

  // Someone else isn't held back by carol's limit, and an hour later carol can start rows again.
  const erin = await world.login("erin");
  await call(erin, api.sendReport, report("erin's own"));
  await eventually(async () => {
    await call(carol, api.sendReport, report("an hour later"));
    ({ reports } = await call(world.owner, api.errorReports));
    assert.ok(reports.some((r) => r.message === "an hour later"));
  }, 10_000);
  assert.ok(reports.some((r) => r.message === "erin's own"));
});

test("a row goes 30 days after it last happened", async (t) => {
  // The test clock: 30 days shortened to 1.5 seconds, swept every 50 ms.
  const world = await startWorld({ operators: ["Owner"], followMs: 50, contentMs: 1_500 });
  t.after(world.stop);
  await call(world.owner, api.sendReport, report("old"));
  await call(world.owner, api.sendReport, report("fresh"));
  // "fresh" keeps happening, so only "old" goes.
  const until = Date.now() + 2_500;
  while (Date.now() < until) {
    await call(world.owner, api.sendReport, report("fresh"));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await eventually(async () => {
    const { reports } = await call(world.owner, api.errorReports);
    assert.deepEqual(
      reports.map((r) => r.message),
      ["fresh"],
    );
  });
});

test("while the operator refuses reports, nothing is kept and senders hear they're off", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  world.github.grant("carol", REPO);
  const carol = await world.login("carol");
  assert.deepEqual(await call(world.owner, api.refuseReports, { off: true }), { off: true });

  assert.deepEqual(await call(carol, api.sendReport, report("refused")), { off: true });
  breakSettings(world.database);
  await assert.rejects(call(carol, api.settings), refused("internal"));
  assert.deepEqual(await call(world.owner, api.errorReports), { reports: [], off: true });

  // Taking them again keeps the next ones, and the choice lasts through a restart.
  await world.restartServer();
  assert.equal((await call(world.owner, api.errorReports)).off, true);
  assert.deepEqual(await call(world.owner, api.refuseReports, { off: false }), { off: false });
  assert.deepEqual(await call(carol, api.sendReport, report("taken")), { off: false });
  assert.deepEqual(
    (await call(world.owner, api.errorReports)).reports.map((r) => r.message),
    ["taken"],
  );
});

test("a member's own reports: only they see them, with their own count; the operator sees a login only if it's attached; delete takes out only their part", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  world.github.grant("carol", REPO);
  world.github.grant("erin", REPO);
  const carol = await world.login("carol");
  const erin = await world.login("erin");

  // The same error from both, carol twice; and one only carol sent.
  await call(carol, api.sendReport, { ...report("shared"), count: 2 });
  await call(erin, api.sendReport, report("shared"));
  await call(carol, api.sendReport, report("carol only"));
  const mine = await call(carol, api.myReports);
  assert.deepEqual(
    mine.reports.map((r) => [r.message, r.count]),
    [
      ["carol only", 1],
      ["shared", 2],
    ],
  );
  assert.deepEqual(
    (await call(erin, api.myReports)).reports.map((r) => [r.message, r.count]),
    [["shared", 1]],
  );

  // Anonymous by default; erin attaches her name, and it shows only on the rows she sent.
  const names = async () =>
    Object.fromEntries(
      (await call(world.owner, api.errorReports)).reports.map((r) => [r.message, r.names]),
    );
  assert.deepEqual(await names(), { shared: [], "carol only": [] });
  assert.equal((await call(erin, api.setPrefs, { reportName: true })).reportName, true);
  assert.deepEqual(await names(), { shared: ["erin"], "carol only": [] });

  // erin can't delete what only carol sent.
  const only = mine.reports.find((r) => r.message === "carol only")?.id ?? 0;
  const shared = mine.reports.find((r) => r.message === "shared")?.id ?? 0;
  await assert.rejects(call(erin, api.deleteMyReport, { id: only }), refused("not_found"));

  // carol deletes her part of the shared row: it stays with erin's count, and carol's login is gone from it.
  assert.deepEqual(
    (await call(carol, api.deleteMyReport, { id: shared })).reports.map((r) => r.message),
    ["carol only"],
  );
  let rows = (await call(world.owner, api.errorReports)).reports;
  assert.equal(rows.find((r) => r.id === shared)?.count, 1);
  // Deleting a row only carol sent removes it.
  await call(carol, api.deleteMyReport, { id: only });
  rows = (await call(world.owner, api.errorReports)).reports;
  assert.deepEqual(
    rows.map((r) => r.message),
    ["shared"],
  );
  // When the last sender deletes theirs, the row goes.
  assert.deepEqual(await call(erin, api.deleteMyReport, { id: shared }), { reports: [] });
  assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);
});

test('with "Send error reports" off, the server keeps nothing from that member and says off', async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const carol = await world.login("carol");
  assert.equal((await call(carol, api.me)).prefs.reports, true);
  await call(carol, api.setPrefs, { reports: false });
  assert.deepEqual(await call(carol, api.sendReport, report("not sent")), { off: true });
  assert.deepEqual(await call(carol, api.myReports), { reports: [] });
  assert.deepEqual((await call(world.owner, api.errorReports)).reports, []);
  // Others still send.
  assert.deepEqual(await call(world.owner, api.sendReport, report("owner's")), { off: false });
});

test("deleting an account takes its part out of every report row", async (t) => {
  const world = await startWorld({ operators: ["Owner"] });
  t.after(world.stop);
  const carol = await world.login("carol");
  await call(carol, api.sendReport, report("shared"));
  await call(world.owner, api.sendReport, report("shared"));
  await call(carol, api.sendReport, report("carol only"));
  await call(carol, api.deleteAccount);
  const { reports } = await call(world.owner, api.errorReports);
  assert.deepEqual(
    reports.map((r) => [r.message, r.count]),
    [["shared", 1]],
  );
});
