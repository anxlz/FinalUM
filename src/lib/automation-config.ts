import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { automationConfig } from "../db/schema";

export const CONFIG_KEYS = {
  auto_ticket_creation: { type: "boolean", default: true },
  auto_match_logging: { type: "boolean", default: true },
  screenshot_ocr_pipeline: { type: "boolean", default: false },
  compliance_flagging: { type: "boolean", default: false },

  advance_notice_enabled: { type: "boolean", default: true },
  advance_notice_hours: { type: "number", default: 24 },
  league_timezone: { type: "string", default: "UTC" },
  /** Where /leaderboard and the live leaderboard board are posted. */
  leaderboard_channel_id: { type: "string", default: "" },
  leaderboard_style: { type: "string", default: "static" },
  match_announce_channel_id: { type: "string", default: "" },
  reconfirm_after_update: { type: "boolean", default: true },

  /**
   * The live leaderboard board: one message per guild that /leaderboardlive keeps posted
   * and edits in place every 30s rather than resending. Empty message id means "not live".
   */
  leaderboard_live_channel_id: { type: "string", default: "" },
  leaderboard_live_message_id: { type: "string", default: "" },
  /** Encoded BoardState (view~sort~region~tier~mode~page) — see leaderboard/board.service.ts. */
  leaderboard_live_state: { type: "string", default: "team~points~*~*~*~0" },

  ticket_name_template: { type: "string", default: "match-{home}-vs-{away}" },
  ticket_topic_template: { type: "string", default: "{id} — {home} vs {away} ({category})" },
  ticket_category_id: { type: "string", default: "" },
  ticket_welcome_message: {
    type: "string",
    default:
      "Welcome to your {category} match, {home} vs {away}.\nKickoff is {kickoff}.\nAgree lobby details here, then post your scoreboard screenshot when you finish.",
  },
  ticket_staff_role_id: { type: "string", default: "" },
  ticket_ping: { type: "string", default: "captains" },
  ticket_close_behavior: { type: "string", default: "delete" },
  ticket_archive_category_id: { type: "string", default: "" },
  application_channel_id: { type: "string", default: "" },
  application_review_channel_id: { type: "string", default: "" },

  /** Where the "Support" hyperlink button (Match League Center → Support, /setSupportChannel) points. */
  support_channel_id: { type: "string", default: "" },

  league_name: { type: "string", default: "" },
  embed_color_brand: { type: "string", default: "" },
  embed_color_pending: { type: "string", default: "" },
  embed_color_confirmed: { type: "string", default: "" },
  embed_color_cancelled: { type: "string", default: "" },
  embed_color_danger: { type: "string", default: "" },
  /** Universe Red — LIVE state and featured moments. Kept separate from `brand`. */
  embed_color_live: { type: "string", default: "" },
  embed_footer_text: { type: "string", default: "" },
  embed_logo_url: { type: "string", default: "" },
  embed_timestamps: { type: "boolean", default: true },

  compliance_opponent_limit: { type: "number", default: 2 },
  compliance_weekly_series_min: { type: "number", default: 0 },
  compliance_weekly_series_max: { type: "number", default: 10 },

  /** Match Center hub — a static message with a select menu, posted once and re-edited
   *  in place when /setemojis changes the option emojis. */
  match_center_channel_id: { type: "string", default: "" },
  match_center_message_id: { type: "string", default: "" },
  emoji_create_match: { type: "string", default: "📅" },
  emoji_my_matches: { type: "string", default: "📋" },
  emoji_leaderboard: { type: "string", default: "🏆" },
  emoji_support: { type: "string", default: "🎧" },

  /** Bot presence (/setstatus). Global to the bot connection, not per-guild — stored under
   *  the special "__global__" key regardless of which guild's staff set it. */
  bot_status_type: { type: "string", default: "" },
  bot_status_description: { type: "string", default: "" },
  bot_status_twitch_username: { type: "string", default: "" },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

type ValueOf<K extends ConfigKey> = (typeof CONFIG_KEYS)[K]["type"] extends "boolean"
  ? boolean
  : (typeof CONFIG_KEYS)[K]["type"] extends "number"
    ? number
    : string;

function decode<K extends ConfigKey>(key: K, raw: string): ValueOf<K> {
  const kind = CONFIG_KEYS[key].type;
  if (kind === "boolean") return (raw === "true") as ValueOf<K>;
  if (kind === "number") {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : CONFIG_KEYS[key].default) as ValueOf<K>;
  }
  return raw as ValueOf<K>;
}

function encode(value: boolean | number | string): string {
  return typeof value === "string" ? value : String(value);
}

export function getConfig<K extends ConfigKey>(guildId: string, key: K): ValueOf<K> {
  const row = getDb()
    .select({ value: automationConfig.value })
    .from(automationConfig)
    .where(and(eq(automationConfig.guildId, guildId), eq(automationConfig.key, key)))
    .get();

  if (!row) return CONFIG_KEYS[key].default as ValueOf<K>;
  return decode(key, row.value);
}

export function setConfig<K extends ConfigKey>(
  guildId: string,
  key: K,
  value: ValueOf<K>,
  updatedBy: string,
): void {
  getDb()
    .insert(automationConfig)
    .values({ guildId, key, value: encode(value), updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [automationConfig.guildId, automationConfig.key],
      set: { value: encode(value), updatedBy, updatedAt: new Date() },
    })
    .run();
}

export type BooleanConfigKey = {
  [K in ConfigKey]: (typeof CONFIG_KEYS)[K]["type"] extends "boolean" ? K : never;
}[ConfigKey];

export function getToggle(guildId: string, key: BooleanConfigKey): boolean {
  return getConfig(guildId, key) as unknown as boolean;
}

export function setToggle(
  guildId: string,
  key: BooleanConfigKey,
  value: boolean,
  updatedBy: string,
): void {
  setConfig(guildId, key, value as never, updatedBy);
}

/** Sentinel "guild" for settings that are actually global to the bot process (presence is
 *  one Discord gateway connection shared by every guild — there's no real per-guild home
 *  for it in a guild-scoped config table, so it's stored once under this fixed key). */
export const GLOBAL_CONFIG_SCOPE = "__global__";

export function listConfig(guildId: string): Array<{ key: ConfigKey; value: string; isDefault: boolean }> {
  return (Object.keys(CONFIG_KEYS) as ConfigKey[]).map((key) => {
    const row = getDb()
      .select({ value: automationConfig.value })
      .from(automationConfig)
      .where(and(eq(automationConfig.guildId, guildId), eq(automationConfig.key, key)))
      .get();
    return {
      key,
      value: row?.value ?? encode(CONFIG_KEYS[key].default),
      isDefault: !row,
    };
  });
}
