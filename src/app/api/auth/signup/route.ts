import { createAccount, findAccountCredentials } from "@/lib/auth-repository";
import { hashPassword, verifyPassword } from "@/lib/password";
import { startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { name?: unknown; turma?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Envie um JSON válido." }, { status: 400 });
  }
  if (typeof body.name !== "string" || typeof body.turma !== "string" || typeof body.password !== "string") {
    return Response.json({ error: "Nome, turma e senha são obrigatórios." }, { status: 400 });
  }
  const name = body.name.trim();
  const turma = body.turma.trim();
  if (name.length < 3 || name.length > 160 || turma.length < 1 || turma.length > 160 || body.password.length < 8 || body.password.length > 256) {
    return Response.json({ error: "Confira o nome, a turma e use uma senha de pelo menos 8 caracteres." }, { status: 400 });
  }

  const existing = await findAccountCredentials(name);
  if (existing) {
    if (!(await verifyPassword(body.password, existing.passwordHash))) {
      return Response.json({ error: "Esse nome de usuário já está em uso." }, { status: 409 });
    }
    await startSession(existing.user);
    return Response.json({ user: existing.user });
  }

  try {
    const account = await createAccount({ name, turma, role: "student", passwordHash: await hashPassword(body.password) });
    await startSession(account);
    return Response.json({ user: account }, { status: 201 });
  } catch (error) {
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    return Response.json({ error: duplicate ? "Esse nome de usuário já está em uso." : "Não foi possível criar a conta." }, { status: duplicate ? 409 : 503 });
  }
}
