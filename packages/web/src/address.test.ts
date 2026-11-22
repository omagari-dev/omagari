import assert from "node:assert/strict";
import { test } from "node:test";
import { format, parse, workspaceOf } from "./address.ts";

test("every app address in ADR-0057 reads as its place and formats back to the same path", () => {
  const rows = [
    ["/channels/acme", { workspace: "acme" }],
    ["/channels/acme/c1", { workspace: "acme", channel: "c1" }],
    ["/channels/acme/f1/12", { workspace: "acme", channel: "f1", post: 12 }],
    ["/channels/acme/f1/12/big", { workspace: "acme", channel: "f1", post: 12, big: true }],
    ["/channels/acme/other/7", { workspace: "acme", channel: "other", post: 7 }],
  ] as const;
  for (const [path, address] of rows) {
    assert.deepEqual(parse(path), address, path);
    assert.equal(format(address), path);
  }
  assert.equal(parse("/login"), "login");
  assert.deepEqual(parse("/"), {});
  // The workspace id is the lowercased account name; ids are encoded both ways.
  assert.deepEqual(parse("/channels/Acme/c1"), { workspace: "acme", channel: "c1" });
  assert.equal(format({ workspace: "acme", channel: "a b" }), "/channels/acme/a%20b");
  assert.deepEqual(parse("/channels/acme/a%20b"), { workspace: "acme", channel: "a b" });
});

test("old hash links read as the same place with no workspace, whatever the path", () => {
  assert.deepEqual(parse("/#c1"), { channel: "c1" });
  assert.deepEqual(parse("/#f1/12"), { channel: "f1", post: 12 });
  assert.deepEqual(parse("/#f1/12/big"), { channel: "f1", post: 12, big: true });
  assert.deepEqual(parse("/#other/7"), { channel: "other", post: 7 });
  assert.deepEqual(parse("/channels/acme/c2#c1"), { channel: "c1" });
  // An empty hash is no hash.
  assert.deepEqual(parse("/#"), {});
});

test("unknown addresses read as nothing", () => {
  for (const address of [
    "/nope",
    "/channels",
    "/channels/",
    "/channels/acme/",
    "/channels/acme/f1/abc",
    "/channels/acme/f1/0",
    "/channels/acme/f1/12/small",
    "/channels/acme/f1/12/big/more",
    "/channels/acme/%E0%A4%A",
    "/login/again",
    "/#/12",
    "/#f1/x",
  ]) {
    assert.equal(parse(address), undefined, address);
  }
});

test("an old link's workspace is the first that has its channel, else the first one", async () => {
  const lists: Record<string, { id: string }[]> = { a: [{ id: "x" }], b: [{ id: "y" }] };
  const read = async (workspace: string) => lists[workspace] ?? [];
  assert.equal(await workspaceOf("y", ["a", "b"], read), "b");
  assert.equal(await workspaceOf("x", ["b", "a"], read), "a");
  assert.equal(await workspaceOf("other", ["b", "a"], read), "b");
});
