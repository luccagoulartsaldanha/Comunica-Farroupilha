import path from "node:path";
import { upsertAccount } from "../src/lib/auth-repository.ts";
import { closeDatabasePool } from "../src/lib/db.ts";
import { hashPassword } from "../src/lib/password.ts";

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"));
} catch {}

const name = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;
const turma = process.env.ADMIN_CLASS?.trim() || "GEF";

if (!name || !password) throw new Error("ADMIN_USERNAME e ADMIN_PASSWORD são obrigatórias.");

try {
  const user = await upsertAccount({ name, turma, role: "gef", passwordHash: await hashPassword(password) });
  console.log(`Conta GEF preparada: ${user.name}`);
} finally {
  await closeDatabasePool();
}
