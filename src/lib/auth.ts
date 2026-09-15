import "server-only";
import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  deleteExpiredSessions,
  deleteSession,
  findSessionWithUser,
  insertSession,
} from "./auth-db";

/**
 * Authentication.
 *
 * Passwords are hashed with scrypt from Node's own crypto — a real memory-hard
 * KDF, and no native dependency to build in the Docker image. Sessions live in
 * the database so that signing out actually ends the session rather than only
 * dropping a cookie, and so an admin disabling an account takes effect on the
 * next request instead of whenever the token happens to expire.
 *
 * The cookie is `<sessionId>.<hmac>`. The HMAC lets middleware reject a forged
 * or tampered cookie on the edge without a database round trip; the id is still
 * looked up server-side before anything is trusted. The HMAC is not the
 * security boundary — the session row is — it just keeps junk off the database.
 */

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "sonar_session";
const SESSION_DAYS = 14;
const SCRYPT_LEN = 64;

export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Generate one with `openssl rand -hex 32` and put it in the environment — sessions are signed with it, and a weak one is the same as no login at all.",
    );
  }
  return s;
}

// ---- Passwords ---------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, SCRYPT_LEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Refuses the passwords that make a login theatre rather than a control. */
export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "At least 12 characters. Length beats cleverness.";
  if (/^\d+$/.test(password)) return "All digits is a PIN, not a password.";
  const weak = ["password", "passw0rd", "letmein", "welcome", "drydock", "reddit", "12345678", "qwerty"];
  if (weak.some((w) => password.toLowerCase().includes(w))) return "That contains a word every cracking list already has.";
  return null;
}

// ---- Cookie signing ----------------------------------------------------------

export function signSessionId(id: string): string {
  const mac = createHmac("sha256", authSecret()).update(id).digest("base64url");
  return `${id}.${mac}`;
}

/** Node-side verification. Middleware has its own Web Crypto version. */
export function readSignedCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = createHmac("sha256", authSecret()).update(id).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

// ---- Sessions ----------------------------------------------------------------

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  insertSession({ id, userId, expiresAt, userAgent: meta.userAgent ?? "", ip: meta.ip ?? "" });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signSessionId(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  // Opportunistic tidy-up; sessions are small but they should not accumulate.
  deleteExpiredSessions();
  return id;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChange: boolean;
}

/** The current user, or null. Never throws — callers decide what to do. */
export async function getSessionUser(): Promise<SessionUser | null> {
  let id: string | null = null;
  try {
    const jar = await cookies();
    id = readSignedCookie(jar.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
  if (!id) return null;
  const row = findSessionWithUser(id);
  if (!row || new Date(row.expiresAt) < new Date()) return null;
  if (row.disabled) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    mustChange: Boolean(row.mustChange),
  };
}

/** For pages and server actions: a user, or you are sent to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = readSignedCookie(jar.get(SESSION_COOKIE)?.value);
  if (id) deleteSession(id);
  jar.delete(SESSION_COOKIE);
}

// ---- Throttling --------------------------------------------------------------

/**
 * In-process, per-email backoff. This is a single-container deployment, so a
 * map is honest: it survives as long as the process does and resets on deploy.
 * It is there to make online guessing slow, not to be a security boundary —
 * that is scrypt plus a 12-character minimum.
 */
const attempts = new Map<string, { n: number; until: number }>();

export function loginBlockedFor(email: string): number {
  const rec = attempts.get(email.toLowerCase());
  if (!rec) return 0;
  return Math.max(0, rec.until - Date.now());
}

export function noteFailedLogin(email: string): void {
  const key = email.toLowerCase();
  const rec = attempts.get(key) ?? { n: 0, until: 0 };
  rec.n++;
  // Nothing for the first few, then doubling waits up to five minutes.
  if (rec.n > 3) rec.until = Date.now() + Math.min(300_000, 2 ** (rec.n - 3) * 1000);
  attempts.set(key, rec);
}

export function clearFailedLogins(email: string): void {
  attempts.delete(email.toLowerCase());
}
