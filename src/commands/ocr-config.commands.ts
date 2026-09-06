/**
 * A dedicated toggle for the OCR pipeline, wrapping the same `screenshot_ocr_pipeline`
 * flag `/config toggle` already exposes — this just gives it its own front door and shows
 * whether OCR_SERVICE_URL is actually configured, since the toggle alone doesn't do
 * anything until both are true (§3, §7.2).
 */

import {
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getToggle, setToggle } from "../lib/automation-config";
import { buildEmbed, field, replyError, successEmbed } from "../lib/embeds";
import { hasManagerPermission } from "../lib/permissions";
import { isOcrConfigured, isOcrHealthy } from "../ocr/paddleocr.service";
import type { CommandModule } from "./types";

const ocrConfig = new SlashCommandBuilder()
  .setName("ocrconfig")
  .setDescription("Enable, disable or check the OCR result pipeline (staff)")
  .addSubcommand((s) => s.setName("enable").setDescription("Turn OCR result extraction on"))
  .addSubcommand((s) => s.setName("disable").setDescription("Turn OCR result extraction off"))
  .addSubcommand((s) => s.setName("status").setDescription("Show whether OCR is enabled and reachable"));

export const ocrConfigCommands: CommandModule[] = [
  {
    data: ocrConfig,
    async execute(interaction: ChatInputCommandInteraction) {
      const member = interaction.member as GuildMember;
      if (!hasManagerPermission(member)) {
        return replyError(interaction, "This command is restricted to league staff.");
      }

      const guildId = interaction.guildId!;
      const sub = interaction.options.getSubcommand();
      const configured = isOcrConfigured();

      if (sub === "enable") {
        if (!configured) {
          return replyError(
            interaction,
            "OCR_SERVICE_URL is not set in the bot's environment, so there's no service to enable this toward yet. See ocr-service/SETUP.md.",
          );
        }
        setToggle(guildId, "screenshot_ocr_pipeline", true, member.id);
        return void (await interaction.reply({
          embeds: [successEmbed("OCR Enabled", "/matchresult will now try OCR extraction before falling back to manual entry.")],
          flags: MessageFlags.Ephemeral,
        }));
      }

      if (sub === "disable") {
        setToggle(guildId, "screenshot_ocr_pipeline", false, member.id);
        return void (await interaction.reply({
          embeds: [successEmbed("OCR Disabled", "/matchresult will go straight to manual entry.")],
          flags: MessageFlags.Ephemeral,
        }));
      }

      const enabled = getToggle(guildId, "screenshot_ocr_pipeline");
      const healthy = configured ? await isOcrHealthy() : false;

      await interaction.reply({
        embeds: [
          buildEmbed({
            title: "OCR Status",
            tone: enabled && healthy ? "confirmed" : "pending",
            guildId,
            fields: [
              field("Toggle", enabled ? "On" : "Off", true),
              field("OCR_SERVICE_URL set", configured ? "Yes" : "No", true),
              field("Service reachable", configured ? (healthy ? "Yes" : "No") : "—", true),
            ],
            footer: "Both the toggle and a reachable service are needed for OCR to actually run.",
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];
