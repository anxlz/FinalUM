/**
 * The personalized dashboard from the Universe Meta mockups: a captain's tier, weekly
 * match count against the compliance cap, points and status, with one-click entry points
 * into the rest of the bot. Unlike the mockup's persistent per-server board, this reads
 * per-captain data (tier, points, weekly count are specific to *their* team), so it's a
 * command each captain runs rather than a single shared message — a shared board can't
 * show personalized numbers to everyone who looks at it.
 */

import { and, eq, ne, or, sql } from "drizzle-orm";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getDb } from "../db/client";
import { matches } from "../db/schema";
import { getConfig } from "../lib/automation-config";
import { startOfIsoWeekUtc } from "../lib/datetime";
import { buildEmbed, field, replyError } from "../lib/embeds";
import { getTeamTotal } from "../points/point-transaction.service";
import { findTeamsForMember } from "../teams/team.service";
import { WIZARD_PREFIX } from "../interactions/match-wizard";
import type { CommandModule } from "./types";

export const MATCH_CENTER_BUTTONS = {
  myMatches: "mc:mymatches",
  leaderboard: "mc:leaderboard",
  support: "mc:support",
} as const;

const matchCenter = new SlashCommandBuilder()
  .setName("matchcenter")
  .setDescription("Your team's match center: tier, weekly matches, points and status");

function countTeamMatchesThisWeek(teamId: string, weekStart: Date): number {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3_600_000);
  return (
    getDb()
      .select({ count: sql<number>`count(*)` })
      .from(matches)
      .where(
        and(
          or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
          ne(matches.scheduleStatus, "CANCELLED"),
          sql`${matches.scheduledAt} >= ${weekStart.getTime() / 1000}`,
          sql`${matches.scheduledAt} < ${weekEnd.getTime() / 1000}`,
        ),
      )
      .get()?.count ?? 0
  );
}

export const matchCenterCommands: CommandModule[] = [
  {
    data: matchCenter,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      const owned = findTeamsForMember(interaction.guildId!, member.id).filter(
        (t) => t.captainDiscordId === member.id,
      );

      if (owned.length === 0) {
        return replyError(
          interaction,
          "You're not registered as a team captain. Run /teamregister or apply to join the league first.",
        );
      }
      if (owned.length > 1) {
        return replyError(
          interaction,
          `You captain several teams (${owned.map((t) => t.name).join(", ")}). Match Center shows one team at a time — this will show ${owned[0]!.name}.`,
        );
      }

      const team = owned[0]!;
      const weeklyCap = getConfig(interaction.guildId!, "compliance_weekly_series_max");
      const weeklyPlayed = countTeamMatchesThisWeek(team.id, startOfIsoWeekUtc(new Date()));
      const points = getTeamTotal(team.id);

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "UM League Match Center",
            description: "Manage your official league matches.",
            tone: "brand",
            guildId: interaction.guildId,
            thumbnail: team.logoUrl,
            fields: [
              field("Tier", team.tier ?? "Not set", true),
              field("Weekly Matches", weeklyCap > 0 ? `${weeklyPlayed} / ${weeklyCap}` : String(weeklyPlayed), true),
              field("Points", String(points), true),
              field("Status", team.active ? "Active" : "Inactive", true),
              field("Team", team.name, true),
              field("Region", team.region ?? "Not set", true),
            ],
            footer: "Only team captains can use these actions",
          }),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`${WIZARD_PREFIX}:begin`).setLabel("Create Match").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(MATCH_CENTER_BUTTONS.myMatches).setLabel("My Matches").setStyle(ButtonStyle.Secondary),
          ),
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(MATCH_CENTER_BUTTONS.leaderboard).setLabel("Leaderboard").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(MATCH_CENTER_BUTTONS.support).setLabel("Support").setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
    },
  },
];
