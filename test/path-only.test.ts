import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execShim, onPath } from "@omagari/contract/shim";

// Windows looks in the current folder before PATH; these run on the `windows` CI job (ADR-0060).
const windows = process.platform === "win32" ? {} : { skip: "Windows only" };

async function folders() {
  const root = await mkdtemp(join(tmpdir(), "omagari-path-"));
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  await mkdir(bin);
  await mkdir(repo);
  const env = { ...process.env, PATH: `.;${bin};${process.env.PATH}` };
  return { root, bin, repo, env };
}

test("a program is found on PATH, not in the current folder", windows, async () => {
  const { root, bin, repo, env } = await folders();
  try {
    await writeFile(join(bin, "tool.cmd"), "@echo path\r\n");
    await writeFile(join(repo, "tool.cmd"), "@echo repo\r\n");
    assert.equal(onPath("tool", env), join(bin, "tool.cmd"));
    const run = await execShim("tool", [], { cwd: repo, env });
    assert.equal(run.stdout.trim(), "path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a program that is only in the current folder isn't started", windows, async () => {
  const { root, repo, env } = await folders();
  try {
    await writeFile(join(repo, "only-here.cmd"), "@echo repo\r\n");
    await assert.rejects(execShim("only-here", [], { cwd: repo, env }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "arguments reach a .cmd shim as they were, whatever characters they hold",
  windows,
  async () => {
    const { root, bin, repo, env } = await folders();
    try {
      const script = join(root, "argv.js");
      await writeFile(script, "console.log(JSON.stringify(process.argv.slice(2)));\n");
      await writeFile(join(bin, "argv.cmd"), `@"${process.execPath}" "${script}" %*\r\n`);
      const mark = join(repo, "marker.txt");
      const args = [
        "plain",
        "two words",
        'say "hi"',
        "a&b",
        `x & echo hi> "${mark}" & y`,
        "50%",
        "%PATH%",
        "(a|b)<c>",
        "bang!",
        "back\\",
      ];
      const run = await execShim("argv", args, { cwd: repo, env });
      assert.deepEqual(JSON.parse(run.stdout), args);
      await assert.rejects(readFile(mark), { code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
