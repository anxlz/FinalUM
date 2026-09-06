/**
 * `/setcenterchannel` posts the Match Center hub — a static banner plus a single select
 * menu with four actions (Create Match / My Matches / Leaderboard / Support), each carrying
 * a configurable emoji set via `/setemojis`. The hub itself is generic on purpose: a shared
 * channel message can't show one captain's tier/points/weekly-match count to everyone who
 * looks at it, so those personal numbers are delivered in the ephemeral reply each action
 * produces (the same handlers /matchcenter's buttons already used).
 */

import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getConfig, setConfig, type ConfigKey } from "../lib/automation-config";
import { replyError, successEmbed } from "../lib/embeds";
import { hasManagerPermission } from "../lib/permissions";
import { renderMatchCenterBanner } from "../leaderboard/hub-render.service";
import { renderHero } from "../leaderboard/brand-render.service";
import { BRAND_COLOR, CV2, actionRow, container, divider, galleryImage, linkButton, text } from "../lib/ui-kit";
import type { CommandModule } from "./types";

export const HUB_ACTION_SELECT = "hub:action";
export const HUB_ACTION_VALUES = {
  createMatch: "create_match",
  myMatches: "my_matches",
  leaderboard: "leaderboard",
  support: "support",
} as const;

const EMOJI_KEYS: Record<string, ConfigKey> = {
  [HUB_ACTION_VALUES.createMatch]: "emoji_create_match",
  [HUB_ACTION_VALUES.myMatches]: "emoji_my_matches",
  [HUB_ACTION_VALUES.leaderboard]: "emoji_leaderboard",
  [HUB_ACTION_VALUES.support]: "emoji_support",
};

export function buildHubMessage(guildId: string) {
  const banner = renderMatchCenterBanner();
  const attachment = new AttachmentBuilder(banner, { name: "match-center.png" });

  const select = new StringSelectMenuBuilder()
    .setCustomId(HUB_ACTION_SELECT)
    .setPlaceholder("Choose an action…")
    .addOptions(
      { label: "Create Match", value: HUB_ACTION_VALUES.createMatch, emoji: getConfig(guildId, "emoji_create_match"), description: "Register a new match" },
      { label: "My Matches", value: HUB_ACTION_VALUES.myMatches, emoji: getConfig(guildId, "emoji_my_matches"), description: "View your matches" },
      { label: "Leaderboard", value: HUB_ACTION_VALUES.leaderboard, emoji: getConfig(guildId, "emoji_leaderboard"), description: "Check rankings & points" },
      { label: "Support", value: HUB_ACTION_VALUES.support, emoji: getConfig(guildId, "emoji_support"), description: "Open a support ticket" },
    );

  return {
    components: [
      container(
        [
          galleryImage("match-center.png", "UM League Match Center"),
          divider(),
          text("Only team captains can use these actions."),
          actionRow(select),
        ],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2,
  };
}

/**
 * Match League Center → "Support" — a Components V2 hidden (ephemeral) message, same
 * theme/font as the rest of the hub, titled "SUPPORT", with a hyperlinked button to the
 * configured support channel (`/setsupportchannel`).
 */
export async function buildSupportMessage(guildId: string) {
  const supportChannelId = getConfig(guildId, "support_channel_id");
  const banner = await renderHero({
    title: "SUPPORT",
    subtitle: "Need a hand? Staff are one click away.",
    footer: "FOR MATCH ISSUES, OPEN A TICKET WITH /ticketopen INSTEAD",
  });
  const attachment = new AttachmentBuilder(banner, { name: "support.png" });

  return {
    components: [
      container(
        [
          galleryImage("support.png", "Support"),
          divider(),
          text(
            "For a specific match, open its ticket with /ticketopen and describe the issue there — staff can see the full match context.\nFor anything else, use the button below to reach league staff directly.",
          ),
          ...(supportChannelId
            ? [
                actionRow(
                  linkButton(
                    `https://discord.com/channels/${guildId}/${supportChannelId}`,
                    "Open Support Channel",
                  ),
                ),
              ]
            : []),
        ],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2 | MessageFlags.Ephemeral,
  };
}

const setSupportChannel = new SlashCommandBuilder()
  .setName("setsupportchannel")
  .setDescription("Set the channel the Support button links to (staff)")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true));

const setCenterChannel = new SlashCommandBuilder()
  .setName("setcenterchannel")
  .setDescription("Post (or replace) the Match Center hub in a channel (staff)")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true));

const setEmojis = new SlashCommandBuilder()
  .setName("setemojis")
  .setDescription("Customize the Match Center action emojis (staff)")
  .addStringOption((o) => o.setName("create_match").setDescription("Emoji for Create Match"))
  .addStringOption((o) => o.setName("my_matches").setDescription("Emoji for My Matches"))
  .addStringOption((o) => o.setName("leaderboard").setDescription("Emoji for Leaderboard"))
  .addStringOption((o) => o.setName("support").setDescription("Emoji for Support"));

export const matchHubCommands: CommandModule[] = [
  {
    data: setSupportChannel,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      const channel = interaction.options.getChannel("channel", true);
      setConfig(interaction.guildId!, "support_channel_id", channel.id as never, member.id);
      await interaction.reply({
        embeds: [successEmbed("Support Channel Set", `The Support button now links to <#${channel.id}>.`)],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: setCenterChannel,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      const channel = interaction.options.getChannel("channel", true);
      const resolved = await interaction.guild!.channels.fetch(channel.id);
      if (!resolved?.isTextBased() || !("send" in resolved)) {
        return replyError(interaction, "Pick a text channel.");
      }

      const sent = await resolved.send(buildHubMessage(interaction.guildId!));
      setConfig(interaction.guildId!, "match_center_channel_id", channel.id as never, member.id);
      setConfig(interaction.guildId!, "match_center_message_id", sent.id as never, member.id);

      await interaction.reply({
        embeds: [successEmbed("Match Center Posted", `The hub is live in <#${channel.id}>.`)],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: setEmojis,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const guildId = interaction.guildId!;
      const updates: Array<[string, string]> = (
        [
          [HUB_ACTION_VALUES.createMatch, interaction.options.getString("create_match") ?? ""],
          [HUB_ACTION_VALUES.myMatches, interaction.options.getString("my_matches") ?? ""],
          [HUB_ACTION_VALUES.leaderboard, interaction.options.getString("leaderboard") ?? ""],
          [HUB_ACTION_VALUES.support, interaction.options.getString("support") ?? ""],
        ] as Array<[string, string]>
      ).filter(([, value]) => value !== "");

      if (updates.length === 0) {
        return replyError(interaction, "Supply at least one emoji to change.");
      }

      for (const [action, emoji] of updates) {
        setConfig(guildId, EMOJI_KEYS[action]!, emoji as never, member.id);
      }

      const channelId = getConfig(guildId, "match_center_channel_id");
      const messageId = getConfig(guildId, "match_center_message_id");
      if (channelId && messageId) {
        const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (channel?.isTextBased() && "messages" in channel) {
          const message = await channel.messages.fetch(messageId).catch(() => null);
          if (message) await message.edit(buildHubMessage(guildId));
        }
      }

      await interaction.reply({
        embeds: [successEmbed("Emojis Updated", `${updates.length} option(s) updated.`)],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];
