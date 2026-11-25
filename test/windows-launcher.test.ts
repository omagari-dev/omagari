import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { launcher } from "../packages/cli/src/service.ts";

// The task runs `cmd.exe /d /s /c "<launcher>"`; a home folder with non-ASCII letters must not break it (#543).
for (const [name, folder] of [
  ["Korean letters", "홍길동"],
  ["Latin letters", "üser"],
  ["letters and a space", "홍길동 üser"],
]) {
  test(`the Windows launcher reaches its log with ${name} in its paths`, {
    skip: process.platform !== "win32",
  }, async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "omagari-")), folder, ".config", "omagari");
    await mkdir(dir, { recursive: true });
    const script = join(dir, "hello.js");
    await writeFile(script, `console.log("hello " + process.env.OMAGARI_PROBE);`);
    const log = join(dir, "background.log");
    const file = join(dir, "runner-launcher.cmd");
    await writeFile(
      file,
      launcher({ args: [process.execPath, script], env: { OMAGARI_PROBE: "ok-한글" }, log }),
    );
    const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `"${file}"`], {
      windowsVerbatimArguments: true,
      encoding: "utf8",
    });
    const text = await readFile(log, "utf8").catch(
      () => `(no log) status=${result.status} stderr=${result.stderr}`,
    );
    assert.match(text, /hello ok-한글/);
  });
}
