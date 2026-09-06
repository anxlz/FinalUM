/**
 * `/profile` and `/teamprofile` — a Components V2 card with the avatar/logo as a thumbnail
 * accessory, points, roster status, and the three most recent matches. Presence
 * (online/idle/dnd) would need the privileged GuildPresences gateway intent, which this
 * bot deliberately doesn't request (§9 in main.ts — no privileged intents); "status" here
 * is roster activity (Active/Inactive), the status this bot actually has data for.
 */

import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { matchPlayers, matches, players, type Player } from "../db/schema";
import { replyError } from "../lib/embeds";
import { getPlayerTotal, getTeamTotal } from "../points/point-transaction.service";
import { discordTimestamp } from "../lib/datetime";
import { findTeamByName, getTeam, searchTeams } from "../teams/team.service";
import { queryMatchHistory } from "../matches/match.service";
import { BRAND_COLOR, CV2, container, divider, sectionWithThumbnail, text } from "../lib/ui-kit";
import type { CommandModule } from "./types";

function findPlayerByDiscordId(guildId: string, discordId: string): Player | undefined {
  return getDb()
    .select()
    .from(players)
    .where(and(eq(players.guildId, guildId), eq(players.discordId, discordId), eq(players.active, true)))
    .get();
}

function recentMatchLines(playerId: string): string[] {
  const rows = getDb()
    .select({ match: matches })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .where(eq(matchPlayers.playerId, playerId))
    .orderBy(desc(matches.scheduledAt))
    .limit(3)
    .all();

  if (rows.length === 0) return ["No matches yet."];
  return rows.map(({ match }) => {
    const home = getTeam(match.homeTeamId)?.name ?? "Unknown";
    const away = getTeam(match.awayTeamId)?.name ?? "Unknown";
    const outcome =
      match.resultStatus === "COMPLETED"
        ? match.winnerTeamId === match.homeTeamId
          ? `${home} won`
          : `${away} won`
        : match.resultStatus.replace(/_/g, " ").toLowerCase();
    return `${match.publicMatchId} — ${home} vs ${away} • ${outcome} • ${discordTimestamp(match.scheduledAt, "f")}`;
  });
}

const profile = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("Show a player's profile: status, points and recent matches")
  .addUserOption((o) => o.setName("user").setDescription("Defaults to you"));

const teamProfile = new SlashCommandBuilder()
  .setName("teamprofile")
  .setDescription("Show a team's profile: points, roster and recent matches")
  .addStringOption((o) => o.setName("team").setDescription("Team name").setRequired(true).setAutocomplete(true));

async function autocompleteTeam(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) return void interaction.respond([]);
  const results = searchTeams(interaction.guildId, interaction.options.getFocused(), 25);
  await interaction.respond(results.map((t) => ({ name: t.tag ? `${t.name} [${t.tag}]` : t.name, value: t.name })));
}

export const profileCommands: CommandModule[] = [
  {
    data: profile,
    async execute(interaction: ChatInputCommandInteraction) {
      const target = interaction.options.getUser("user") ?? interaction.user;
      const player = findPlayerByDiscordId(interaction.guildId!, target.id);
      if (!player) {
        return replyError(
          interaction,
          target.id === interaction.user.id
            ? "You're not on a registered roster in this league."
            : "That user isn't on a registered roster in this league.",
        );
      }

      const team = getTeam(player.teamId);
      const points = getPlayerTotal(player.id);

      await interaction.reply({
        components: [
          container(
            [
              sectionWithThumbnail(
                [
                  `# ${player.ign}`,
                  `**Team:** ${team?.name ?? "Unknown"}${team?.tag ? ` [${team.tag}]` : ""}`,
                  `**Role:** ${player.role}`,
                ],
                target.displayAvatarURL({ extension: "png", size: 256 }),
                `${player.ign}'s avatar`,
              ),
              text(`**Status:** ${player.active ? "Active" : "Inactive"}\n**Points:** ${points}`),
              divider(),
              text(`**Recent Matches**\n${recentMatchLines(player.id).join("\n")}`),
            ],
            BRAND_COLOR,
          ),
        ],
        flags: CV2,
      });
    },
  },

  {
    data: teamProfile,
    autocomplete: autocompleteTeam,
    async execute(interaction: ChatInputCommandInteraction) {
      const name = interaction.options.getString("team", true);
      const team = findTeamByName(interaction.guildId!, name);
      if (!team) return replyError(interaction, `No team named "${name}" is registered.`);

      const points = getTeamTotal(team.id);
      const { rows } = queryMatchHistory({ guildId: interaction.guildId!, teamId: team.id, limit: 3, offset: 0 });
      const recentLines =
        rows.length === 0
          ? ["No matches yet."]
          : rows.map(
              (r) =>
                `${r.match.publicMatchId} — ${r.homeTeam.name} vs ${r.awayTeam.name} • ${discordTimestamp(r.match.scheduledAt, "f")}`,
            );

      await interaction.reply({
        components: [
          container(
            [
              sectionWithThumbnail(
                [
                  `# ${team.name}${team.tag ? ` [${team.tag}]` : ""}`,
                  `**Region:** ${team.region ?? "Not set"}`,
                  `**Tier:** ${team.tier ?? "Not set"}`,
                ],
                team.logoUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png",
                `${team.name} logo`,
              ),
              text(`**Points:** ${points}\n**Status:** ${team.active ? "Active" : "Inactive"}`),
              divider(),
              text(`**Recent Matches**\n${recentLines.join("\n")}`),
            ],
            BRAND_COLOR,
          ),
        ],
        flags: CV2,
      });
    },
  },
];
