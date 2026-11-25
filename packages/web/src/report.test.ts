import assert from "node:assert/strict";
import { test } from "node:test";
import { browserInfo, STUCK_MS, watchStuck } from "./report.ts";

test("the stuck clock fires once at 1 minute and stops when the wait ends", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let late = 0;
  watchStuck("sign-in / entering the app", () => late++);
  t.mock.timers.tick(STUCK_MS - 1);
  assert.equal(late, 0);
  t.mock.timers.tick(1);
  assert.equal(late, 1);
  t.mock.timers.tick(STUCK_MS * 3);
  assert.equal(late, 1);

  const stop = watchStuck("loading / checking who you are", () => late++);
  stop();
  t.mock.timers.tick(STUCK_MS);
  assert.equal(late, 1);
});

test("the browser comes from the user agent", () => {
  assert.deepEqual(
    browserInfo(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
    ),
    { os: "Windows", runtime: "Edge 142" },
  );
  assert.deepEqual(
    browserInfo(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15",
    ),
    { os: "macOS", runtime: "Safari 19" },
  );
});
