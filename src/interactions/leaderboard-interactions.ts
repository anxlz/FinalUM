/**
 * Handlers for every `board:`-prefixed component: the View select, the Filter By select
 * (which opens a follow-up ephemeral, non-CV2 picker for Region/Tier — the "hidden reply"
 * from the spec), and First/Prev/Next/Last pagination. All of them re-render through
 * `buildBoardPayload` and edit the board message in place.
 */

import {
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { REGIONS } from "../teams/team.service";
import { getConfig, setConfig } from "../lib/automation-config";
import {
  BOARD_PREFIX,
  applyFilterChoice,
  buildBoardPayload,
  decodeState,
  encodeState,
  fetchDistinctTiers,
  type BoardState,
} from "../leaderboard/board.service";

export function isBoardComponent(customId: string): boolean {
  return customId.startsWith(`${BOARD_PREFIX}:`);
}

/** If this message is the live board, a manual change here should also steer what the 30s
 *  watcher renders next — otherwise the next tick would silently revert it. */
function persistIfLive(guildId: string, messageId: string, state: BoardState, actorId: string): void {
  if (getConfig(guildId, "leaderboard_live_message_id") === messageId) {
    setConfig(guildId, "leaderboard_live_state", encodeState(state) as never, actorId);
  }
}

function isLiveMessage(guildId: string, messageId: string): boolean {
  return getConfig(guildId, "leaderboard_live_message_id") === messageId;
}

async function rerender(interaction: StringSelectMenuInteraction | ButtonInteraction, state: BoardState): Promise<void> {
  const live = isLiveMessage(interaction.guildId!, interaction.message.id);
  persistIfLive(interaction.guildId!, interaction.message.id, state, interaction.user.id);
  const payload = await buildBoardPayload(interaction.guildId!, state, interaction.client, live);
  await interaction.update(payload);
}

export async function handleBoardSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const [, action, token] = interaction.customId.split(":");
  const state = decodeState(token!);

  if (action === "view") {
    const view = interaction.values[0] as "team" | "player";
    await rerender(interaction, { ...state, view, sort: "points", page: 0 });
    return;
  }

  if (action === "filter") {
    const choice = interaction.values[0]!;

    if (choice === "region" || choice === "tier") {
      const originalMessageId = interaction.message.id;
      const options =
        choice === "region"
          ? REGIONS.map((r) => ({ label: r, value: r }))
          : (await fetchDistinctTiers(interaction.guildId!)).map((t) => ({ label: t, value: t }));

      if (options.length === 0) {
        await interaction.reply({
          content: choice === "tier" ? "No tiers are set on any team yet." : "No regions found.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const picker = new StringSelectMenuBuilder()
        .setCustomId(`${BOARD_PREFIX}:apply${choice}:${encodeState(state)}:${originalMessageId}`)
        .setPlaceholder(`Choose a ${choice}…`)
        .addOptions(options.slice(0, 25));

      await interaction.reply({
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(picker)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await rerender(interaction, applyFilterChoice(state, choice));
    return;
  }

  if (action === "applyregion" || action === "applytier") {
    const [, , stateToken, messageId] = interaction.customId.split(":");
    const baseState = decodeState(stateToken!);
    const value = interaction.values[0]!;
    const nextState: BoardState =
      action === "applyregion" ? { ...baseState, region: value as never, page: 0 } : { ...baseState, tier: value, page: 0 };

    const channel = interaction.channel;
    if (channel && "messages" in channel) {
      const original = await channel.messages.fetch(messageId!).catch(() => null);
      if (original) {
        const live = isLiveMessage(interaction.guildId!, messageId!);
        persistIfLive(interaction.guildId!, messageId!, nextState, interaction.user.id);
        const payload = await buildBoardPayload(interaction.guildId!, nextState, interaction.client, live);
        await original.edit(payload);
      }
    }

    await interaction.update({ content: "Applied.", components: [] });
  }
}

export async function handleBoardButton(interaction: ButtonInteraction): Promise<void> {
  const [, , direction, token] = interaction.customId.split(":");
  const state = decodeState(token!);

  const next: BoardState =
    direction === "first"
      ? { ...state, page: 0 }
      : direction === "prev"
        ? { ...state, page: Math.max(0, state.page - 1) }
        : direction === "next"
          ? { ...state, page: state.page + 1 }
          : { ...state, page: Number.MAX_SAFE_INTEGER }; // "last" — buildBoardPayload clamps this to the real last page.

  await rerender(interaction, next);
}
