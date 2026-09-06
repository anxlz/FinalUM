import type { Guild, TextChannel } from "discord.js";
import type { Match, Team } from "../db/schema";
import { getConfig, getToggle } from "../lib/automation-config";
import { logger } from "../lib/logger";
import { buildMatchEmbed } from "../discord/discord-match-embed.service";
import { buildTicketPing, createMatchTicket } from "../tickets/ticket.service";
import { buildMatchRoomMessage } from "../discord/match-room.service";

export interface PostConfirmationResult {
  ticketChannelId: string | null;
  loggedToChannelId: string | null;
  warnings: string[];
}

export async function runPostConfirmationAutomation(
  guild: Guild,
  match: Match,
  homeTeam: Team,
  awayTeam: Team,
  actorDiscordId: string,
): Promise<PostConfirmationResult> {
  const warnings: string[] = [];
  let ticketChannelId: string | null = null;
  let loggedToChannelId: string | null = null;

  if (getToggle(guild.id, "auto_ticket_creation") && !match.ticketChannelId) {
    try {
      const channel = await createMatchTicket({
        guild,
        match,
        homeTeam,
        awayTeam,
        actorDiscordId,
      });
      ticketChannelId = channel.id;

      await channel.send({ content: buildTicketPing(guild.id, homeTeam, awayTeam) });
      await channel.send(await buildMatchRoomMessage(guild.id, match, homeTeam, awayTeam));
    } catch (error) {
      warnings.push(
        "The match ticket could not be created automatically. Staff can open it with /ticketopen.",
      );
      logger.warn("auto ticket creation failed", {
        matchId: match.publicMatchId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (getToggle(guild.id, "auto_match_logging")) {
    const logChannelId = getConfig(guild.id, "match_announce_channel_id");
    if (logChannelId) {
      try {
        const channel = await guild.channels.fetch(logChannelId);
        if (channel?.isTextBased()) {
          await (channel as TextChannel).send({
            embeds: [
              buildMatchEmbed({
                match,
                homeTeam,
                awayTeam,
                note: ticketChannelId
                  ? `Confirmed. Ticket: <#${ticketChannelId}>`
                  : "Confirmed.",
              }),
            ],
          });
          loggedToChannelId = channel.id;
        } else {
          warnings.push("The configured match log channel is not a text channel.");
        }
      } catch (error) {
        warnings.push("The match could not be logged to the configured channel.");
        logger.warn("auto match logging failed", {
          matchId: match.publicMatchId,
          channelId: logChannelId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { ticketChannelId, loggedToChannelId, warnings };
}
