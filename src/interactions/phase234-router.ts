/**
 * Phase 2-4 interaction handlers: application flow, slot resolution modals, approval
 * buttons, and the leaderboard view switch.
 */

import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { getConfig } from "../lib/automation-config";
import { buildEmbed, replyError, successEmbed, updateInPlace } from "../lib/embeds";
import { hasManagerPermission } from "../lib/permissions";
import {
  ApplicationError,
  addApplicationPlayer,
  approveApplication,
  recordReviewMessage,
  rejectApplication,
  startApplication,
  submitApplication,
} from "../applications/application.service";
import { APPLICATION_BUTTONS } from "../commands/application.commands";
import { buildApplicationReviewMessage, buildRosterConfirmMessage } from "../applications/application-view.service";
import { CV2, container, text, BRAND_COLOR } from "../lib/ui-kit";
import {
  RESULT_BUTTONS,
  buildResultEmbed,
  buildSlotResolutionComponents,
  buildSlotResolutionEmbed,
} from "../discord/result-embed.service";
import { ApprovalError, approveMatchResult, rejectMatchResult } from "../approvals/approval.service";
import { getMatch } from "../matches/match.service";
import { recalculateWithResolvedSlots } from "../matches/result.service";
import { listPendingSlots, resolveSlot } from "../players/pending-player.service";
import { getRoster, getTeam } from "../teams/team.service";
import type { TeamScoringResult } from "../scoring/scoring.types";
import { logger } from "../lib/logger";

/* ------------------------------------------------------------------ *
 * Applications
 * ------------------------------------------------------------------ */

const APPLY_MODAL = "app:modal";
const APPLY_PLAYER_MODAL = "app:playermodal";

function applicationModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(APPLY_MODAL)
    .setTitle("Team Application")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("team_name")
          .setLabel("Team name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(64),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("region")
          .setLabel("Region (NA, SA, EU, ME, AFRICA, INDIA...)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("tier")
          .setLabel("Tier or division")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(32),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("logo_url")
          .setLabel("Logo image URL")
          .setStyle(TextInputStyle.Short)
          .setRequired(false),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("captain_ign")
          .setLabel("Your in-game name (captain)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32),
      ),
    );
}

function playerModal(applicationId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${APPLY_PLAYER_MODAL}:${applicationId}`)
    .setTitle("Add Roster Players");

  for (let i = 1; i <= 4; i += 1) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`player_${i}`)
          .setLabel(`Player ${i} — IGN and UID`)
          .setPlaceholder("7Suro, 1234567890")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(80),
      ),
    );
  }
  return modal;
}

async function handleApplicationButton(interaction: ButtonInteraction): Promise<void> {
  const [namespace, action, ...rest] = interaction.customId.split(":");
  const prefix = `${namespace}:${action}`;
  const member = interaction.member as GuildMember;

  if (prefix === APPLICATION_BUTTONS.start) {
    return interaction.showModal(applicationModal());
  }

  if (prefix === APPLICATION_BUTTONS.approve || prefix === APPLICATION_BUTTONS.reject) {
    if (!hasManagerPermission(member)) {
      return replyError(interaction, "Only league staff can review applications.");
    }

    const applicationId = rest[0]!;
    try {
      if (prefix === APPLICATION_BUTTONS.approve) {
        const { application } = approveApplication(applicationId, member.id);

        await updateInPlace(
          interaction,
          (await buildApplicationReviewMessage(interaction.client, applicationId)) as never,
        );

        try {
          const user = await interaction.client.users.fetch(application.applicantDiscordId);
          await user.send({
            embeds: [
              successEmbed(
                "Application Approved",
                `Your team "${application.teamName}" has been approved and is now registered.`,
              ),
            ],
          });
        } catch {
          logger.info("applicant has DMs closed", { applicationId });
        }
        return;
      }

      const application = rejectApplication(applicationId, member.id, "Rejected by staff");
      await updateInPlace(
        interaction,
        (await buildApplicationReviewMessage(interaction.client, applicationId)) as never,
      );

      try {
        const user = await interaction.client.users.fetch(application.applicantDiscordId);
        await user.send({
          embeds: [
            buildEmbed({
              title: "Application Not Approved",
              description: `Your application for "${application.teamName}" was not approved. Contact league staff if you would like to know more.`,
            }),
          ],
        });
      } catch {
        logger.info("applicant has DMs closed", { applicationId });
      }
    } catch (error) {
      if (error instanceof ApplicationError) return replyError(interaction, error.message);
      throw error;
    }
  }
}

export async function handleApplicationModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId === APPLY_MODAL) {
    try {
      const application = startApplication({
        guildId: interaction.guildId!,
        applicantDiscordId: interaction.user.id,
        teamName: interaction.fields.getTextInputValue("team_name"),
        region: interaction.fields.getTextInputValue("region")?.toUpperCase() || null,
        tier: interaction.fields.getTextInputValue("tier") || null,
        logoUrl: interaction.fields.getTextInputValue("logo_url") || null,
      });

      addApplicationPlayer(
        application.id,
        interaction.fields.getTextInputValue("captain_ign"),
        null,
        interaction.user.id,
        true,
      );

      const message = await buildRosterConfirmMessage(interaction.client, application.id);
      await interaction.reply({ ...message, flags: CV2 | MessageFlags.Ephemeral } as never);
    } catch (error) {
      if (error instanceof ApplicationError) {
        return void (await interaction.reply({
          content: error.message,
          flags: MessageFlags.Ephemeral,
        }));
      }
      throw error;
    }
    return;
  }

  if (interaction.customId.startsWith(APPLY_PLAYER_MODAL)) {
    const applicationId = interaction.customId.split(":")[2]!;

    for (let i = 1; i <= 4; i += 1) {
      const raw = interaction.fields.getTextInputValue(`player_${i}`)?.trim();
      if (!raw) continue;
      const [ign, uid] = raw.split(",").map((part) => part.trim());
      if (!ign) continue;
      try {
        addApplicationPlayer(applicationId, ign, uid ?? null, null, false);
      } catch {
        // Ignored here — the regenerated roster image below is the source of truth for
        // what actually got added; a per-line failure (duplicate IGN, roster full) just
        // means that one line doesn't show up in it.
      }
    }

    // Re-render "ROSTER CONFIRM" with the fresh roster (§4 — refresh on any change). The
    // modal was opened from the roster-confirm message itself, so its submission can edit
    // that same message in place rather than posting a new one.
    const message = await buildRosterConfirmMessage(interaction.client, applicationId);
    if (interaction.isFromMessage()) {
      await interaction.update({ ...message, flags: CV2 } as never);
    } else {
      await interaction.reply({ ...message, flags: CV2 | MessageFlags.Ephemeral } as never);
    }
    return;
  }

  if (interaction.customId.startsWith("slot:stats")) {
    const slotId = interaction.customId.split(":")[2]!;
    const playerId = interaction.customId.split(":")[3]!;

    const parse = (key: string): number => {
      const value = Number(interaction.fields.getTextInputValue(key).trim());
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${key} must be a whole number of zero or more.`);
      }
      return value;
    };

    try {
      const stats = {
        objectiveTimeSeconds: parse("obj"),
        kills: parse("kills"),
        deaths: parse("deaths"),
        assists: parse("assists"),
      };
      const slot = resolveSlot(slotId, playerId, interaction.user.id, stats);
      recalculateWithResolvedSlots(slot.matchId, interaction.user.id);

      const remaining = listPendingSlots(slot.matchId);
      const match = getMatch(slot.matchId)!;

      await interaction.reply({
        embeds: [
          successEmbed(
            "Slot Resolved",
            remaining.length > 0
              ? `${remaining.length} slot(s) still pending for ${match.publicMatchId}. Points are awarded only after every slot is resolved and staff approve.`
              : `Every slot for ${match.publicMatchId} is resolved. Run /matchapprove ${match.publicMatchId} to review and award points.`,
          ),
        ],
        components:
          remaining.length > 0
            ? buildSlotResolutionComponents(
                remaining[0]!,
                getRoster(remaining[0]!.teamId ?? match.homeTeamId),
              )
            : [],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        content: error instanceof Error ? error.message : String(error),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Slot resolution select menu
 * ------------------------------------------------------------------ */

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const member = interaction.member as GuildMember;

  if (interaction.customId.startsWith(RESULT_BUTTONS.selectPlayer)) {
    if (!hasManagerPermission(member)) {
      return replyError(interaction, "Only league staff can resolve player identities.");
    }

    const slotId = interaction.customId.split(":")[2]!;
    const playerId = interaction.values[0]!;

    const modal = new ModalBuilder()
      .setCustomId(`slot:stats:${slotId}:${playerId}`)
      .setTitle("Enter Player Statistics")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("obj")
            .setLabel("Objective time (seconds)")
            .setPlaceholder("80")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("kills")
            .setLabel("Kills")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("deaths")
            .setLabel("Deaths")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("assists")
            .setLabel("Assists")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );

    await interaction.showModal(modal);
  }
}

/* ------------------------------------------------------------------ *
 * Result approval + leaderboard switching
 * ------------------------------------------------------------------ */

export async function handlePhase234Button(interaction: ButtonInteraction): Promise<boolean> {
  const [namespace, action, ...rest] = interaction.customId.split(":");
  const prefix = `${namespace}:${action}`;
  const member = interaction.member as GuildMember;

  if (namespace === "app") {
    if (action === "addplayers") {
      await interaction.showModal(playerModal(rest[0]!));
      return true;
    }
    if (action === "submit") {
      try {
        const application = submitApplication(rest[0]!);

        const reviewChannelId = getConfig(interaction.guildId!, "application_review_channel_id");
        if (reviewChannelId) {
          const channel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);
          if (channel?.isTextBased() && "send" in channel) {
            const message = await buildApplicationReviewMessage(interaction.client, application.id);
            const sent = await channel.send(message as never);
            recordReviewMessage(application.id, sent.channelId, sent.id);
          }
        }

        await updateInPlace(interaction, {
          components: [
            container(
              [
                text(`# Application ${application.publicRef} Submitted`),
                text("Staff will review it shortly. You will be notified of the outcome."),
              ],
              BRAND_COLOR,
            ),
          ],
          files: [],
          flags: CV2,
        } as never);
      } catch (error) {
        if (error instanceof ApplicationError) {
          await replyError(interaction, error.message);
          return true;
        }
        throw error;
      }
      return true;
    }

    await handleApplicationButton(interaction);
    return true;
  }

  if (prefix === RESULT_BUTTONS.approve || prefix === RESULT_BUTTONS.reject) {
    if (!hasManagerPermission(member)) {
      await replyError(interaction, "Only league staff can approve or reject a result.");
      return true;
    }

    const matchId = rest[0]!;
    try {
      if (prefix === RESULT_BUTTONS.approve) {
        const result = approveMatchResult(interaction.guildId!, matchId, member.id);
        const homeTeam = getTeam(result.match.homeTeamId)!;
        const awayTeam = getTeam(result.match.awayTeamId)!;
        const breakdown = result.match.teamPointsBreakdown as TeamScoringResult;

        await updateInPlace(interaction, {
          embeds: [
            buildResultEmbed({
              match: result.match,
              homeTeam,
              awayTeam,
              scoring: breakdown,
              pendingSlots: [],
              warnings: [`Approved by <@${member.id}> — ${result.playerRows} player transaction(s) created.`],
            }),
          ],
          components: [],
        });
      } else {
        const match = rejectMatchResult(interaction.guildId!, matchId, member.id, "Rejected by staff");
        await updateInPlace(interaction, {
          embeds: [
            buildEmbed({
              title: "Result Rejected",
              description: `${match.publicMatchId} was rejected. No points were awarded.`,
            }),
          ],
          components: [],
        });
      }
    } catch (error) {
      if (error instanceof ApprovalError) {
        await replyError(interaction, error.message);
        return true;
      }
      throw error;
    }
    return true;
  }

  if (prefix === `${RESULT_BUTTONS.resolveSlot}`) {
    const matchId = rest[0]!;
    const match = getMatch(matchId);
    if (!match) {
      await replyError(interaction, "Match not found.");
      return true;
    }
    const pending = listPendingSlots(matchId);
    if (pending.length === 0) {
      await replyError(interaction, "Nothing left to resolve.");
      return true;
    }
    await updateInPlace(interaction, {
      embeds: [buildSlotResolutionEmbed(match, pending)],
      components: buildSlotResolutionComponents(
        pending[0]!,
        getRoster(pending[0]!.teamId ?? match.homeTeamId),
      ),
    });
    return true;
  }

  return false;
}
