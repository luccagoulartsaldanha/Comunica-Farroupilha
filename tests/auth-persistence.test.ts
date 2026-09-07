import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "@neondatabase/serverless";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {}

test("passwords are stored as versioned scrypt hashes and verified safely", async () => {
  assert.equal(existsSync("src/lib/password.ts"), true, "password module must exist");
  const { hashPassword, verifyPassword } = await import("../src/lib/password.ts");
  const password = `Segura-${randomBytes(12).toString("base64url")}`;
  const encoded = await hashPassword(password);

  assert.match(encoded, /^scrypt\$v1\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword(`${password}-errada`, encoded), false);
  assert.equal(await verifyPassword(password, "hash-invalido"), false);
});

test("database sessions expire and can be revoked without storing raw tokens", async () => {
  assert.equal(existsSync("src/lib/auth-repository.ts"), true, "auth repository must exist");
  assert.equal(existsSync("src/lib/session-token.ts"), true, "session token helpers must exist");
  const auth = await import("../src/lib/auth-repository.ts");
  const { hashSessionToken } = await import("../src/lib/session-token.ts");
  const { hashPassword } = await import("../src/lib/password.ts");

  const username = `auth-${randomBytes(8).toString("hex")}`;
  const account = await auth.createAccount({
    name: username,
    turma: "3º EM A",
    role: "student",
    passwordHash: await hashPassword("senha-segura-123"),
  });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    assert.equal("passwordHash" in account, false, "public account DTO must not expose hashes");
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(rawToken);
    assert.notEqual(tokenHash, rawToken);

    await auth.createSession(account.id, tokenHash, new Date(Date.now() + 60_000));
    assert.equal((await auth.getSessionUser(tokenHash))?.id, account.id);
    const stored = await pool.query("SELECT token_hash FROM sessions WHERE user_id = $1", [account.id]);
    assert.equal(stored.rows[0]?.token_hash, tokenHash);
    assert.equal(stored.rows[0]?.token_hash.includes(rawToken), false);

    await auth.revokeSession(tokenHash);
    assert.equal(await auth.getSessionUser(tokenHash), undefined);

    await auth.createSession(account.id, tokenHash, new Date(Date.now() - 1_000));
    assert.equal(await auth.getSessionUser(tokenHash), undefined);
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [account.id]);
    await pool.end();
  }
});
