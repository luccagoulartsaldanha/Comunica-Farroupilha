import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const domainRoutes = [
  "src/app/api/platform/route.ts",
  "src/app/api/proposals/route.ts",
  "src/app/api/proposals/[id]/route.ts",
  "src/app/api/proposals/[id]/comments/route.ts",
  "src/app/api/proposals/[id]/support/route.ts",
  "src/app/api/proposals/[id]/save/route.ts",
  "src/app/api/comments/[id]/like/route.ts",
  "src/app/api/activities/route.ts",
  "src/app/api/activities/[id]/route.ts",
  "src/app/api/activities/[id]/feedback/route.ts",
  "src/app/api/notifications/route.ts",
  "src/app/api/chapas/route.ts",
  "src/app/api/chapas/questions/route.ts",
];

test("domain routes use the durable repository instead of the ephemeral store", () => {
  for (const file of domainRoutes) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /platform-store/, `${file} must not import the ephemeral store`);
    assert.match(source, file.endsWith("api/chapas/route.ts") ? /platform-types/ : /platform-repository/, `${file} must import the durable data source`);
  }
});

test("support, save, and comment-like routes require explicit boolean intent", () => {
  const cases = [
    ["src/app/api/proposals/[id]/support/route.ts", "supported", "setSupport"],
    ["src/app/api/proposals/[id]/save/route.ts", "saved", "setSaved"],
    ["src/app/api/comments/[id]/like/route.ts", "liked", "setCommentLike"],
  ] as const;

  for (const [file, field, operation] of cases) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`typeof body\\.${field} !== ["']boolean["']`));
    assert.match(source, new RegExp(`await ${operation}\\(id, user\\.id, body\\.${field}\\)`));
    assert.doesNotMatch(source, /toggleSupport|toggleSaved|toggleCommentLike/);
  }
});

test("platform and health routes expose dynamic database state without caching", () => {
  const platform = readFileSync("src/app/api/platform/route.ts", "utf8");
  const health = readFileSync("src/app/api/health/route.ts", "utf8");
  const http = readFileSync("src/lib/http.ts", "utf8");

  assert.match(platform, /await getPlatformSnapshot\(user\?\.id\)/);
  assert.match(health, /await checkDatabaseConnection\(\)/);
  assert.match(http, /["']Cache-Control["']\s*:\s*["']no-store, max-age=0/);
  assert.match(http, /Vary\s*:\s*["']Cookie/);
});
