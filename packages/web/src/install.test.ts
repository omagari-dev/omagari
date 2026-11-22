import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTALL_COMMAND } from "./install.ts";

// Until the first release, the app must show @next (#441). The release PR changes this and the README together.
test("the app shows the @next install command until the first release", () => {
  assert.equal(INSTALL_COMMAND, "npm i -g omagari@next");
});
