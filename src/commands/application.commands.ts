import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type BaseMessageOptions,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getConfig, setConfig } from "../lib/automation-config";
import { buildEmbed, field, replyError, successEmbed } from "../lib/embeds";
import { hasManagerPermission } from "../lib/permissions";
import {
  getApplicationByRef,
  listApplicationPlayers,
} from "../applications/application.service";
import { REGIONS } from "../teams/team.service";
import { renderHero } from "../leaderboard/brand-render.service";
import { BRAND_COLOR, CV2, actionRow, container, divider, galleryImage, redButton, text } from "../lib/ui-kit";
import type { CommandModule } from "./types";

export const APPLICATION_BUTTONS = {
  start: "app:start",
  approve: "app:approve",
  reject: "app:reject",
} as const;

/**
 * "Team Applications Are Open" — Components V2, top large image titled "ROSTER APPLY"
 * (same theme/fonts as the leaderboard and Match Center renders), red "Apply Now" button
 * inside the same container as the image, per the design brief.
 */
export async function buildApplyMessage(imageUrl: string | null): Promise<BaseMessageOptions> {
  const banner = await renderHero({
    title: "ROSTER APPLY",
    subtitle: "Team applications are open",
    details: [
      { label: "Roster", value: "Up to 10 players" },
      { label: "Review", value: "Staff approval required" },
    ],
    footer: "APPLY NOW TO JOIN THE LEAGUE",
  });
  const attachment = new AttachmentBuilder(banner, { name: "roster-apply.png" });

  return {
    components: [
      container(
        [
          galleryImage("roster-apply.png", "Roster Apply"),
          divider(),
          text(
            "Apply to join the league. You will be asked for your team name, region, tier, logo, and each player's name and UID. Staff review every application before a team goes live.",
          ),
          ...(imageUrl ? [text(`[Reference image](${imageUrl})`)] : []),
          actionRow(redButton(APPLICATION_BUTTONS.start, "Apply Now")),
        ],
        BRAND_COLOR,
      ),
    ],
    files: [attachment],
    flags: CV2,
  };
}

const setApply = new SlashCommandBuilder()
  .setName("setapply")
  .setDescription("Post the persistent Apply Now embed in a channel (staff)")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true))
  .addStringOption((o) => o.setName("image_url").setDescription("Embed image"));

const postApply = new SlashCommandBuilder()
  .setName("postapply")
  .setDescription("Post the Apply Now embed here on demand (staff)")
  .addStringOption((o) => o.setName("image_url").setDescription("Embed image"));

const applicationReviewChannel = new SlashCommandBuilder()
  .setName("setapplicationchannel")
  .setDescription("Set where submitted applications are sent for review (staff)")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true));

const applicationShow = new SlashCommandBuilder()
  .setName("application")
  .setDescription("Show an application by reference (staff)")
  .addStringOption((o) =>
    o.setName("ref").setDescription("Application reference, e.g. APP-00001").setRequired(true),
  );

export const applicationCommands: CommandModule[] = [
  {
    data: setApply,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const channel = interaction.options.getChannel("channel", true);
      const resolved = await interaction.guild!.channels.fetch(channel.id);
      if (!resolved?.isTextBased()) {
        return replyError(interaction, "Pick a text channel.");
      }

      await resolved.send(await buildApplyMessage(interaction.options.getString("image_url")));
      setConfig(interaction.guildId!, "application_channel_id", channel.id as never, member.id);

      await interaction.reply({
        embeds: [successEmbed("Apply Embed Posted", `The Apply Now embed is live in <#${channel.id}>.`)],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: postApply,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      await interaction.reply(await buildApplyMessage(interaction.options.getString("image_url")));
    },
  },

  {
    data: applicationReviewChannel,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }
      const channel = interaction.options.getChannel("channel", true);
      setConfig(interaction.guildId!, "application_review_channel_id", channel.id as never, member.id);
      await interaction.reply({
        embeds: [
          successEmbed("Review Channel Set", `Applications will be sent to <#${channel.id}>.`),
        ],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: applicationShow,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const application = getApplicationByRef(
        interaction.guildId!,
        interaction.options.getString("ref", true),
      );
      if (!application) return replyError(interaction, "No application with that reference.");

      const roster = listApplicationPlayers(application.id);
      await interaction.reply({
        embeds: [
          buildEmbed({
            title: `Application ${application.publicRef}`,
            description: `${application.teamName} — ${application.status.toLowerCase()}`,
            fields: [
              field("Applicant", `<@${application.applicantDiscordId}>`),
              field("Region", application.region ?? "Not set"),
              field("Tier", application.tier ?? "Not set"),
              field(
                "Roster",
                roster.map((p) => `${p.isCaptain ? "★" : "•"} ${p.ign}${p.uid ? ` (${p.uid})` : ""}`).join("\n") ||
                  "No players listed",
                false,
              ),
            ],
            thumbnail: application.logoUrl,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];

export { REGIONS };
