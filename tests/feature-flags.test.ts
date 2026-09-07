import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("election features are disabled until an election is configured", async () => {
  const { ELECTIONS_ENABLED } = await import("../src/lib/feature-flags.ts");
  assert.equal(ELECTIONS_ENABLED, false);
  const routeSource = readFileSync("src/app/api/chapas/route.ts", "utf8");
  const questionsSource = readFileSync("src/app/api/chapas/questions/route.ts", "utf8");
  assert.match(routeSource, /ELECTIONS_ENABLED/);
  assert.match(questionsSource, /ELECTIONS_ENABLED/);
  assert.match(routeSource, /errorResponse\([\s\S]*, 410\)/);
  assert.match(questionsSource, /errorResponse\([\s\S]*, 410\)/);
});
