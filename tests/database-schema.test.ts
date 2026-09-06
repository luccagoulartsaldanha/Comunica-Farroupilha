import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const migrationPath = "db/migrations/0001_initial.sql";

test("production schema defines every durable platform entity", () => {
  assert.equal(existsSync(migrationPath), true, "initial database migration must exist");
  const source = readFileSync(migrationPath, "utf8");

  for (const table of [
    "schema_migrations",
    "users",
    "sessions",
    "proposals",
    "proposal_supports",
    "proposal_saves",
    "comments",
    "comment_likes",
    "activities",
    "activity_feedbacks",
    "notifications",
    "chapa_questions",
    "legacy_imports",
  ]) {
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"), `${table} must be durable`);
  }
});

test("interaction and feedback relations are unique per user", () => {
  assert.equal(existsSync(migrationPath), true, "initial database migration must exist");
  const source = readFileSync(migrationPath, "utf8");

  assert.match(source, /proposal_supports[\s\S]*PRIMARY KEY\s*\(proposal_id, user_id\)/i);
  assert.match(source, /proposal_saves[\s\S]*PRIMARY KEY\s*\(proposal_id, user_id\)/i);
  assert.match(source, /comment_likes[\s\S]*PRIMARY KEY\s*\(comment_id, user_id\)/i);
  assert.match(source, /activity_feedbacks[\s\S]*UNIQUE\s*\(activity_id, user_id\)/i);
});

test("credentials use hashes rather than plaintext password storage", () => {
  assert.equal(existsSync(migrationPath), true, "initial database migration must exist");
  const source = readFileSync(migrationPath, "utf8");

  assert.match(source, /password_hash\s+TEXT\s+NOT NULL/i);
  assert.match(source, /token_hash\s+TEXT\s+(?:PRIMARY KEY|NOT NULL)/i);
  assert.doesNotMatch(source, /\bpassword\s+TEXT\b/i);
});
