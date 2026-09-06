/**
 * §7.5 leaderboards — Components V2 board with a View select, a Filter By select, and
 * pagination, shared by the one-off `/leaderboard` snapshot and the persistent
 * `/leaderboardlive` board that a 30s watcher (leaderboard/live-refresh.ts) edits in place.
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getConfig, setConfig } from "../lib/automation-config";
import { field, replyError, successEmbed, buildEmbed } from "../lib/embeds";
import { hasManagerPermission } from "../lib/permissions";
import { DEFAULT_STATE, buildBoardPayload, encodeState } from "../leaderboard/board.service";
import type { CommandModule } from "./types";

const leaderboard = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Show a one-off snapshot of the team or player leaderboard")
  .addStringOption((o) =>
    o.setName("view").setDescription("Team or player standings").addChoices(
      { name: "Teams", value: "team" },
      { name: "Players", value: "player" },
    ),
  );

const leaderboardLive = new SlashCommandBuilder()
  .setName("leaderboardlive")
  .setDescription("Post a leaderboard board that refreshes itself every 30s (staff)")
  .addSubcommand((s) =>
    s
      .setName("start")
      .setDescription("Post (or replace) the live board in the configured leaderboard channel")
      .addChannelOption((o) => o.setName("channel").setDescription("Override the configured leaderboard channel")),
  )
  .addSubcommand((s) => s.setName("stop").setDescription("Stop refreshing the live board"));

const leaderboardChannel = new SlashCommandBuilder()
  .setName("setleaderboardchannel")
  .setDescription("Set — and immediately post — the live leaderboard board (staff)")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true));

const leaderboardStyle = new SlashCommandBuilder()
  .setName("leaderboardstyle")
  .setDescription("Switch leaderboards between static images and animated GIFs (staff)")
  .addStringOption((o) =>
    o
      .setName("style")
      .setDescription("Rendering style")
      .setRequired(true)
      .addChoices(
        { name: "Static image (PNG)", value: "static" },
        { name: "Animated (GIF)", value: "animated" },
      ),
  );

async function startLiveBoard(
  interaction: ChatInputCommandInteraction,
  channelId: string,
): Promise<void> {
  const guildId = interaction.guildId!;
  const member = interaction.member as GuildMember;

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) {
    return replyError(interaction, "That channel is not a text channel the bot can post in.");
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const payload = await buildBoardPayload(guildId, DEFAULT_STATE, interaction.client, true);
  const sent = await channel.send(payload);

  setConfig(guildId, "leaderboard_channel_id", channelId as never, member.id);
  setConfig(guildId, "leaderboard_live_channel_id", channelId as never, member.id);
  setConfig(guildId, "leaderboard_live_message_id", sent.id as never, member.id);
  setConfig(guildId, "leaderboard_live_state", encodeState(DEFAULT_STATE) as never, member.id);

  await interaction.editReply({
    embeds: [
      successEmbed(
        "Live Leaderboard Started",
        `Posted in <#${channelId}>. It refreshes in place every 30s — the same message is edited, never resent.`,
      ),
    ],
  });
}

export const leaderboardCommands: CommandModule[] = [
  {
    data: leaderboardStyle,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      const style = interaction.options.getString("style", true);
      setConfig(interaction.guildId!, "leaderboard_style", style as never, member.id);
      await interaction.reply({
        embeds: [
          successEmbed(
            "Leaderboard Style Updated",
            style === "animated"
              ? "Leaderboards will render as animated GIFs, capped at 10 rows per page to stay under Discord's upload limit."
              : "Leaderboards will render as static PNG images.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: leaderboard,
    async execute(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();
      const view = (interaction.options.getString("view") as "team" | "player") ?? "team";
      const payload = await buildBoardPayload(
        interaction.guildId!,
        { ...DEFAULT_STATE, view },
        interaction.client,
        false,
      );
      await interaction.editReply(payload);
    },
  },

  {
    data: leaderboardLive,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const guildId = interaction.guildId!;
      const sub = interaction.options.getSubcommand();

      if (sub === "stop") {
        const hadOne = Boolean(getConfig(guildId, "leaderboard_live_message_id"));
        setConfig(guildId, "leaderboard_live_message_id", "", member.id);
        return void (await interaction.reply({
          embeds: [
            successEmbed(
              "Live Leaderboard Stopped",
              hadOne
                ? "The board will stop refreshing on its next scheduled tick. The message itself is left in place."
                : "There was no live board running.",
            ),
          ],
          flags: MessageFlags.Ephemeral,
        }));
      }

      const channelId =
        interaction.options.getChannel("channel")?.id ?? getConfig(guildId, "leaderboard_channel_id");
      if (!channelId) {
        return replyError(
          interaction,
          "No leaderboard channel is configured. Run /setleaderboardchannel first, or pass a channel option.",
        );
      }
      await startLiveBoard(interaction, channelId);
    },
  },

  {
    data: leaderboardChannel,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      await startLiveBoard(interaction, interaction.options.getChannel("channel", true).id);
    },
  },
];

export function leaderboardSettingsEmbed(guildId: string) {
  return buildEmbed({
    title: "Leaderboard Settings",
    fields: [field("Channel", getConfig(guildId, "leaderboard_channel_id") || "Not set")],
  });
}
