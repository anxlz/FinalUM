/**
 * Drizzle schema — the single source of truth for the database (§9 of the build prompt).
 */

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/* ------------------------------------------------------------------ *
 * Teams & rosters
 * ------------------------------------------------------------------ */

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),

    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    tag: text("tag"),

    region: text("region", {
      enum: ["NA", "SA", "EU", "ME", "AFRICA", "INDIA", "GARENA", "JAPAN", "CHINA"],
    }),
    tier: text("tier"),
    logoUrl: text("logo_url"),

    captainDiscordId: text("captain_discord_id").notNull(),
    managerDiscordId: text("manager_discord_id").notNull(),
    registeredBy: text("registered_by").notNull(),

    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("teams_guild_name_key").on(t.guildId, t.nameKey),
    index("teams_guild_captain_idx").on(t.guildId, t.captainDiscordId),
  ],
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),

    discordId: text("discord_id"),
    ign: text("ign").notNull(),
    ignKey: text("ign_key").notNull(),
    uid: text("uid"),

    role: text("role", { enum: ["CAPTAIN", "PLAYER", "SUB"] })
      .notNull()
      .default("PLAYER"),

    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [
    uniqueIndex("players_team_ign_key").on(t.teamId, t.ignKey),
    index("players_guild_discord_idx").on(t.guildId, t.discordId),
    index("players_team_idx").on(t.teamId),
  ],
);

/* ------------------------------------------------------------------ *
 * Matches
 * ------------------------------------------------------------------ */

export const SCHEDULE_STATUSES = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED",
  "FORFEITED",
] as const;

export const RESULT_STATUSES = [
  "AWAITING_SUBMISSION",
  "OCR_PROCESSING",
  "OCR_FAILED",
  "VALIDATION_FAILED",
  "STREAMER_MODE_DETECTED",
  "TEAM_POINTS_CALCULATED",
  "PLAYER_POINTS_PENDING",
  "PENDING_STREAMER_MODE_RESOLUTION",
  "PENDING_MANUAL_STATS",
  "PENDING_APPROVAL",
  "COMPLETED",
  "REJECTED",
] as const;

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    publicMatchId: text("public_match_id").notNull(),
    guildId: text("guild_id").notNull(),

    mode: text("mode", { enum: ["hardpoint", "search_and_destroy", "control"] }),
    map: text("map"),
    category: text("category", {
      enum: ["SCRIM", "OFFICIAL", "TOURNAMENT", "PRACTICE"],
    }).notNull(),

    homeTeamId: text("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: text("away_team_id")
      .notNull()
      .references(() => teams.id),
    leftTeamId: text("left_team_id").references(() => teams.id),
    rightTeamId: text("right_team_id").references(() => teams.id),
    leftScore: integer("left_score"),
    rightScore: integer("right_score"),
    winnerTeamId: text("winner_team_id").references(() => teams.id),
    loserTeamId: text("loser_team_id").references(() => teams.id),

    scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
    scheduledTimezone: text("scheduled_timezone").notNull(),

    pairKey: text("pair_key").notNull(),
    activeFixtureKey: text("active_fixture_key"),

    scheduleStatus: text("schedule_status", { enum: SCHEDULE_STATUSES })
      .notNull()
      .default("PENDING_CONFIRMATION"),
    resultStatus: text("result_status", { enum: RESULT_STATUSES })
      .notNull()
      .default("AWAITING_SUBMISSION"),

    advanceNoticeHours: integer("advance_notice_hours").notNull(),
    advanceNoticeMet: integer("advance_notice_met", { mode: "boolean" }).notNull(),

    registeredBy: text("registered_by").notNull(),
    confirmedBy: text("confirmed_by"),
    confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
    cancelledBy: text("cancelled_by"),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
    cancelReason: text("cancel_reason"),

    announceChannelId: text("announce_channel_id"),
    announceMessageId: text("announce_message_id"),
    ticketChannelId: text("ticket_channel_id"),

    scoringVersion: text("scoring_version"),
    rawOcrResponse: text("raw_ocr_response", { mode: "json" }),
    normalizedOcrData: text("normalized_ocr_data", { mode: "json" }),
    calculatedData: text("calculated_data", { mode: "json" }),
    teamPointsBreakdown: text("team_points_breakdown", { mode: "json" }),

    submittedBy: text("submitted_by"),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    screenshotUrl: text("screenshot_url"),
    streamerModeEnabled: integer("streamer_mode_enabled", { mode: "boolean" }),

    calibrationConfidence: text("calibration_confidence", {
      enum: [
        "CALIBRATED",
        "INTERPOLATED",
        "CLAMPED_LOW",
        "CLAMPED_HIGH",
        "EXTRAPOLATED",
        "INSUFFICIENT_CALIBRATION",
      ],
    }),

    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
    processedAt: integer("processed_at", { mode: "timestamp" }),
  },
  (t) => [
    uniqueIndex("matches_public_id_key").on(t.publicMatchId),
    uniqueIndex("matches_active_fixture_key").on(t.guildId, t.activeFixtureKey),
    index("matches_guild_status_idx").on(t.guildId, t.scheduleStatus),
    index("matches_home_idx").on(t.homeTeamId),
    index("matches_away_idx").on(t.awayTeamId),
  ],
);

/* ------------------------------------------------------------------ *
 * Result-side tables (§9.1)
 * ------------------------------------------------------------------ */

export const matchPlayers = sqliteTable(
  "match_players",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: text("player_id").references(() => players.id),
    teamId: text("team_id").references(() => teams.id),

    scoreboardSide: text("scoreboard_side", { enum: ["left", "right"] }),
    scoreboardPosition: integer("scoreboard_position"),
    ocrName: text("ocr_name"),
    identityStatus: text("identity_status", {
      enum: ["IDENTIFIED", "MISSING", "STREAMER_MODE_ANONYMOUS", "OCR_UNREADABLE", "AMBIGUOUS"],
    }),

    kills: integer("kills"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    objectiveTimeSeconds: integer("objective_time_seconds"),
    objectiveStats: text("objective_stats", { mode: "json" }),
    contribution: integer("contribution"),
    rawScore: integer("raw_score"),
    normalizedStats: text("normalized_stats", { mode: "json" }),

    performanceScore: integer("performance_score"),
    matchPoints: integer("match_points"),

    status: text("status", {
      enum: ["OCR_CONFIRMED", "PENDING_MANUAL_STATS", "PENDING_APPROVAL", "APPROVED"],
    }),
    isProvisional: integer("is_provisional", { mode: "boolean" }).notNull().default(true),
    statsSource: text("stats_source", { enum: ["OCR", "MANUAL"] }),
    approvedBy: text("approved_by"),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
  },
  (t) => [index("match_players_match_idx").on(t.matchId)],
);

export const pointTransactions = sqliteTable(
  "point_transactions",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id),
    playerId: text("player_id").references(() => players.id),
    teamId: text("team_id").references(() => teams.id),

    points: integer("points").notNull(),
    pointType: text("point_type", { enum: ["TEAM", "PLAYER"] }).notNull(),
    scoringVersion: text("scoring_version").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("point_tx_match_idx").on(t.matchId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    matchId: text("match_id"),
    subjectType: text("subject_type", { enum: ["MATCH", "TEAM", "PLAYER", "CONFIG"] }).notNull(),
    subjectId: text("subject_id"),
    action: text("action").notNull(),
    oldValue: text("old_value", { mode: "json" }),
    newValue: text("new_value", { mode: "json" }),
    reason: text("reason"),
    scoringVersion: text("scoring_version"),
    actorDiscordId: text("actor_discord_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("audit_guild_created_idx").on(t.guildId, t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * Configuration & infrastructure
 * ------------------------------------------------------------------ */

export const automationConfig = sqliteTable(
  "automation_config",
  {
    guildId: text("guild_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [uniqueIndex("automation_config_pk").on(t.guildId, t.key)],
);

export const staffRoles = sqliteTable(
  "staff_roles",
  {
    guildId: text("guild_id").notNull(),
    roleId: text("role_id").notNull(),
    addedBy: text("added_by"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [uniqueIndex("staff_roles_pk").on(t.guildId, t.roleId)],
);

export const matchIdCounters = sqliteTable(
  "match_id_counters",
  {
    guildId: text("guild_id").notNull(),
    day: text("day").notNull(),
    seq: integer("seq").notNull().default(0),
  },
  (t) => [uniqueIndex("match_id_counters_pk").on(t.guildId, t.day)],
);

export const scheduledJobs = sqliteTable("scheduled_jobs", {
  name: text("name").primaryKey(),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/* ================================================================== *
 * Phase 2 — applications & tickets
 * ================================================================== */

export const applications = sqliteTable(
  "applications",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    publicRef: text("public_ref").notNull(),

    applicantDiscordId: text("applicant_discord_id").notNull(),
    teamName: text("team_name").notNull(),
    region: text("region"),
    tier: text("tier"),
    logoUrl: text("logo_url"),

    status: text("status", {
      enum: ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"],
    })
      .notNull()
      .default("DRAFT"),

    createdTeamId: text("created_team_id").references(() => teams.id),

    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
    rejectionReason: text("rejection_reason"),

    reviewChannelId: text("review_channel_id"),
    reviewMessageId: text("review_message_id"),

    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
  },
  (t) => [
    uniqueIndex("applications_public_ref_key").on(t.publicRef),
    index("applications_guild_status_idx").on(t.guildId, t.status),
    index("applications_applicant_idx").on(t.applicantDiscordId),
  ],
);

export const applicationPlayers = sqliteTable(
  "application_players",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    ign: text("ign").notNull(),
    uid: text("uid"),
    discordId: text("discord_id"),
    isCaptain: integer("is_captain", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("application_players_app_idx").on(t.applicationId)],
);

/* ================================================================== *
 * Phase 3 — results, unresolved slots, approvals
 * ================================================================== */

export const UNRESOLVED_REASONS = [
  "MISSING",
  "STREAMER_MODE",
  "OCR_UNREADABLE",
  "AMBIGUOUS",
] as const;

export const unresolvedSlots = sqliteTable(
  "unresolved_slots",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id),

    reason: text("reason", { enum: UNRESOLVED_REASONS }).notNull(),
    side: text("side", { enum: ["left", "right"] }),
    slot: integer("slot"),
    ocrName: text("ocr_name"),

    heldKills: integer("held_kills"),
    heldDeaths: integer("held_deaths"),
    heldAssists: integer("held_assists"),
    heldObjectiveTimeSeconds: integer("held_objective_time_seconds"),

    resolvedPlayerId: text("resolved_player_id").references(() => players.id),
    resolvedBy: text("resolved_by"),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),

    status: text("status", { enum: ["PENDING", "RESOLVED", "DISCARDED"] })
      .notNull()
      .default("PENDING"),
  },
  (t) => [index("unresolved_slots_match_idx").on(t.matchId, t.status)],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["MATCH_RESULT", "PLAYER_STATS"] }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),

    status: text("status", { enum: ["PENDING", "APPROVED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    decidedBy: text("decided_by"),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
    decisionNote: text("decision_note"),

    channelId: text("channel_id"),
    messageId: text("message_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("approvals_match_status_idx").on(t.matchId, t.status)],
);

/* ================================================================== *
 * Phase 4 — compliance flags (flag-only, never blocking)
 * ================================================================== */

export const complianceFlags = sqliteTable(
  "compliance_flags",
  {
    id: text("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    matchId: text("match_id").references(() => matches.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id),

    rule: text("rule", {
      enum: ["OPPONENT_LIMIT", "WEEKLY_SERIES_MIN", "WEEKLY_SERIES_MAX", "ADVANCE_NOTICE"],
    }).notNull(),
    severity: text("severity", { enum: ["INFO", "WARN"] }).notNull().default("WARN"),
    detail: text("detail").notNull(),
    weekStart: integer("week_start", { mode: "timestamp" }),

    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(now),
  },
  (t) => [index("compliance_guild_week_idx").on(t.guildId, t.weekStart)],
);

export type Application = typeof applications.$inferSelect;
export type ApplicationPlayer = typeof applicationPlayers.$inferSelect;
export type UnresolvedSlot = typeof unresolvedSlots.$inferSelect;
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];
export type Approval = typeof approvals.$inferSelect;
export type MatchPlayer = typeof matchPlayers.$inferSelect;
export type ComplianceFlag = typeof complianceFlags.$inferSelect;
