import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { eventually, place } from "./harness.ts";

const CLI = fileURLToPath(new URL("../packages/cli/src/main.ts", import.meta.url));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// The harness starts every runner with OMAGARI_TEST_PARENT_PID (ADR-0049 runner exits when it is gone). Here a stand-in test process is killed with SIGKILL.
test("a background runner a test started exits when the test process is killed, with no t.after", async (t) => {
  const home = (await place(t))("home");
  // The stand-in test process: starts the runner the way the harness does, prints its pid, then waits.
  const script = `
    const { spawn } = require("node:child_process");
    const child = spawn(process.execPath, [${JSON.stringify(CLI)}, "runner", "background"], {
      stdio: "ignore",
      env: { ...process.env, OMAGARI_TEST_PARENT_PID: String(process.pid) },
    });
    console.log("pid " + child.pid);
    setInterval(() => {}, 1000);`;
  const parent = spawn(process.execPath, ["-e", script], {
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "c") },
  });
  let out = "";
  parent.stdout.setEncoding("utf8").on("data", (c) => (out += c));
  const pid = Number(await eventually(() => /pid (\d+)/.exec(out)?.[1] ?? assert.fail("no pid")));
  t.after(() => {
    if (alive(pid)) process.kill(pid, "SIGKILL"); // only if the test fails
  });
  assert.ok(alive(pid));
  parent.kill("SIGKILL");
  await eventually(() => assert.equal(alive(pid), false), 10_000);
});
