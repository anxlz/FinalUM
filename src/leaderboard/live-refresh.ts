/**
 * Keeps the live leaderboard board current by editing the same message every 30s — it
 * never posts a new one. `/setleaderboardchannel` / `/leaderboardlive start` create the
 * message and record its channel/message id plus the encoded BoardState in
 * AutomationConfig (§5: no in-memory state); this watcher just reads that pointer back on
 * a fixed interval and re-renders.
 *
 * If the stored message has been deleted out from under us, the pointer is cleared rather
 * than recreated — recreating would be exactly the "silently sends a new message" behaviour
 * this feature exists to avoid.
 */

import type { Client } from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { automationConfig } from "../db/schema";
import { getConfig, setConfig } from "../lib/automation-config";
import { logger } from "../lib/logger";
import { buildBoardPayload, decodeState, DEFAULT_STATE } from "./board.service";

const REFRESH_INTERVAL_MS = 30_000;

function guildsWithLiveBoard(): string[] {
  return getDb()
    .selectDistinct({ guildId: automationConfig.guildId })
    .from(automationConfig)
    .where(
      and(
        eq(automationConfig.key, "leaderboard_live_message_id"),
        sql`${automationConfig.value} != ''`,
      ),
    )
    .all()
    .map((r) => r.guildId);
}

async function refreshOne(client: Client, guildId: string): Promise<void> {
  const channelId = getConfig(guildId, "leaderboard_live_channel_id");
  const messageId = getConfig(guildId, "leaderboard_live_message_id");
  if (!channelId || !messageId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    setConfig(guildId, "leaderboard_live_message_id", "", "system");
    return;
  }

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    logger.info("live leaderboard message no longer exists — stopping", { guildId, messageId });
    setConfig(guildId, "leaderboard_live_message_id", "", "system");
    return;
  }

  const stateToken = getConfig(guildId, "leaderboard_live_state");
  const state = stateToken ? decodeState(stateToken) : DEFAULT_STATE;

  const payload = await buildBoardPayload(guildId, state, client, true);
  await message.edit(payload);
}

export async function refreshLiveLeaderboards(client: Client): Promise<void> {
  for (const guildId of guildsWithLiveBoard()) {
    try {
      await refreshOne(client, guildId);
    } catch (error) {
      logger.warn("live leaderboard refresh failed", { guildId, error: String(error) });
    }
  }
}

export function startLiveLeaderboardWatcher(client: Client): Timer {
  return setInterval(() => void refreshLiveLeaderboards(client), REFRESH_INTERVAL_MS);
}
