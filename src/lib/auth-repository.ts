import "server-only";

import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "@neondatabase/serverless";
import { query } from "./db.ts";
import type { PlatformUser, UserRole } from "./platform-types.ts";

type UserRow = QueryResultRow & {
  id: string;
  username: string;
  class_name: string;
  role: UserRole;
  password_hash: string;
};

function mapUser(row: UserRow): PlatformUser {
  return { id: row.id, name: row.username, turma: row.class_name, role: row.role };
}

export function normalizeUsername(name: string) {
  return name.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
}

export async function createAccount(input: { name: string; turma: string; role: UserRole; passwordHash: string }) {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, username, username_normalized, class_name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username, class_name, role, password_hash`,
    [randomUUID(), input.name.trim(), normalizeUsername(input.name), input.turma.trim(), input.role, input.passwordHash],
  );
  return mapUser(rows[0]);
}

export async function upsertAccount(input: { name: string; turma: string; role: UserRole; passwordHash: string }) {
  const rows = await query<UserRow>(
    `INSERT INTO users (id, username, username_normalized, class_name, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (username_normalized) DO UPDATE SET
       username = EXCLUDED.username, class_name = EXCLUDED.class_name, role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash, updated_at = now()
     RETURNING id, username, class_name, role, password_hash`,
    [randomUUID(), input.name.trim(), normalizeUsername(input.name), input.turma.trim(), input.role, input.passwordHash],
  );
  return mapUser(rows[0]);
}

export async function findAccountCredentials(name: string) {
  const rows = await query<UserRow>(
    "SELECT id, username, class_name, role, password_hash FROM users WHERE username_normalized = $1",
    [normalizeUsername(name)],
  );
  if (!rows[0]) return undefined;
  return { user: mapUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function getUserById(id: string) {
  const rows = await query<UserRow>("SELECT id, username, class_name, role, password_hash FROM users WHERE id = $1", [id]);
  return rows[0] ? mapUser(rows[0]) : undefined;
}

export async function createSession(userId: string, tokenHash: string, expiresAt: Date) {
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [tokenHash, userId, expiresAt]);
}

export async function getSessionUser(tokenHash: string) {
  const rows = await query<UserRow>(
    `SELECT u.id, u.username, u.class_name, u.role, u.password_hash
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  if (rows[0]) return mapUser(rows[0]);
  await query("DELETE FROM sessions WHERE token_hash = $1 AND expires_at <= now()", [tokenHash]);
  return undefined;
}

export async function revokeSession(tokenHash: string) {
  await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}
