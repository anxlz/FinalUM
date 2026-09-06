/**
 * The guided front-door onto match scheduling — mirrors the step-indicator wizard in the
 * Universe Meta mockups. /matchregister still exists for anyone who prefers one command
 * with every option typed at once; this walks a captain through it one step at a time.
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { beginCreateMatchWizard } from "../interactions/match-wizard";
import type { CommandModule } from "./types";

const createMatch = new SlashCommandBuilder()
  .setName("creatematch")
  .setDescription("Create a match step by step: opponent, then date & time, then confirm");

export const createMatchCommands: CommandModule[] = [
  {
    data: createMatch,
    async execute(interaction: ChatInputCommandInteraction) {
      await beginCreateMatchWizard(interaction);
    },
  },
];
