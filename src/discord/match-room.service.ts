/**
 * The "Match Room" ticket welcome — Components V2, matte container with the Universe Red
 * accent, a status checklist and red/gray action buttons (Submit Result / Match Details /
 * Request Staff), matching the mockups. Built once and reused by both
 * `runPostConfirmationAutomation` (§7.1 auto-open) and `/ticketopen` (manual open).
 */

import { AttachmentBuilder, type MessageCreateOptions } from "discord.js";
import type { Match, Team } from "../db/schema";
import { chip } from "../lib/embeds";
import { discordTimestamp } from "../lib/datetime";
import { buildTicketContext } from "../tickets/ticket.service";
import { getConfig } from "../lib/automation-config";
import { renderTemplate } from "../lib/templates";
import { renderHero } from "../leaderboard/brand-render.service";
import { BRAND_COLOR, CV2, actionRow, container, divider, galleryImage, grayButton, redButton, text } from "../lib/ui-kit";

export const MATCH_ROOM_BUTTONS = {
  submitResult: "matchroom:submit",
  details: "matchroom:details",
  requestStaff: "matchroom:staff",
} as const;

function imageTimestamp(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(date);
}

function checklist(match: Match): string {
  const lines = [
    chip("Match confirmed by both teams"),
    chip("Scheduled", discordTimestamp(match.scheduledAt, "f")),
  ];

  if (match.resultStatus === "AWAITING_SUBMISSION") {
    lines.push(chip("Awaiting result submission"));
  } else if (match.resultStatus === "COMPLETED") {
    lines.push(chip("Result submitted"), chip("Verified by staff"));
  } else if (match.resultStatus === "REJECTED") {
    lines.push(chip("Result submitted"), chip("Rejected — resubmit when ready"));
  } else {
    lines.push(chip("Result submitted"), chip("Awaiting staff verification"));
  }

  return lines.join("\n");
}

export async function buildMatchRoomMessage(
  guildId: string,
  match: Match,
  homeTeam: Team,
  awayTeam: Team,
): Promise<MessageCreateOptions> {
  const context = buildTicketContext(guildId, match, homeTeam, awayTeam);
  const welcome = renderTemplate(getConfig(guildId, "ticket_welcome_message"), context);

  const banner = await renderHero({
    title: `MATCH ROOM — ${match.publicMatchId}`,
    subtitle: imageTimestamp(match.scheduledAt, match.scheduledTimezone),
    matchup: {
      home: { name: homeTeam.name, logoUrl: homeTeam.logoUrl },
      away: { name: awayTeam.name, logoUrl: awayTeam.logoUrl },
    },
    footer: match.category,
  });
  const attachment = new AttachmentBuilder(banner, { name: "match-room.png" });

  return {
    components: [
      container([
        galleryImage("match-room.png", `${homeTeam.name} vs ${awayTeam.name}`),
        divider(),
        text(welcome),
        divider(),
        text(checklist(match)),
        divider(),
        text(`**Kickoff:** ${discordTimestamp(match.scheduledAt, "F")}\n**Category:** ${match.category}`),
        actionRow(
          redButton(`${MATCH_ROOM_BUTTONS.submitResult}:${match.id}`, "Submit Result"),
          grayButton(`${MATCH_ROOM_BUTTONS.details}:${match.id}`, "Match Details"),
          grayButton(`${MATCH_ROOM_BUTTONS.requestStaff}:${match.id}`, "Request Staff"),
        ),
      ], BRAND_COLOR),
    ],
    files: [attachment],
    flags: CV2,
  };
}
