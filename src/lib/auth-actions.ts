"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  clearFailedLogins,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  loginBlockedFor,
  noteFailedLogin,
  passwordProblem,
  requireAdmin,
  requireUser,
  verifyPassword,
} from "./auth";
import {
  countActiveAdmins,
  deleteSessionsForUser,
  findUserByEmail,
  findUserById,
  insertUser,
  listUserRows,
  setUserDisabledRow,
  setUserPassword,
  setUserRoleRow,
  touchLastLogin,
} from "./auth-db";

function newId(): string {
  return `c${Date.now().toString(36)}${randomBytes(12).toString("hex")}`;
}

/** Only ever redirect to a path on this site. */
function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function login(_prev: { error?: string } | null, formData: FormData): Promise<{ error?: string }> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = safeNext(String(formData.get("next") || ""));
  if (!email || !password) return { error: "Email and password, please." };

  const waitMs = loginBlockedFor(email);
  if (waitMs > 0) return { error: `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)} seconds.` };

  const user = findUserByEmail(email);
  const ok = user && !user.disabled ? await verifyPassword(password, user.passwordHash) : false;
  // One message, and roughly the same work, either way: a form that answers
  // "no such account" faster than "wrong password" is an account-enumeration
  // endpoint with a login page drawn on it.
  if (!user || user.disabled || !ok) {
    noteFailedLogin(email);
    return { error: "That email and password don't match an active account." };
  }

  clearFailedLogins(email);
  const h = await headers();
  await createSession(user.id, {
    userAgent: h.get("user-agent") ?? "",
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim(),
  });
  touchLastLogin(user.id);
  redirect(user.mustChange ? "/settings/password" : next);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changeOwnPassword(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireUser();
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");
  if (next !== confirm) return { error: "The two new passwords don't match." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const row = findUserById(me.id);
  if (!row) return { error: "That account no longer exists." };
  // Still required even for a forced reset: it is what stops a borrowed laptop
  // with a live session from becoming a permanent account takeover.
  if (!(await verifyPassword(current, row.passwordHash))) return { error: "Current password is wrong." };

  setUserPassword(me.id, await hashPassword(next), false);
  // Every other session on this account is now stale, on purpose.
  deleteSessionsForUser(me.id);
  await createSession(me.id);
  revalidatePath("/settings/password");
  return { ok: true };
}

// ---- Administration ----------------------------------------------------------

export async function listUsers() {
  await requireAdmin();
  return listUserRows().map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: Boolean(u.disabled),
    mustChange: Boolean(u.mustChange),
    lastLoginAt: u.lastLoginAt,
    sessions: u.sessions,
  }));
}

/**
 * The temporary password is returned once, here, rather than emailed: there is
 * no mail sender in this deployment, and a password sitting in an inbox forever
 * is worse than one handed over in person and forced to change on first use.
 */
export async function createUser(
  _prev: { error?: string; tempPassword?: string; email?: string } | null,
  formData: FormData,
): Promise<{ error?: string; tempPassword?: string; email?: string }> {
  await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "MEMBER") === "ADMIN" ? "ADMIN" : "MEMBER";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That isn't an email address." };
  if (findUserByEmail(email)) return { error: "Someone already has that email." };

  const temp = randomBytes(12).toString("base64url");
  insertUser({ id: newId(), email, name, passwordHash: await hashPassword(temp), role, mustChange: true });
  revalidatePath("/users");
  return { tempPassword: temp, email };
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  const me = await requireAdmin();
  if (userId === me.id && disabled) throw new Error("Locking yourself out is not a feature.");
  const target = findUserById(userId);
  if (!target) throw new Error("No such account.");
  if (disabled && target.role === "ADMIN" && countActiveAdmins() <= 1) {
    throw new Error("That is the last active admin. Promote someone else first.");
  }
  setUserDisabledRow(userId, disabled);
  // Disabling ends their sessions now, not whenever the cookie happens to expire.
  if (disabled) deleteSessionsForUser(userId);
  revalidatePath("/users");
}

export async function setUserRole(userId: string, role: string) {
  const me = await requireAdmin();
  if (role !== "ADMIN" && role !== "MEMBER") throw new Error("Unknown role");
  if (userId === me.id && role !== "ADMIN" && countActiveAdmins() <= 1) {
    throw new Error("You are the only admin. Promote someone else first.");
  }
  setUserRoleRow(userId, role);
  revalidatePath("/users");
}

export async function resetUserPassword(userId: string): Promise<{ tempPassword: string; email: string }> {
  await requireAdmin();
  const user = findUserById(userId);
  if (!user) throw new Error("No such account.");
  const temp = randomBytes(12).toString("base64url");
  setUserPassword(userId, await hashPassword(temp), true);
  deleteSessionsForUser(userId);
  revalidatePath("/users");
  return { tempPassword: temp, email: user.email };
}

export async function signOutEverywhere(userId: string) {
  await requireAdmin();
  deleteSessionsForUser(userId);
  revalidatePath("/users");
}

export async function whoAmI() {
  return getSessionUser();
}
