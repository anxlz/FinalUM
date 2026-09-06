import Database from "better-sqlite3";
import { getDashboardConfiguration } from "@/lib/server-config";
import type { Access } from "@/lib/auth";

export type DashboardTeam = {
  id: string;
  name: string;
  tag: string | null;
  tier: string | null;
  region: string | null;
  active: boolean;
  rosterCount: number;
  points: number;
  logoUrl: string | null;
};

export function getTeamsData(access?: Access | null): DashboardTeam[] {
  const configuration = getDashboardConfiguration();
  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") return [];

  const database = new Database(configuration.sqlitePath, { readonly: true });
  try {
    const guildId = process.env.DASHBOARD_GUILD_ID?.trim() ||
      (database.prepare("SELECT guild_id AS guildId FROM teams GROUP BY guild_id ORDER BY guild_id LIMIT 1").get() as { guildId?: string } | undefined)?.guildId;
    if (!guildId) return [];

    const scope = access && access.role !== "ADMIN" ? ` AND teams.id IN (${access.teamIds.map(() => "?").join(",")})` : "";
    return database.prepare(`
      SELECT
        teams.id AS id,
        teams.name AS name,
        teams.tag AS tag,
        teams.tier AS tier,
        teams.region AS region,
        teams.logo_url AS logoUrl,
        teams.active AS active,
        COUNT(DISTINCT players.id) AS rosterCount,
        COALESCE(SUM(point_transactions.points), 0) AS points
      FROM teams
      LEFT JOIN players ON players.team_id = teams.id AND players.active = 1
      LEFT JOIN point_transactions ON point_transactions.team_id = teams.id
      WHERE teams.guild_id = ?${scope}
      GROUP BY teams.id
      ORDER BY teams.active DESC, points DESC, teams.name COLLATE NOCASE ASC
    `).all(guildId, ...(access && access.role !== "ADMIN" ? access.teamIds : [])) as DashboardTeam[];
  } finally {
    database.close();
  }
}
