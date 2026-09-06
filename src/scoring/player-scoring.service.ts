import { roundPoints } from "./interpolation";
import { normalize } from "./normalization";
import { PLAYER_POINT_SCALE, PLAYER_WEIGHTS } from "./scoring-config";
import type { PlayerRawStats, PlayerScoringResult } from "./scoring.types";

export class PlayerScoringError extends Error {}

function assertWeightsValid(): void {
  const sum = PLAYER_WEIGHTS.objective + PLAYER_WEIGHTS.kd + PLAYER_WEIGHTS.assists;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new PlayerScoringError(`Player weights must sum to 1 — currently ${sum}.`);
  }
}

export function calculatePlayerPoints(
  population: PlayerRawStats[],
  provisional: boolean,
): PlayerScoringResult[] {
  assertWeightsValid();

  const normalized = normalize(population);

  return population.map((raw) => {
    const norm = normalized.get(raw.playerKey) ?? { kd: null, objective: null, assists: null };
    const notes: string[] = [];

    const components: Array<{ value: number; weight: number }> = [];
    if (norm.objective !== null) {
      components.push({ value: norm.objective, weight: PLAYER_WEIGHTS.objective });
    } else {
      notes.push("No objective time available for this mode — weight redistributed.");
    }
    if (norm.kd !== null) components.push({ value: norm.kd, weight: PLAYER_WEIGHTS.kd });
    if (norm.assists !== null) {
      components.push({ value: norm.assists, weight: PLAYER_WEIGHTS.assists });
    }

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

    let performanceScore = 0;
    if (totalWeight === 0) {
      notes.push("No usable statistics — performance score is 0 and requires staff review.");
    } else {
      const weighted = components.reduce((sum, c) => sum + c.value * c.weight, 0);
      performanceScore = (weighted / totalWeight) * 100;
    }

    return {
      playerKey: raw.playerKey,
      raw,
      normalized: norm,
      performanceScore: Math.round(performanceScore * 100) / 100,
      matchPoints: roundPoints(performanceScore * PLAYER_POINT_SCALE),
      provisional,
      notes,
    };
  });
}
