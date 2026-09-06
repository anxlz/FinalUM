/**
 * Applies the presence stored by /setstatus. Split out from status.commands.ts so both the
 * command (apply immediately on save) and the 30s watcher (re-apply on a timer) call the
 * exact same logic and can never drift.
 */

import { ActivityType, type Client } from "discord.js";
import { GLOBAL_CONFIG_SCOPE, getConfig } from "./automation-config";
import { logger } from "./logger";

const ACTIVITY_TYPES: Record<string, ActivityType> = {
  Playing: ActivityType.Playing,
  Streaming: ActivityType.Streaming,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing,
};

export function applyStoredPresence(client: Client): void {
  const type = getConfig(GLOBAL_CONFIG_SCOPE, "bot_status_type");
  if (!type || !client.user) return;

  const description = getConfig(GLOBAL_CONFIG_SCOPE, "bot_status_description");
  const username = getConfig(GLOBAL_CONFIG_SCOPE, "bot_status_twitch_username");

  client.user.setPresence({
    activities: [
      {
        name: description || "UM League",
        type: ACTIVITY_TYPES[type] ?? ActivityType.Playing,
        url: type === "Streaming" && username ? `https://twitch.tv/${username}` : undefined,
      },
    ],
    status: "online",
  });
}

const REFRESH_INTERVAL_MS = 30_000;

export function startPresenceWatcher(client: Client): Timer {
  applyStoredPresence(client);
  return setInterval(() => {
    try {
      applyStoredPresence(client);
    } catch (error) {
      logger.warn("presence refresh failed", { error: String(error) });
    }
  }, REFRESH_INTERVAL_MS);
}
