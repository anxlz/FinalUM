import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { matchIdCounters } from "../db/schema";

export function newId(): string {
  return crypto.randomUUID();
}

function utcDayKey(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

export function nextPublicMatchId(guildId: string, at: Date = new Date()): string {
  const day = utcDayKey(at);
  const db = getDb();

  db.insert(matchIdCounters)
    .values({ guildId, day, seq: 1 })
    .onConflictDoUpdate({
      target: [matchIdCounters.guildId, matchIdCounters.day],
      set: { seq: sql`${matchIdCounters.seq} + 1` },
    })
    .run();

  const row = db
    .select({ seq: matchIdCounters.seq })
    .from(matchIdCounters)
    .where(and(eq(matchIdCounters.guildId, guildId), eq(matchIdCounters.day, day)))
    .get();

  return `CODM-${day}-${String(row?.seq ?? 1).padStart(6, "0")}`;
}

export function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function fixturePairKey(teamIdA: string, teamIdB: string): string {
  return [teamIdA, teamIdB].sort().join("|");
}
