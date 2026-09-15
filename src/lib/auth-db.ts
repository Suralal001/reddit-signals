import "server-only";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Data access for the two tables authentication owns.
 *
 * These go through better-sqlite3 directly rather than Prisma, for one reason
 * worth stating: the same rows are written by scripts that run before the app
 * exists — the container entrypoint creating the first admin, and the CLI that
 * resets a password inside a running container. Those cannot import the Next
 * app, so they already speak SQL. Having the app speak the same SQL for the
 * same two tables means there is one definition of what a user row is, instead
 * of a Prisma model and a shell script that have to be kept in agreement.
 *
 * Everything else in the app stays on Prisma. This is a deliberate exception,
 * not a direction of travel.
 */

function open() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = path.resolve(/* turbopackIgnore: true */ process.cwd(), raw.replace(/^file:/, ""));
  const conn = new Database(file);
  // Two connections to one file — Prisma's and this one. WAL lets them read
  // concurrently, and the busy timeout makes a write wait its turn instead of
  // failing outright.
  conn.pragma("journal_mode = WAL");
  conn.pragma("busy_timeout = 5000");
  conn.pragma("foreign_keys = ON");
  return conn;
}

const globalForAuthDb = globalThis as unknown as { authDb?: Database.Database };

/**
 * Opened on first use, not at import. Next evaluates every server module while
 * collecting page data during `next build`, and a build that has to be able to
 * open a database is a build that cannot run in a container before the volume
 * is mounted.
 */
function conn(): Database.Database {
  return (globalForAuthDb.authDb ??= open());
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  disabled: number;
  mustChange: number;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserListRow extends Omit<UserRow, "passwordHash"> {
  sessions: number;
}

const iso = () => new Date().toISOString();

export function countUsers(): number {
  return (conn().prepare('SELECT COUNT(*) AS n FROM "User"').get() as { n: number }).n;
}

export function countActiveAdmins(): number {
  return (
    conn().prepare('SELECT COUNT(*) AS n FROM "User" WHERE role = ? AND disabled = 0').get("ADMIN") as { n: number }
  ).n;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return conn().prepare('SELECT * FROM "User" WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return conn().prepare('SELECT * FROM "User" WHERE id = ?').get(id) as UserRow | undefined;
}

export function listUserRows(): UserListRow[] {
  return conn()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.disabled, u.mustChange, u.lastLoginAt, u.createdAt,
              (SELECT COUNT(*) FROM "Session" s WHERE s.userId = u.id AND s.expiresAt > ?) AS sessions
         FROM "User" u
        ORDER BY u.disabled ASC, u.createdAt ASC`,
    )
    .all(iso()) as UserListRow[];
}

export function insertUser(u: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  mustChange: boolean;
}): void {
  conn()
    .prepare(
      'INSERT INTO "User" (id, email, name, passwordHash, role, disabled, mustChange, createdAt) VALUES (?,?,?,?,?,0,?,?)',
    )
    .run(u.id, u.email.toLowerCase(), u.name, u.passwordHash, u.role, u.mustChange ? 1 : 0, iso());
}

export function setUserPassword(id: string, passwordHash: string, mustChange: boolean): void {
  conn()
    .prepare('UPDATE "User" SET passwordHash = ?, mustChange = ? WHERE id = ?')
    .run(passwordHash, mustChange ? 1 : 0, id);
}

export function setUserDisabledRow(id: string, disabled: boolean): void {
  conn().prepare('UPDATE "User" SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id);
}

export function setUserRoleRow(id: string, role: string): void {
  conn().prepare('UPDATE "User" SET role = ? WHERE id = ?').run(role, id);
}

export function touchLastLogin(id: string): void {
  conn().prepare('UPDATE "User" SET lastLoginAt = ? WHERE id = ?').run(iso(), id);
}

// ---- Sessions ----------------------------------------------------------------

export function insertSession(s: {
  id: string;
  userId: string;
  expiresAt: Date;
  userAgent: string;
  ip: string;
}): void {
  conn()
    .prepare('INSERT INTO "Session" (id, userId, expiresAt, createdAt, userAgent, ip) VALUES (?,?,?,?,?,?)')
    .run(s.id, s.userId, s.expiresAt.toISOString(), iso(), s.userAgent.slice(0, 300), s.ip);
}

export interface SessionWithUser {
  sessionId: string;
  expiresAt: string;
  id: string;
  email: string;
  name: string;
  role: string;
  disabled: number;
  mustChange: number;
}

export function findSessionWithUser(sessionId: string): SessionWithUser | undefined {
  return conn()
    .prepare(
      `SELECT s.id AS sessionId, s.expiresAt,
              u.id, u.email, u.name, u.role, u.disabled, u.mustChange
         FROM "Session" s JOIN "User" u ON u.id = s.userId
        WHERE s.id = ?`,
    )
    .get(sessionId) as SessionWithUser | undefined;
}

export function deleteSession(id: string): void {
  conn().prepare('DELETE FROM "Session" WHERE id = ?').run(id);
}

export function deleteSessionsForUser(userId: string): void {
  conn().prepare('DELETE FROM "Session" WHERE userId = ?').run(userId);
}

export function deleteExpiredSessions(): void {
  conn().prepare('DELETE FROM "Session" WHERE expiresAt < ?').run(iso());
}
