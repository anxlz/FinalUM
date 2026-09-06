import { Client, Events, GatewayIntentBits } from "discord.js";
import { migrate } from "./db/migrate";
import { closeDatabase, openDatabase } from "./db/client";
import { routeInteraction } from "./interactions/router";
import { loadEnv } from "./lib/env";
import { startHealthServer } from "./lib/health";
import { logger } from "./lib/logger";
import { startWeeklyResetWatcher } from "./lib/weekly-reset";
import { registerLeaderboardFonts } from "./leaderboard/render.service";
import { startLiveLeaderboardWatcher } from "./leaderboard/live-refresh";
import { startPresenceWatcher } from "./lib/presence";

async function main(): Promise<void> {
  const env = loadEnv();

  openDatabase(env.databasePath);
  migrate();
  logger.info("database ready", { path: env.databasePath });

  registerLeaderboardFonts();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  const health = startHealthServer(env.healthPort, {
    ready: () => client.isReady(),
    wsPing: () => Math.round(client.ws.ping),
  });

  client.once(Events.ClientReady, (ready) => {
    logger.info("gateway ready", { tag: ready.user.tag, guilds: ready.guilds.cache.size });
  });

  client.on(Events.InteractionCreate, (interaction) => void routeInteraction(interaction));
  client.on(Events.Error, (error) => logger.error("client error", { error: String(error) }));

  const weeklyTimer = startWeeklyResetWatcher((windowStart) => {
    logger.info("weekly window rolled", { windowStart: windowStart.toISOString() });
  });

  // Live leaderboard boards edit themselves in place every 30s, and the configured bot
  // presence is re-applied every 30s too — both started only once the gateway is ready.
  let leaderboardTimer: Timer | null = null;
  let presenceTimer: Timer | null = null;
  client.once(Events.ClientReady, () => {
    leaderboardTimer = startLiveLeaderboardWatcher(client);
    presenceTimer = startPresenceWatcher(client);
  });

  const shutdown = (signal: string) => {
    logger.info("shutting down", { signal });
    clearInterval(weeklyTimer);
    if (leaderboardTimer) clearInterval(leaderboardTimer);
    if (presenceTimer) clearInterval(presenceTimer);
    void health.stop(true);
    void client.destroy();
    closeDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await client.login(env.discordToken);
}

main().catch((error) => {
  logger.error("fatal boot error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
