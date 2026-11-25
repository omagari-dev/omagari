import assert from "node:assert/strict";
import { test } from "node:test";
import type { MyReport } from "@omagari/contract";
import { issueUrl } from "./issue-url.ts";

const row: MyReport = {
  id: 1,
  piece: "runner",
  kind: "error",
  version: "0.4.1",
  os: "win32",
  arch: "x64",
  runtime: "Node 24.3.0",
  where: "background runner / observation",
  name: "Error",
  message: "EPERM: open '<home>\\.omagari\\state.json'",
  stack: ["at writeState (packages/runner/src/state.ts:42:9)"],
  count: 12,
  first: "2026-11-24T05:03:00.000Z",
  last: "2026-11-24T06:10:00.000Z",
};

test("the issue opens on the server's source repo, a fork's own, filled from the report", () => {
  const url = new URL(issueUrl("https://github.com/jisu-team/omagari.git/", row) ?? "");
  assert.equal(url.origin + url.pathname, "https://github.com/jisu-team/omagari/issues/new");
  assert.equal(
    url.searchParams.get("title"),
    "runner: Error: EPERM: open '<home>\\.omagari\\state.json'",
  );
  const body = url.searchParams.get("body") ?? "";
  assert.match(body, /0\.4\.1/);
  assert.match(body, /win32 x64/);
  assert.match(body, /12 times/);
  assert.match(body, /packages\/runner\/src\/state\.ts:42:9/);
  // Nothing in the report names a person, and the link adds no one.
  assert.doesNotMatch(url.href, /login|minjun/i);
});

test("a long stack is cut to fit GitHub's URL, and a source off GitHub opens nothing", () => {
  const long = { ...row, stack: Array.from({ length: 20 }, () => `at f (${"x".repeat(480)})`) };
  const url = issueUrl("https://github.com/omagari-dev/omagari", long) ?? "";
  assert.ok(url.length <= 8000);
  assert.match(new URL(url).searchParams.get("body") ?? "", /at f/);
  assert.equal(issueUrl("https://gitlab.com/team/omagari", row), undefined);
});
