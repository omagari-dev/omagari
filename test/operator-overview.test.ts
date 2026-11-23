// The operator Overview (#445): numbers counted from what the server already stores, and only operators can read them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { api, type ContractFailure, call } from "@omagari/contract";
import { REPO3, startWorld, winSkip } from "./harness.ts";

test(
  "the overview counts a seeded world, and only operators can read it",
  winSkip(463),
  async (t) => {
    const world = await startWorld({ operators: ["Owner"] });
    t.after(world.stop);
    const team = REPO3.split("/")[0] as string;
    world.github.admin("carol", REPO3);
    world.github.grant("carol", REPO3);
    world.github.admin("dave", REPO3);

    const carol = await world.login("carol");
    const dave = await world.login("dave");
    await assert.rejects(
      call(carol, api.operatorOverview),
      (error: ContractFailure) => error.code === "forbidden",
    );

    const before = await call(world.owner, api.operatorOverview);
    const base = before.steps.signedIn.total;
    // carol and dave both ask; carol is approved, dave denied.
    const asked = await call(carol, api.requestAccess, { account: team, agree: true });
    const other = await call(dave, api.requestAccess, { account: team, agree: true });
    const approve = asked.requests[0]?.id as number;
    const deny = other.requests[0]?.id as number;
    let seen = await call(world.owner, api.operatorOverview);
    assert.equal(seen.requests.pending - before.requests.pending, 2);
    await call(world.owner, api.decideAccess, { id: approve, approve: true });
    await call(world.owner, api.decideAccess, { id: deny, approve: false });
    await call(carol, api.addRepo, { repo: REPO3 });

    seen = await call(world.owner, api.operatorOverview);
    assert.equal(seen.requests.approved - before.requests.approved, 1);
    assert.equal(seen.requests.denied - before.requests.denied, 1);
    assert.equal(seen.requests.pending, before.requests.pending);
    assert.equal(seen.requests.last7 - before.requests.last7, 2);
    assert.equal(seen.steps.signedIn.total, base + 1);
    assert.equal(seen.workspaces.total, before.workspaces.total + 1);
    assert.equal(seen.workspaces.last7, before.workspaces.last7 + 1);
    assert.equal(seen.repos.total, before.repos.total + 1);
    assert.equal(seen.steps.runner.last7, null);
    // carol shares her repo: one more person at that step.
    await call({ ...carol, repos: [REPO3] }, api.share, { on: true });
    const shared = await call(world.owner, api.operatorOverview);
    assert.equal(shared.steps.shared.total, seen.steps.shared.total + 1);
  },
);
