import { getDashboardConfiguration } from "@/lib/server-config";

export type BotStatus = {
  status: "online" | "offline" | "not_configured";
  gatewayPingMs?: number;
};

export type DatabaseStatus = {
  status: "connected" | "configuration_required" | "error";
};

export async function getSystemStatus() {
  const configuration = getDashboardConfiguration();
  const [database, bot] = await Promise.all([
    checkDatabase(configuration),
    checkBotHealth(configuration.botHealthUrl),
  ]);

  return { configuration, database, bot };
}

async function checkDatabase(configuration: ReturnType<typeof getDashboardConfiguration>): Promise<DatabaseStatus> {
  if (configuration.dataSource === "supabase") {
    return configuration.database === "configured" &&
      configuration.supabaseServer === "configured" &&
      configuration.supabasePublic === "configured"
      ? { status: "connected" }
      : { status: "configuration_required" };
  }

  if (configuration.dataSource !== "sqlite" || configuration.database !== "configured") {
    return { status: "configuration_required" };
  }

  try {
    const { default: Database } = await import("better-sqlite3");
    const database = new Database(configuration.sqlitePath, { readonly: true });
    database.prepare("SELECT 1 AS ok").get();
    database.close();
    return { status: "connected" };
  } catch {
    return { status: "error" };
  }
}

async function checkBotHealth(url: string | null): Promise<BotStatus> {
  if (!url) return { status: "not_configured" };

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (!response.ok) return { status: "offline" };

    const payload = (await response.json()) as { gatewayPingMs?: unknown };
    return {
      status: "online",
      ...(typeof payload.gatewayPingMs === "number" ? { gatewayPingMs: payload.gatewayPingMs } : {}),
    };
  } catch {
    return { status: "offline" };
  }
}
