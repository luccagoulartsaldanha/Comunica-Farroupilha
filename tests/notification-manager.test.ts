import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

test("notification manager collapses repeated legacy messages and keeps unread state", async () => {
  assert.equal(existsSync("src/lib/notification-manager.ts"), true, "notification manager must exist");
  const { collapseNotifications } = await import("../src/lib/notification-manager.ts");
  const result = collapseNotifications([
    { id: "n-3", title: "Nova proposta recebida", body: "Uma pessoa estudante publicou uma ideia para o recreio.", created_at: "2026-09-07T17:00:00.000Z", read: true, occurrence_count: 1, dedupe_key: null },
    { id: "n-2", title: "Nova proposta recebida", body: "Uma pessoa estudante publicou uma ideia para o recreio.", created_at: "2026-09-07T16:50:00.000Z", read: false, occurrence_count: 2, dedupe_key: null },
    { id: "n-1", title: "Resposta oficial do GEF", body: "Outro evento", created_at: "2026-09-07T16:40:00.000Z", read: true, occurrence_count: 1, dedupe_key: "response:1" },
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].occurrences, 3);
  assert.equal(result[0].read, false);
  assert.equal(result[0].createdAt, "2026-09-07T17:00:00.000Z");
});

test("notification manager gives each durable event a stable dedupe key", async () => {
  const { notificationKey } = await import("../src/lib/notification-manager.ts");
  assert.equal(notificationKey("proposal", "proposal-1", "created"), "proposal:proposal-1:created");
  assert.notEqual(notificationKey("comment", "comment-1", "created"), notificationKey("comment", "comment-2", "created"));
});
