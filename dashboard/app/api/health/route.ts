import { NextResponse } from "next/server";
import { getSystemStatus } from "@/lib/system-status";

export async function GET() {
  const { configuration, database, bot } = await getSystemStatus();
  const { botHealthUrl: _botHealthUrl, sqlitePath: _sqlitePath, ...publicConfiguration } = configuration;
  const ready =
    configuration.dataSource !== "invalid" &&
    database.status === "connected" &&
    (configuration.dataSource === "sqlite" ||
      (configuration.supabaseServer === "configured" && configuration.supabasePublic === "configured")) &&
    bot.status !== "offline";

  return NextResponse.json(
    {
      service: "uml-dashboard",
      status: ready ? "operational" : "configuration_required",
      configuration: publicConfiguration,
      database,
      bot,
    },
    { status: ready ? 200 : 503 },
  );
}

