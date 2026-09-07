import { findAccountCredentials } from "@/lib/auth-repository";
import { verifyPassword } from "@/lib/password";
import { startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { name?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Envie um JSON válido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !password || name.length > 160 || password.length > 256) {
    return Response.json({ error: "Nome de usuário ou senha incorretos." }, { status: 401 });
  }

  const credentials = await findAccountCredentials(name);
  if (!credentials || !(await verifyPassword(password, credentials.passwordHash))) {
    return Response.json({ error: "Nome de usuário ou senha incorretos." }, { status: 401 });
  }
  await startSession(credentials.user);
  return Response.json({ user: credentials.user });
}
