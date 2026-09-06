import Database from "better-sqlite3";
import { getDashboardConfiguration } from "@/lib/server-config";

export type OverviewData = {
  source: "sqlite" | "supabase";
  guildId: string | null;
  metrics: {
    registeredTeams: number;
    activeMatches: number;
    pendingApprovals: number;
    completedMatches: number;
  };
  recentMatches: Array<{
    publicMatchId: string;
    homeTeam: string;
    awayTeam: string;
    resultStatus: string;
    leftScore: number | null;
    rightScore: number | null;
    scheduledAt: number;
  }>;
};

export function getOverviewData(): OverviewData {
  const configuration = getDashboardConfiguration();
  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") {
    return emptyOverview(configuration.dataSource === "supabase" ? "supabase" : "sqlite");
  }

  const database = new Database(configuration.sqlitePath, { readonly: true });
  try {
    const guildId = resolveGuildId(database);
    if (!guildId) return emptyOverview("sqlite");

    const registeredTeams = count(database, "SELECT COUNT(*) AS count FROM teams WHERE guild_id = ? AND active = 1", guildId);
    const activeMatches = count(
      database,
      "SELECT COUNT(*) AS count FROM matches WHERE guild_id = ? AND schedule_status != 'CANCELLED' AND result_status != 'COMPLETED'",
      guildId,
    );
    const pendingApprovals = count(
      database,
      "SELECT COUNT(*) AS count FROM approvals INNER JOIN matches ON matches.id = approvals.match_id WHERE matches.guild_id = ? AND approvals.status = 'PENDING'",
      guildId,
    );
    const completedMatches = count(database, "SELECT COUNT(*) AS count FROM matches WHERE guild_id = ? AND result_status = 'COMPLETED'", guildId);
    const recentMatches = database.prepare(`
      SELECT
        matches.public_match_id AS publicMatchId,
        home.name AS homeTeam,
        away.name AS awayTeam,
        matches.result_status AS resultStatus,
        matches.left_score AS leftScore,
        matches.right_score AS rightScore,
        matches.scheduled_at AS scheduledAt
      FROM matches
      INNER JOIN teams AS home ON home.id = matches.home_team_id
      INNER JOIN teams AS away ON away.id = matches.away_team_id
      WHERE matches.guild_id = ?
      ORDER BY matches.scheduled_at DESC
      LIMIT 5
    `).all(guildId) as OverviewData["recentMatches"];

    return { source: "sqlite", guildId, metrics: { registeredTeams, activeMatches, pendingApprovals, completedMatches }, recentMatches };
  } finally {
    database.close();
  }
}

function resolveGuildId(database: Database.Database): string | null {
  const configuredGuildId = process.env.DASHBOARD_GUILD_ID?.trim();
  if (configuredGuildId) return configuredGuildId;
  const row = database.prepare("SELECT guild_id AS guildId FROM teams GROUP BY guild_id ORDER BY guild_id LIMIT 1").get() as { guildId?: string } | undefined;
  return row?.guildId ?? null;
}

function count(database: Database.Database, query: string, guildId: string): number {
  const row = database.prepare(query).get(guildId) as { count: number };
  return row.count;
}

function emptyOverview(source: "sqlite" | "supabase"): OverviewData {
  return { source, guildId: null, metrics: { registeredTeams: 0, activeMatches: 0, pendingApprovals: 0, completedMatches: 0 }, recentMatches: [] };
}
