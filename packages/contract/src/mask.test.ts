// Masking for error reports (ADR-0063): every sender masks with it, and the server masks again before storing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type ErrorReport, maskReport, maskText, reportKey } from "./index.ts";

const pat = `ghp_${"a1B2".repeat(9)}`;
const fine = `github_pat_11ABCDEFG0_${"x9".repeat(20)}`;
const jwt =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

test("masking table: tokens, URLs, emails and home folders become marks", () => {
  const cases: [string, string][] = [
    [`git push failed: ${pat}`, "git push failed: <redacted>"],
    [`token ${fine} is bad`, "token <redacted> is bad"],
    [`ghs_${"Z".repeat(36)} expired`, "<redacted> expired"],
    ["Authorization: Bearer abc.def-123", "Authorization: Bearer <redacted>"],
    [`session ${jwt} ended`, "session <redacted> ended"],
    ["token=s3cr3t&x=1", "token=<redacted>&x=1"],
    ["password: hunter2", "password: <redacted>"],
    ["api_key=AKIA123 next", "api_key=<redacted> next"],
    [
      "GET https://app.omagari.org/api/login?code=123&state=abc failed",
      "GET https://app.omagari.org/api/login?<redacted> failed",
    ],
    ["mail minjun.kim+dev@example.co.kr please", "mail <redacted> please"],
    ["EPERM: open '/Users/minjun/.omagari/state.json'", "EPERM: open '<home>/.omagari/state.json'"],
    ["ENOENT /home/jisu/work", "ENOENT <home>/work"],
    [
      "EPERM: open 'C:\\Users\\Minjun\\.omagari\\state.json'",
      "EPERM: open '<home>\\.omagari\\state.json'",
    ],
    ['{"path":"C:\\\\Users\\\\Minjun\\\\x"}', '{"path":"<home>\\\\x"}'],
    ["c:/Users/minjun/x", "<home>/x"],
    // Things that only look close stay.
    ["npm i -g omagari@0.4.1 failed", "npm i -g omagari@0.4.1 failed"],
    ["Unexpected token } in JSON", "Unexpected token } in JSON"],
    ["at main (packages/runner/src/index.ts:42:7)", "at main (packages/runner/src/index.ts:42:7)"],
  ];
  for (const [input, want] of cases) assert.equal(maskText(input), want, input);
});

test("the sender's own repo and home folders become <repo> and <home>, on either OS", () => {
  assert.equal(
    maskText("at x (/srv/me/code/omagari/packages/a.ts:1:2) in /srv/me", {
      home: "/srv/me",
      repo: "/srv/me/code/omagari",
    }),
    "at x (<repo>/packages/a.ts:1:2) in <home>",
  );
  assert.equal(
    maskText("open D:\\Work\\Site\\a.ts and d:/work/site/b.ts", { repo: "D:\\Work\\Site\\" }),
    "open <repo>\\a.ts and <repo>/b.ts",
  );
});

const report = (message: string, stack: string[]): ErrorReport => ({
  piece: "runner",
  kind: "error",
  version: "0.4.1",
  os: "win32",
  arch: "x64",
  runtime: "Node 24.3.0",
  where: "background runner",
  name: "Error",
  message,
  stack,
  count: 1,
});

test("a report is masked and cut, and the same error on two machines has one key", () => {
  const long = report(
    `x${"y".repeat(5000)}`,
    Array.from({ length: 40 }, (_, i) => `at f${i}`),
  );
  const masked = maskReport(long);
  assert.equal(masked.message.length, 1000);
  assert.equal(masked.stack.length, 20);

  const a = maskReport(
    report("EPERM: open 'C:\\Users\\minjun\\state.json' after 3 tries", [
      "at open (node:fs:573:3)",
      "at writeState (C:\\Users\\minjun\\omagari\\packages\\runner\\src\\state.ts:42:9)",
    ]),
  );
  const b = maskReport(
    report("EPERM: open '/Users/jisu/state.json' after 12 tries", [
      "at open (node:fs:580:1)",
      "at writeState (/Users/jisu/omagari/packages/runner/src/state.ts:44:3)",
    ]),
  );
  assert.equal(reportKey(a), reportKey(b));
  assert.notEqual(reportKey(a), reportKey({ ...a, name: "TypeError" }));
  assert.notEqual(reportKey(a), reportKey({ ...a, piece: "cli" }));
});
