import { cookies } from "next/headers";
import { createSession, getSessionUser as getPersistedSessionUser, revokeSession } from "@/lib/auth-repository";
import { createSessionToken, hashSessionToken } from "@/lib/session-token";
import type { PlatformUser } from "@/lib/platform-types";

const SESSION_COOKIE = "comunica_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function startSession(user: PlatformUser) {
  const token = createSessionToken();
  await createSession(user.id, hashSessionToken(token), new Date(Date.now() + SESSION_TTL_SECONDS * 1000));
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return undefined;
  return getPersistedSessionUser(hashSessionToken(token));
}

export async function endSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(hashSessionToken(token));
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
