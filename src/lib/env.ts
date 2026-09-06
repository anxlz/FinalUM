function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

export interface Env {
  discordToken: string;
  discordClientId: string;
  devGuildId: string | null;
  databasePath: string;
  healthPort: number;
}

export function loadEnv(): Env {
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    devGuildId: process.env.DEV_GUILD_ID?.trim() || null,
    databasePath: optional("DATABASE_PATH", "./data/uml.sqlite"),
    healthPort: Number(optional("HEALTH_PORT", "8080")),
  };
}
