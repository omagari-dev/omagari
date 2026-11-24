import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { errorReports, QUEUED_REPORTS } from "./reports.ts";

test("the queue merges the same error and never keeps more than 50, dropping the oldest", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "omagari-reports-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "reports.json");
  const reports = errorReports(file);
  const read = async () =>
    JSON.parse(await readFile(file, "utf8")) as { report: { message: string; count: number } }[];

  reports.add("http://a", new Error("same 1"), "runner");
  reports.add("http://a", new Error("same 2"), "runner");
  assert.deepEqual(
    (await read()).map((q) => [q.report.message, q.report.count]),
    [["same 2", 2]],
  );

  for (let i = 0; i < 60; i++)
    reports.add("http://a", new Error(`kind ${"x".repeat(i)}`), "runner");
  const kept = await read();
  assert.equal(kept.length, QUEUED_REPORTS);
  assert.equal(kept.at(-1)?.report.message, `kind ${"x".repeat(59)}`);
  assert.ok(!kept.some((q) => q.report.message === "same 2"));

  // Each report goes only to its own server, newest first.
  const sent: string[] = [];
  reports.add("http://b", new Error("for b"), "runner");
  reports.connected("http://b", false, (report) => sent.push(report.message));
  assert.deepEqual(sent, ["for b"]);
  // Adding b's pushed the oldest of a's out, and b's left with the send.
  assert.equal((await read()).length, QUEUED_REPORTS - 1);
});
