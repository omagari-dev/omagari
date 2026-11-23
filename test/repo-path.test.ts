// Paths that go to the server or get compared with Git paths use `/` on every OS (#464). Windows writes `\`, so the helper gets the OS separator.
import assert from "node:assert/strict";
import { test } from "node:test";
import { repoPath } from "@omagari/contract";

test("a Windows-style relative path goes to the server with /", () => {
  assert.equal(repoPath("src\\a.ts", "\\"), "src/a.ts");
  assert.equal(repoPath("packages\\cli\\src\\main.ts", "\\"), "packages/cli/src/main.ts");
  assert.equal(repoPath("src/a.ts", "/"), "src/a.ts");
  assert.equal(repoPath("src/a.ts"), "src/a.ts");
});
