import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type EmbedBuilder,
} from "discord.js";
import type { Match, Player, Team, UnresolvedSlot } from "../db/schema";
import { buildEmbed, chip, field } from "../lib/embeds";
import type { TeamScoringResult } from "../scoring/scoring.types";

export const RESULT_BUTTONS = {
  approve: "result:approve",
  reject: "result:reject",
  resolveSlot: "result:resolve",
  selectPlayer: "result:selectplayer",
} as const;

export interface ResultEmbedOptions {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  scoring: TeamScoringResult;
  pendingSlots: UnresolvedSlot[];
  warnings: string[];
}

export function buildResultEmbed(options: ResultEmbedOptions): EmbedBuilder {
  const { match, homeTeam, awayTeam, scoring } = options;

  const leftIsHome = match.leftTeamId === homeTeam.id;
  const leftTeam = leftIsHome ? homeTeam : awayTeam;
  const rightTeam = leftIsHome ? awayTeam : homeTeam;

  const winnerIsLeft = scoring.winnerTeamId === leftTeam.id;
  const leftPoints = winnerIsLeft ? scoring.winnerPoints : scoring.loserPoints;
  const rightPoints = winnerIsLeft ? scoring.loserPoints : scoring.winnerPoints;

  const lines: string[] = [];

  if (match.streamerModeEnabled) {
    lines.push(
      chip(
        "Streamer Mode",
        "some scoreboard identities are anonymous — player points cannot be assigned to them automatically.",
      ),
    );
  }

  if (scoring.requiresCalibrationReview) {
    lines.push(
      chip(
        "Calibration",
        `${scoring.notes.join(" ")} Team points below are a fallback, not a calibrated result.`,
      ),
    );
  }

  for (const warning of options.warnings) {
    if (!scoring.notes.includes(warning)) lines.push(warning);
  }

  const fields = [
    field("Match ID", match.publicMatchId, true),
    field("Mode", match.mode ?? "unknown", true),
    field("Map", match.map ?? "—", true),
    field(leftTeam.name, `${match.leftScore ?? "—"}`, true),
    field(rightTeam.name, `${match.rightScore ?? "—"}`, true),
    field("Score Gap", `${scoring.scoreGap} (${(scoring.gapPercentage * 100).toFixed(1)}%)`, true),
    field(
      "Team Points",
      `${leftTeam.name} ${leftPoints > 0 ? "+" : ""}${leftPoints} / ${rightTeam.name} ${rightPoints > 0 ? "+" : ""}${rightPoints}`,
      false,
    ),
    field("Status", match.resultStatus.replace(/_/g, " "), true),
    field("Scoring Version", match.scoringVersion ?? "—", true),
    field("Calibration", scoring.confidence.replace(/_/g, " "), true),
  ];

  if (options.pendingSlots.length > 0) {
    const grouped = options.pendingSlots.map((slot) => {
      const where = slot.slot ? `Slot ${slot.slot}` : (slot.ocrName ?? "Unknown");
      return `• ${where} — ${slot.reason.replace(/_/g, " ").toLowerCase()}`;
    });
    fields.push(field("Pending Players", grouped.join("\n"), false));
  }

  return buildEmbed({
    title: "Match Result",
    description: lines.length > 0 ? lines.join("\n\n") : `${leftTeam.name} vs ${rightTeam.name}`,
    tone:
      match.resultStatus === "COMPLETED"
        ? "confirmed"
        : scoring.requiresCalibrationReview || match.streamerModeEnabled
          ? "pending"
          : "brand",
    guildId: match.guildId,
    fields,
    footer: `${match.publicMatchId} • points are awarded only after staff approval`,
  });
}

export function buildSlotResolutionComponents(
  slot: UnresolvedSlot,
  roster: Player[],
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const options = roster.slice(0, 25).map((player) => ({
    label: player.ign.slice(0, 100),
    value: player.id,
    description: player.uid ? `UID ${player.uid}` : undefined,
  }));

  if (options.length === 0) return [];

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${RESULT_BUTTONS.selectPlayer}:${slot.id}`)
        .setPlaceholder("Select the real registered player")
        .addOptions(options),
    ),
  ];
}

export function buildSlotResolutionEmbed(
  match: Match,
  slots: UnresolvedSlot[],
): EmbedBuilder {
  const streamerMode = slots.filter((s) => s.reason === "STREAMER_MODE");

  const lines: string[] = [];
  if (streamerMode.length > 0) {
    lines.push(
      chip(
        "Streamer Mode",
        "the names below are scoreboard labels, not confirmed identities.",
      ),
    );
  }
  lines.push("Select the registered player for each slot, then enter their statistics.");

  return buildEmbed({
    title: "Player Identity Resolution Required",
    description: lines.join("\n\n"),
    tone: "pending",
    guildId: match.guildId,
    fields: slots.map((slot) =>
      field(
        slot.slot ? `Slot ${slot.slot} (${slot.side})` : (slot.ocrName ?? "Missing player"),
        `${slot.reason.replace(/_/g, " ").toLowerCase()}${slot.ocrName ? ` — scoreboard showed "${slot.ocrName}"` : ""}`,
        false,
      ),
    ),
    footer: `${match.publicMatchId} • ${slots.length} slot(s) pending`,
  });
}

export function buildApprovalEmbed(
  match: Match,
  summary: { players: number; teamPoints: string },
  streamerMode: boolean,
): EmbedBuilder {
  const lines = ["Review the calculated result. Points are created only on approval."];
  if (streamerMode) {
    lines.push(chip("Streamer Mode", "these players were displayed anonymously; scoreboard names were not used as identities."));
  }

  return buildEmbed({
    title: streamerMode ? "Streamer Mode Player Approval" : "Match Result Approval",
    description: lines.join("\n\n"),
    tone: "pending",
    guildId: match.guildId,
    fields: [
      field("Match", match.publicMatchId, true),
      field("Players Scored", String(summary.players), true),
      field("Team Points", summary.teamPoints, false),
      field("Scoring Version", match.scoringVersion ?? "—", true),
      field("Calibration", (match.calibrationConfidence ?? "—").replace(/_/g, " "), true),
    ],
    footer: `${match.publicMatchId}`,
  });
}

export function buildApprovalButtons(matchId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${RESULT_BUTTONS.approve}:${matchId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${RESULT_BUTTONS.reject}:${matchId}`)
        .setLabel("Reject")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}
