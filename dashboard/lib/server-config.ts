import { existsSync } from "node:fs";
import path from "node:path";

const requiredServerVariables = ["DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const requiredPublicVariables = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

type VariableState = "configured" | "missing";
export type DataSource = "sqlite" | "supabase" | "invalid";

export type DashboardConfiguration = {
  dataSource: DataSource;
  database: VariableState;
  supabaseServer: VariableState;
  supabasePublic: VariableState;
  appUrl: string | null;
  botHealthUrl: string | null;
  sqlitePath: string;
};

export function getDashboardConfiguration(): DashboardConfiguration {
  const dataSource = getDataSource();
  const sqlitePath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? "../data/uml.sqlite");

  return {
    dataSource,
    database: dataSource === "sqlite" ? getFileState(sqlitePath) : getState(requiredServerVariables),
    supabaseServer: getState(["SUPABASE_SERVICE_ROLE_KEY"]),
    supabasePublic: getState(requiredPublicVariables),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    botHealthUrl: process.env.BOT_HEALTH_URL ?? "http://127.0.0.1:8080/health",
    sqlitePath,
  };
}

function getDataSource(): DataSource {
  const value = process.env.DATA_SOURCE?.trim().toLowerCase() || "sqlite";
  return value === "sqlite" || value === "supabase" ? value : "invalid";
}

function getState(names: readonly string[]): VariableState {
  return names.every((name) => Boolean(process.env[name])) ? "configured" : "missing";
}

function getFileState(filePath: string): VariableState {
  return existsSync(filePath) ? "configured" : "missing";
}
