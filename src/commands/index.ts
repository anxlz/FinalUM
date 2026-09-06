import { applicationCommands } from "./application.commands";
import { automationCommands } from "./automation.commands";
import { complianceCommands } from "./compliance.commands";
import { createMatchCommands } from "./create-match.commands";
import { embedConfigCommands } from "./embed-config.commands";
import { leaderboardCommands } from "./leaderboard.commands";
import { manualMatchCommands } from "./manual-match.commands";
import { matchCenterCommands } from "./match-center.commands";
import { matchHubCommands } from "./match-hub.commands";
import { matchCommands } from "./match.commands";
import { profileCommands } from "./profile.commands";
import { statusCommands } from "./status.commands";
import { ocrConfigCommands } from "./ocr-config.commands";
import { reviewCommands } from "./review.commands";
import { teamCommands } from "./team.commands";
import { ticketCommands } from "./ticket.commands";
import type { CommandModule } from "./types";

export const allCommands: CommandModule[] = [
  ...teamCommands,
  ...matchCommands,
  ...createMatchCommands,
  ...matchCenterCommands,
  ...matchHubCommands,
  ...manualMatchCommands,
  ...ticketCommands,
  ...applicationCommands,
  ...reviewCommands,
  ...leaderboardCommands,
  ...complianceCommands,
  ...embedConfigCommands,
  ...automationCommands,
  ...profileCommands,
  ...statusCommands,
  ...ocrConfigCommands,
];

export const commandsByName = new Map<string, CommandModule>(
  allCommands.map((command) => [command.data.name, command]),
);

export type { CommandModule };
