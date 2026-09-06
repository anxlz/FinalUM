/**
 * §5 global rules, enforced here rather than left to each command:
 *   - every embed's body text is bold;
 *   - every clickable action edits the existing message in place.
 *
 * Colour tokens below follow the Universe Meta design system (UM-DS-2026 · EMEA):
 * matte dark surfaces (never pure black), a single red accent used sparingly, status
 * communicated through colour + a "●" dot rather than emoji. Discord embeds only expose
 * one colour per embed (the left accent bar) and no font control, so the system's type
 * scale and multi-colour panels don't translate directly — what does translate is the
 * semantic palette, the "one red accent, not a fill" rule, and the deadpan third-person
 * voice with no emoji. The canvas-rendered leaderboard (render.service.ts) is where the
 * fuller visual language (surfaces, type, motion) actually applies.
 */

import { getConfig, type ConfigKey } from "./automation-config";
import {
  EmbedBuilder,
  MessageFlags,
  type APIEmbedField,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type StringSelectMenuInteraction,
} from "discord.js";

/**
 * Universe Meta semantic palette. `live` is Universe Red (#FA1146) — the system's single
 * chromatic accent, reserved for LIVE state and featured data points, not a general brand
 * colour. Neutral/informational embeds use Info blue instead, per "never as a fill on more
 * than one element per composition."
 */
export const COLORS = {
  pending: 0xffb547, // Warn
  confirmed: 0x4de08a, // Win
  cancelled: 0xff4d5e, // Loss
  info: 0xfa1146, // Universe Red — the bot's default embed colour everywhere a tone isn't specified
  brand: 0xfa1146, // same as info — neutral/default embeds also show the red accent by default
  danger: 0xff4d5e, // Loss
  live: 0xfa1146, // Universe Red — LIVE state and featured moments only
} as const;

export type EmbedTone = keyof typeof COLORS;

export interface EmbedTheme {
  colors: Record<EmbedTone, number>;
  footerText: string | null;
  logoUrl: string | null;
  timestamps: boolean;
  leagueName: string | null;
}

const DEFAULT_THEME: EmbedTheme = {
  colors: { ...COLORS },
  footerText: null,
  logoUrl: null,
  timestamps: true,
  leagueName: null,
};

export function parseHexColor(value: string): number | null {
  const cleaned = value.trim().replace(/^#/, "").replace(/^0x/i, "");
  if (!/^[0-9a-f]{6}$/i.test(cleaned)) return null;
  return Number.parseInt(cleaned, 16);
}

export function formatHexColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
}

export function resolveTheme(guildId: string | null | undefined): EmbedTheme {
  if (!guildId) return DEFAULT_THEME;

  const color = (key: ConfigKey, fallback: number): number => {
    const raw = getConfig(guildId, key) as string;
    if (!raw) return fallback;
    return parseHexColor(raw) ?? fallback;
  };

  return {
    colors: {
      pending: color("embed_color_pending", COLORS.pending),
      confirmed: color("embed_color_confirmed", COLORS.confirmed),
      cancelled: color("embed_color_cancelled", COLORS.cancelled),
      danger: color("embed_color_danger", COLORS.danger),
      brand: color("embed_color_brand", COLORS.brand),
      info: color("embed_color_brand", COLORS.info),
      live: color("embed_color_live", COLORS.live),
    },
    footerText: (getConfig(guildId, "embed_footer_text") as string) || null,
    logoUrl: (getConfig(guildId, "embed_logo_url") as string) || null,
    timestamps: getConfig(guildId, "embed_timestamps") as boolean,
    leagueName: (getConfig(guildId, "league_name") as string) || null,
  };
}

export function b(text: string | number | null | undefined): string {
  const value = String(text ?? "").trim();
  if (value === "") return "—";
  if (value.startsWith("**") && value.endsWith("**")) return value;
  return value
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : `**${line}**`))
    .join("\n");
}

export function field(name: string, value: string | number | null | undefined, inline = true): APIEmbedField {
  return { name, value: b(value), inline };
}

/**
 * Universe Meta status chip: "status is communicated through colour + a dot", never emoji.
 * The dot is the single universal glyph; the label carries the meaning. Use this instead of
 * ⚠️/ℹ️/✅ anywhere a line needs to flag a state (SHORT NOTICE, ADVISORY, CALIBRATION, LIVE).
 */
export function chip(label: string, detail?: string): string {
  const line = `● ${label.toUpperCase()}`;
  return detail ? `${line} — ${detail}` : line;
}

export interface BuildEmbedOptions {
  title: string;
  description?: string;
  tone?: EmbedTone;
  color?: number;
  guildId?: string | null;
  fields?: APIEmbedField[];
  footer?: string;
  thumbnail?: string | null;
  /** `attachment://filename` or a direct URL — the large body image (e.g. a rendered board). */
  image?: string | null;
  timestamp?: boolean;
}

export function buildEmbed(options: BuildEmbedOptions): EmbedBuilder {
  const theme = resolveTheme(options.guildId);
  const tone = options.tone ?? "info";

  const embed = new EmbedBuilder()
    .setTitle(options.title)
    .setColor(options.color ?? theme.colors[tone]);

  if (options.description) embed.setDescription(b(options.description));
  if (options.fields?.length) embed.addFields(options.fields);

  const footerParts = [options.footer, theme.footerText].filter(
    (part): part is string => Boolean(part),
  );
  if (footerParts.length > 0) embed.setFooter({ text: footerParts.join(" • ") });

  const thumbnail = options.thumbnail ?? theme.logoUrl;
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (options.image) embed.setImage(options.image);

  if (options.timestamp ?? theme.timestamps) embed.setTimestamp(new Date());

  return embed;
}

export function errorEmbed(message: string, guildId?: string | null): EmbedBuilder {
  return buildEmbed({ title: "Unable to Continue", description: message, tone: "danger", guildId });
}

export function successEmbed(title: string, message: string, guildId?: string | null): EmbedBuilder {
  return buildEmbed({ title, description: message, tone: "confirmed", guildId });
}

export async function replyError(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  message: string,
): Promise<void> {
  const payload: InteractionReplyOptions = {
    embeds: [errorEmbed(message, interaction.guildId)],
    flags: MessageFlags.Ephemeral,
  };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

export async function updateInPlace(
  interaction: ButtonInteraction,
  options: InteractionUpdateOptions,
): Promise<void> {
  await interaction.update(options);
}
