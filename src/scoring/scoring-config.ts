import type { GameMode, ScoringProfile, PlayerWeights, OutOfRangePolicy } from "./scoring.types";

export const CURRENT_SCORING_VERSION = "v1.0";

export const SCORING_PROFILES: Record<GameMode, ScoringProfile> = {
  hardpoint: {
    referenceScore: 250,
    winnerCurve: [
      { gapPercentage: 0.04, points: 20 },
      { gapPercentage: 0.84, points: 45 },
    ],
    loserCurve: [
      { gapPercentage: 0.04, points: -5 },
      { gapPercentage: 0.84, points: -25 },
    ],
  },

  search_and_destroy: {
    referenceScore: 20,
    winnerCurve: [
      { gapPercentage: 0.1, points: 15 },
      { gapPercentage: 0.3, points: 35 },
    ],
    loserCurve: [
      { gapPercentage: 0.1, points: -10 },
      { gapPercentage: 0.3, points: -25 },
    ],
  },

  control: {
    referenceScore: 4,
    winnerCurve: [{ gapPercentage: 1.0, points: 45 }],
    loserCurve: [{ gapPercentage: 1.0, points: -45 }],
  },
};

export const OUT_OF_RANGE_POLICY: OutOfRangePolicy = "CLAMP";

export const PLAYER_WEIGHTS: PlayerWeights = {
  objective: 0.5,
  kd: 0.3,
  assists: 0.2,
};

export const PLAYER_POINT_SCALE = 0.25;

export const NORMALIZATION_MODE = "POPULATION_RELATIVE" as const;

export const FIXED_BASELINES = {
  objectiveTimeSeconds: 120,
  kd: 2.0,
  assists: 15,
};

export function getProfile(mode: GameMode): ScoringProfile {
  const profile = SCORING_PROFILES[mode];
  if (!profile) throw new Error(`No scoring profile configured for mode: ${mode}`);
  return profile;
}
