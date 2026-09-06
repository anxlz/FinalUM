import {
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type GuildMember,
} from "discord.js";
import { commandsByName } from "../commands";
import {
  HISTORY_PAGE_SIZE,
  decodeHistoryScope,
  encodeHistoryScope,
  historyScopeLabel,
} from "../commands/match.commands";
import {
  BUTTON_IDS,
  buildMyMatchesMessage,
  buildMatchButtons,
  buildMatchEmbed,
} from "../discord/discord-match-embed.service";
import { replyError, updateInPlace, buildEmbed } from "../lib/embeds";
import { CV2 } from "../lib/ui-kit";
import {
  handleApplicationModal,
  handlePhase234Button,
  handleSelectMenu,
} from "./phase234-router";
import {
  handleWizardButton,
  handleWizardModal,
  handleWizardSelect,
  isWizardComponent,
} from "./match-wizard";
import {
  handleBoardButton,
  handleBoardSelect,
  isBoardComponent,
} from "./leaderboard-interactions";
import { MATCH_CENTER_BUTTONS } from "../commands/match-center.commands";
import { MATCH_ROOM_BUTTONS } from "../discord/match-room.service";
import { buildBoardPayload, DEFAULT_STATE } from "../leaderboard/board.service";
import { getConfig } from "../lib/automation-config";
import { logger } from "../lib/logger";
import { hasManagerPermission } from "../lib/permissions";
import {
  MatchServiceError,
  cancelMatch,
  confirmMatch,
  getMatch,
  queryMatchHistory,
} from "../matches/match.service";
import { runPostConfirmationAutomation } from "../matches/post-confirmation.service";
import { getTeam, findTeamsForMember } from "../teams/team.service";
import { beginCreateMatchWizard } from "./match-wizard";
import { HUB_ACTION_SELECT, HUB_ACTION_VALUES, buildSupportMessage } from "../commands/match-hub.commands";
import type { ButtonInteraction as BI, StringSelectMenuInteraction } from "discord.js";

/** The four Match Center actions, reachable identically from /matchcenter's buttons and
 *  the /setcenterchannel hub's select menu — both end up here. */
async function handleMatchCenterAction(
  interaction: BI | StringSelectMenuInteraction,
  action: "create_match" | "my_matches" | "leaderboard" | "support",
): Promise<void> {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;

  if (action === "create_match") {
    await beginCreateMatchWizard(interaction);
    return;
  }

  if (action === "my_matches") {
    const owned = findTeamsForMember(guildId, member.id).filter((t) => t.captainDiscordId === member.id);
    const teamId = owned[0]?.id ?? null;
    const { rows, total } = queryMatchHistory({ guildId, teamId, limit: HISTORY_PAGE_SIZE, offset: 0 });
    const message = await buildMyMatchesMessage(
      { guildId, rows, total, offset: 0, pageSize: HISTORY_PAGE_SIZE, scopeLabel: historyScopeLabel(teamId, null) },
      owned[0]?.name ?? null,
      encodeHistoryScope(teamId, null),
    );
    await interaction.reply({ ...message, flags: CV2 | MessageFlags.Ephemeral } as never);
    return;
  }

  if (action === "leaderboard") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const payload = await buildBoardPayload(guildId, DEFAULT_STATE, interaction.client, false);
    await interaction.editReply(payload);
    return;
  }

  const message = await buildSupportMessage(guildId);
  await interaction.reply(message as never);
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (isWizardComponent(interaction.customId)) return void (await handleWizardButton(interaction));
  if (isBoardComponent(interaction.customId)) return void (await handleBoardButton(interaction));
  if (await handlePhase234Button(interaction)) return;

  const [namespace, action, ...rest] = interaction.customId.split(":");
  const prefix = `${namespace}:${action}`;
  const member = interaction.member as GuildMember;

  if (prefix === BUTTON_IDS.confirm || prefix === BUTTON_IDS.decline) {
    const matchId = rest[0]!;
    const match = getMatch(matchId);
    if (!match || match.guildId !== interaction.guildId) {
      return replyError(interaction, "That match no longer exists.");
    }

    const homeTeam = getTeam(match.homeTeamId)!;
    const awayTeam = getTeam(match.awayTeamId)!;

    try {
      if (prefix === BUTTON_IDS.confirm) {
        const confirmed = confirmMatch(
          interaction.guildId!,
          matchId,
          member.id,
          hasManagerPermission(member),
        );

        await interaction.deferUpdate();

        const automation = await runPostConfirmationAutomation(
          interaction.guild!,
          confirmed,
          homeTeam,
          awayTeam,
          member.id,
        );

        const notes = ["Both teams are locked in."];
        if (automation.ticketChannelId) notes.push(`Ticket: <#${automation.ticketChannelId}>`);
        notes.push(...automation.warnings);

        const refreshed = getMatch(matchId)!;
        await interaction.editReply({
          content: "",
          embeds: [
            buildMatchEmbed({
              match: refreshed,
              homeTeam,
              awayTeam,
              note: notes.join(" "),
            }),
          ],
          components: buildMatchButtons(refreshed),
        });
        return;
      }

      const isParticipantCaptain =
        homeTeam.captainDiscordId === member.id || awayTeam.captainDiscordId === member.id;
      if (!isParticipantCaptain && !hasManagerPermission(member)) {
        return replyError(
          interaction,
          "Only a participating captain or staff can decline this match.",
        );
      }

      const cancelled = cancelMatch(
        interaction.guildId!,
        matchId,
        member.id,
        "Declined by the opposing team",
      );
      return updateInPlace(interaction, {
        content: "",
        embeds: [buildMatchEmbed({ match: cancelled, homeTeam, awayTeam })],
        components: [],
      });
    } catch (error) {
      if (error instanceof MatchServiceError) return replyError(interaction, error.message);
      throw error;
    }
  }

  if (prefix === BUTTON_IDS.historyPrev || prefix === BUTTON_IDS.historyNext) {
    const offset = Math.max(0, Number(rest[0] ?? 0));
    const scopeToken = rest.slice(1).join(":");
    const { teamId, status } = decodeHistoryScope(scopeToken);

    const { rows, total } = queryMatchHistory({
      guildId: interaction.guildId!,
      teamId,
      statuses: status ? [status as never] : undefined,
      limit: HISTORY_PAGE_SIZE,
      offset,
    });

    const message = await buildMyMatchesMessage(
      {
        guildId: interaction.guildId!,
        rows,
        total,
        offset,
        pageSize: HISTORY_PAGE_SIZE,
        scopeLabel: historyScopeLabel(teamId, status),
      },
      teamId ? (getTeam(teamId)?.name ?? null) : null,
      encodeHistoryScope(teamId, status),
    );
    return updateInPlace(interaction, { ...message, flags: CV2 } as never);
  }

  if (prefix === MATCH_ROOM_BUTTONS.submitResult) {
    const matchId = rest[0]!;
    const match = getMatch(matchId);
    if (!match) return replyError(interaction, "Match not found.");
    // Discord modals only support text inputs — there is no way to collect file
    // attachments from a popup, so the actual submission still goes through the slash
    // command, which does accept a screenshot option directly.
    await interaction.reply({
      embeds: [
        buildEmbed({
          title: "Submit Result",
          description: `Attach your scoreboard screenshot and run:\n\`/matchresult match_id:${match.publicMatchId} screenshot:<your screenshot>\``,
          tone: "brand",
          guildId: interaction.guildId,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (prefix === MATCH_ROOM_BUTTONS.details) {
    const matchId = rest[0]!;
    const match = getMatch(matchId);
    if (!match) return replyError(interaction, "Match not found.");
    const homeTeam = getTeam(match.homeTeamId)!;
    const awayTeam = getTeam(match.awayTeamId)!;
    await interaction.reply({
      embeds: [buildMatchEmbed({ match, homeTeam, awayTeam })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (prefix === MATCH_ROOM_BUTTONS.requestStaff) {
    const matchId = rest[0]!;
    const match = getMatch(matchId);
    if (!match) return replyError(interaction, "Match not found.");
    const staffRoleId = getConfig(interaction.guildId!, "ticket_staff_role_id");
    await interaction.reply({
      content: staffRoleId ? `<@&${staffRoleId}>` : undefined,
      embeds: [
        buildEmbed({
          title: "Staff Requested",
          description: `<@${interaction.user.id}> asked for staff on ${match.publicMatchId}.`,
          tone: "pending",
          guildId: interaction.guildId,
        }),
      ],
    });
    return;
  }

  if (prefix === MATCH_CENTER_BUTTONS.myMatches) {
    return void (await handleMatchCenterAction(interaction, HUB_ACTION_VALUES.myMatches));
  }

  if (prefix === MATCH_CENTER_BUTTONS.leaderboard) {
    return void (await handleMatchCenterAction(interaction, HUB_ACTION_VALUES.leaderboard));
  }

  if (prefix === MATCH_CENTER_BUTTONS.support) {
    return void (await handleMatchCenterAction(interaction, HUB_ACTION_VALUES.support));
  }

  logger.warn("unhandled button", { customId: interaction.customId });
  await interaction.reply({
    content: "That control is no longer active.",
    flags: MessageFlags.Ephemeral,
  });
}

export async function routeInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.guildId && !interaction.isAutocomplete()) {
    if (interaction.isRepliable()) {
      await interaction.reply({
        content: "These commands only work inside a server.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  try {
    if (interaction.isAutocomplete()) {
      const command = commandsByName.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commandsByName.get(interaction.commandName);
      if (!command) {
        logger.warn("unknown command", { name: interaction.commandName });
        return;
      }
      logger.info("command", {
        name: interaction.commandName,
        guildId: interaction.guildId,
        userId: interaction.user.id,
      });
      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (isWizardComponent(interaction.customId)) await handleWizardSelect(interaction);
      else if (isBoardComponent(interaction.customId)) await handleBoardSelect(interaction);
      else if (interaction.customId === HUB_ACTION_SELECT) {
        await handleMatchCenterAction(interaction, interaction.values[0] as never);
      } else await handleSelectMenu(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (isWizardComponent(interaction.customId)) await handleWizardModal(interaction);
      else await handleApplicationModal(interaction);
    }
  } catch (error) {
    logger.error("interaction failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      customId: interaction.isButton() ? interaction.customId : undefined,
      command: interaction.isChatInputCommand() ? interaction.commandName : undefined,
    });

    if (interaction.isRepliable()) {
      const payload = {
        content: "Something went wrong handling that. Staff have it in the logs.",
        flags: MessageFlags.Ephemeral as const,
      };
      try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
      } catch {
        // The interaction token expired — nothing useful left to do.
      }
    }
  }
}
