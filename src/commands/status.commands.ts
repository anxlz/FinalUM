/**
 * `/setstatus` — bot presence (type, description, optional Twitch username for Streaming).
 * Presence is global to the one gateway connection, not per-guild, so it's stored under
 * automation-config.ts's GLOBAL_CONFIG_SCOPE sentinel regardless of which guild set it. A
 * 30s watcher (status-refresh.ts) re-applies it on a fixed interval — Discord occasionally
 * resets or rate-limits presence pushes, and periodic re-application is the same pattern
 * already used for the live leaderboard and weekly reset.
 */

import {
  ActivityType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { GLOBAL_CONFIG_SCOPE, setConfig } from "../lib/automation-config";
import { hasManagerPermission } from "../lib/permissions";
import { replyError, successEmbed } from "../lib/embeds";
import { applyStoredPresence } from "../lib/presence";
import type { CommandModule } from "./types";

const TYPE_CHOICES = [
  { name: "Playing", value: "Playing" },
  { name: "Streaming", value: "Streaming" },
  { name: "Listening", value: "Listening" },
  { name: "Watching", value: "Watching" },
  { name: "Competing", value: "Competing" },
];

const setStatus = new SlashCommandBuilder()
  .setName("setstatus")
  .setDescription("Set the bot's presence (staff)")
  .addStringOption((o) =>
    o.setName("type").setDescription("Activity type").setRequired(true).addChoices(...TYPE_CHOICES),
  )
  .addStringOption((o) =>
    o.setName("description").setDescription("Activity text").setRequired(true).setMaxLength(128),
  )
  .addStringOption((o) =>
    o.setName("username").setDescription("Twitch username (Streaming only)").setMaxLength(32),
  );

export const statusCommands: CommandModule[] = [
  {
    data: setStatus,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const type = interaction.options.getString("type", true);
      const description = interaction.options.getString("description", true);
      const username = interaction.options.getString("username");

      if (type === "Streaming" && !username) {
        return replyError(interaction, "Streaming requires a Twitch username to build the stream URL.");
      }

      setConfig(GLOBAL_CONFIG_SCOPE, "bot_status_type", type as never, member.id);
      setConfig(GLOBAL_CONFIG_SCOPE, "bot_status_description", description as never, member.id);
      setConfig(GLOBAL_CONFIG_SCOPE, "bot_status_twitch_username", (username ?? "") as never, member.id);

      applyStoredPresence(interaction.client);

      await interaction.reply({
        embeds: [
          successEmbed(
            "Status Updated",
            `${type} ${description}${type === "Streaming" ? ` — twitch.tv/${username}` : ""}. Re-applied every 30s.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];

export { ActivityType };
