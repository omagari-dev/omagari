// The static demo's recording (`packages/web/demo/fixtures.json`, ADR-0058) still fits the contract.
// If this fails, the contract changed under it: record it again with `npm run demo:fixtures`.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { api, ContractError } from "@omagari/contract";
import { z } from "zod";

const fixtures = JSON.parse(
  await readFile(new URL("../packages/web/demo/fixtures.json", import.meta.url), "utf8"),
);
const failed = z.strictObject({ error: ContractError });

test("every recorded answer still fits the contract", () => {
  const routes = new Map(
    Object.values(api)
      .filter((route) => route.method === "GET")
      .map((route) => [route.path, route]),
  );
  for (const [key, answer] of Object.entries(fixtures.get)) {
    const route = routes.get(key.split(" ")[0] as string);
    assert.ok(route, `${key}: no such route`);
    const parsed = (failed.safeParse(answer).success ? failed : route.response).safeParse(answer);
    assert.ok(parsed.success, `${key}: ${parsed.error}`);
  }
  for (const [channel, messages] of Object.entries(fixtures.history))
    assert.ok(api.history.response.safeParse({ messages }).success, channel);
  for (const answer of Object.values(fixtures.threads))
    (failed.safeParse(answer).success ? failed : api.history.response).parse(answer);
  for (const answer of Object.values(fixtures.dms))
    (failed.safeParse(answer).success ? failed : api.dms.response).parse(answer);
});
