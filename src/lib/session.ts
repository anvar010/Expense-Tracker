import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Role, Session } from "./types";

const COOKIE = "et_session";
const key = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
};

export async function createSession(user: Session) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    // Sessions issued before roles existed have no role and are treated as regular users.
    const role: Role = payload.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
    return { id: String(payload.id), name: String(payload.name), email: String(payload.email), role };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** For admin-only routes: the cookie is not trusted for the role, so it is re-checked against the database. */
export async function requireSuperAdmin(): Promise<Session | null> {
  const s = await getSession();
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: s.id }, select: { role: true, active: true } });
  return u?.active && u.role === "SUPER_ADMIN" ? s : null;
}
