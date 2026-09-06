import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import Database from "better-sqlite3";
import { getDashboardConfiguration } from "@/lib/server-config";

const sessionCookie = "uml_dashboard_session";
const stateCookie = "uml_dashboard_oauth_state";
const discordApi = "https://discord.com/api/v10";

type Session = { userId: string; username: string; avatar: string | null; expiresAt: number };
export type Access = { userId: string; username: string; role: "ADMIN" | "TEAM_MANAGER" | "PLAYER" | "STAFF"; teamIds: string[] };

export function authConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_DISCORD_CLIENT_ID && process.env.DASHBOARD_DISCORD_CLIENT_SECRET && process.env.DASHBOARD_SESSION_SECRET && process.env.DASHBOARD_GUILD_ID);
}

export function authRequired(): boolean {
  return process.env.DASHBOARD_AUTH_REQUIRED !== "false";
}

export function getLoginUrl(state?: string): string | null {
  const clientId = process.env.DASHBOARD_DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DASHBOARD_DISCORD_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/callback`;
  if (!clientId) return null;
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify", ...(state ? { state } : {}) });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export async function createOAuthState(): Promise<string | null> {
  const state = randomBytes(32).toString("hex");
  (await cookies()).set(stateCookie, sign(state), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 600 });
  return state;
}

export async function validateOAuthState(state: string | null): Promise<boolean> {
  const expected = (await cookies()).get(stateCookie)?.value;
  if (!state || !expected || !safeCompare(expected, sign(state))) return false;
  (await cookies()).delete(stateCookie);
  return true;
}

export async function getDashboardAccess(): Promise<Access | null> {
  const session = await readSession();
  if (!session || session.expiresAt < Date.now()) return null;
  const configuration = getDashboardConfiguration();
  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") return null;

  const database = new Database(configuration.sqlitePath, { readonly: true });
  try {
    const teamRows = database.prepare("SELECT id FROM teams WHERE guild_id = ? AND captain_discord_id = ? AND active = 1").all(process.env.DASHBOARD_GUILD_ID, session.userId) as Array<{ id: string }>;
    const player = database.prepare("SELECT team_id AS teamId FROM players WHERE guild_id = ? AND discord_id = ? AND active = 1 LIMIT 1").get(process.env.DASHBOARD_GUILD_ID, session.userId) as { teamId?: string } | undefined;
    const configuredRoleIds = database.prepare("SELECT role_id AS roleId FROM staff_roles WHERE guild_id = ?").all(process.env.DASHBOARD_GUILD_ID) as Array<{ roleId: string }>;
    database.close();

    const member = await getGuildMember(session.userId);
    const isStaff = Boolean(member && configuredRoleIds.some((role) => member.roles.includes(role.roleId)));
    const teamIds = [...new Set([...teamRows.map((row) => row.id), ...(player?.teamId ? [player.teamId] : [])])];
    if (isStaff) return { userId: session.userId, username: session.username, role: "ADMIN", teamIds };
    return null;
  } catch {
    database.close();
    return null;
  }
}

export async function getSessionIdentity(): Promise<{ username: string } | null> {
  const session = await readSession();
  return session && session.expiresAt >= Date.now() ? { username: session.username } : null;
}

export async function createSession(user: { id: string; username: string; avatar: string | null }): Promise<void> {
  const payload: Session = { userId: user.id, username: user.username, avatar: user.avatar, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 };
  const encoded = encode(JSON.stringify(payload));
  const signature = sign(encoded);
  (await cookies()).set(sessionCookie, `${encoded}.${signature}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearSession(): Promise<void> { (await cookies()).delete(sessionCookie); }

export async function exchangeCode(code: string) {
  const clientId = process.env.DASHBOARD_DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DASHBOARD_DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DASHBOARD_DISCORD_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/callback`;
  if (!clientId || !clientSecret) throw new Error("Discord dashboard OAuth is not configured");
  const tokenResponse = await fetch(`${discordApi}/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
  if (!tokenResponse.ok) throw new Error("Discord OAuth token exchange failed");
  const token = await tokenResponse.json() as { access_token: string };
  const userResponse = await fetch(`${discordApi}/users/@me`, { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!userResponse.ok) throw new Error("Discord identity lookup failed");
  return userResponse.json() as Promise<{ id: string; username: string; avatar: string | null }>;
}

async function getGuildMember(userId: string): Promise<{ roles: string[]; permissions?: string } | null> {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DASHBOARD_GUILD_ID;
  if (!token || !guildId) return null;
  const response = await fetch(`${discordApi}/guilds/${guildId}/members/${userId}`, { headers: { authorization: `Bot ${token}` }, cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<{ roles: string[]; permissions?: string }>;
}

async function readSession(): Promise<Session | null> {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !safeCompare(signature, sign(encoded))) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Session; } catch { return null; }
}

function encode(value: string): string { return Buffer.from(value).toString("base64url"); }
function sign(value: string): string { return createHmac("sha256", process.env.DASHBOARD_SESSION_SECRET ?? "missing").update(value).digest("base64url"); }
function safeCompare(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
