import Database from "better-sqlite3";
import { getDashboardConfiguration } from "@/lib/server-config";
import type { Access } from "@/lib/auth";

type Row = Record<string, string | number | null>;

function withDatabase<T>(query: (database: Database.Database, guildId: string, access?: Access | null) => T, access?: Access | null): T | null {
  const configuration = getDashboardConfiguration();
  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") return null;
  const database = new Database(configuration.sqlitePath, { readonly: true });
  try {
    const guildId = process.env.DASHBOARD_GUILD_ID?.trim() ||
      (database.prepare("SELECT guild_id AS guildId FROM teams GROUP BY guild_id ORDER BY guild_id LIMIT 1").get() as { guildId?: string } | undefined)?.guildId;
    return guildId ? query(database, guildId, access) : null;
  } finally {
    database.close();
  }
}

export function getMatchesData(access?: Access | null): Row[] {
  return withDatabase((database, guildId, currentAccess) => { const scope = currentAccess && currentAccess.role !== "ADMIN" ? ` AND (matches.home_team_id IN (${currentAccess.teamIds.map(() => "?").join(",")}) OR matches.away_team_id IN (${currentAccess.teamIds.map(() => "?").join(",")}))` : ""; return database.prepare(`
    SELECT matches.public_match_id AS matchId, home.name AS homeTeam, away.name AS awayTeam,
      matches.category, matches.schedule_status AS scheduleStatus, matches.result_status AS resultStatus,
      matches.left_score AS leftScore, matches.right_score AS rightScore, matches.scheduled_at AS scheduledAt
    FROM matches INNER JOIN teams home ON home.id = matches.home_team_id INNER JOIN teams away ON away.id = matches.away_team_id
    WHERE matches.guild_id = ?${scope} ORDER BY matches.scheduled_at DESC LIMIT 50
  `).all(guildId, ...(currentAccess && currentAccess.role !== "ADMIN" ? [...currentAccess.teamIds, ...currentAccess.teamIds] : [])) as Row[]; }, access) ?? [];
}

export function getPlayersData(access?: Access | null): Row[] {
  return withDatabase((database, guildId, currentAccess) => { const scope = currentAccess && currentAccess.role !== "ADMIN" ? ` AND players.team_id IN (${currentAccess.teamIds.map(() => "?").join(",")})` : ""; return database.prepare(`
    SELECT players.ign, players.role, players.uid, players.active, teams.name AS teamName, teams.logo_url AS logoUrl
    FROM players INNER JOIN teams ON teams.id = players.team_id
    WHERE players.guild_id = ?${scope} ORDER BY teams.name COLLATE NOCASE, players.role, players.ign COLLATE NOCASE
  `).all(guildId, ...(currentAccess && currentAccess.role !== "ADMIN" ? currentAccess.teamIds : [])) as Row[]; }, access) ?? [];
}

export function getLeaderboardData(access?: Access | null): Row[] {
  return withDatabase((database, guildId, currentAccess) => { const scope = currentAccess && currentAccess.role !== "ADMIN" ? ` AND teams.id IN (${currentAccess.teamIds.map(() => "?").join(",")})` : ""; return database.prepare(`
    SELECT teams.name, teams.tag, teams.tier, teams.logo_url AS logoUrl,
      COALESCE(SUM(point_transactions.points), 0) AS points
    FROM teams LEFT JOIN point_transactions ON point_transactions.team_id = teams.id
    WHERE teams.guild_id = ? AND teams.active = 1${scope}
    GROUP BY teams.id ORDER BY points DESC, teams.name COLLATE NOCASE LIMIT 50
  `).all(guildId, ...(currentAccess && currentAccess.role !== "ADMIN" ? currentAccess.teamIds : [])) as Row[]; }, access) ?? [];
}

export function getApprovalsData(): Row[] {
  return withDatabase((database, guildId) => database.prepare(`
    SELECT approvals.id, approvals.kind, approvals.status, approvals.created_at AS createdAt,
      matches.public_match_id AS matchId, home.name AS homeTeam, away.name AS awayTeam
    FROM approvals INNER JOIN matches ON matches.id = approvals.match_id
    INNER JOIN teams home ON home.id = matches.home_team_id INNER JOIN teams away ON away.id = matches.away_team_id
    WHERE matches.guild_id = ? ORDER BY approvals.created_at DESC LIMIT 50
  `).all(guildId) as Row[]) ?? [];
}

export function getAuditData(): Row[] {
  return withDatabase((database, guildId) => database.prepare(`
    SELECT action, subject_type AS subjectType, subject_id AS subjectId,
      actor_discord_id AS actor, created_at AS createdAt
    FROM audit_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100
  `).all(guildId) as Row[]) ?? [];
}

export function getSettingsData(): Row[] {
  return withDatabase((database, guildId) => database.prepare(`
    SELECT key, value, updated_at AS updatedAt, updated_by AS updatedBy FROM automation_config
    WHERE guild_id = ? ORDER BY key COLLATE NOCASE
  `).all(guildId) as Row[]) ?? [];
}

export function getTeamLogos(): Row[] {
  return withDatabase((database, guildId) => database.prepare("SELECT name, logo_url AS logoUrl FROM teams WHERE guild_id = ? AND logo_url IS NOT NULL").all(guildId) as Row[]) ?? [];
}
