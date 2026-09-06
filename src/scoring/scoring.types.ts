export type GameMode = "hardpoint" | "search_and_destroy" | "control";

export type OutOfRangePolicy = "CLAMP" | "EXTRAPOLATE";

export interface CalibrationPoint {
  gapPercentage: number;
  points: number;
}

export interface ScoringProfile {
  referenceScore: number;
  winnerCurve: CalibrationPoint[];
  loserCurve: CalibrationPoint[];
}

export interface PlayerWeights {
  objective: number;
  kd: number;
  assists: number;
}

export type CalibrationConfidence =
  | "CALIBRATED"
  | "INTERPOLATED"
  | "CLAMPED_LOW"
  | "CLAMPED_HIGH"
  | "EXTRAPOLATED"
  | "INSUFFICIENT_CALIBRATION";

export interface CurveResult {
  points: number;
  exactPoints: number;
  confidence: CalibrationConfidence;
}

export interface TeamScoringInput {
  mode: GameMode;
  leftScore: number;
  rightScore: number;
  leftTeamId: string;
  rightTeamId: string;
}

export interface TeamScoringResult {
  winnerTeamId: string;
  loserTeamId: string;
  winnerPoints: number;
  loserPoints: number;
  winnerExactPoints: number;
  loserExactPoints: number;
  scoreGap: number;
  gapPercentage: number;
  referenceScore: number;
  confidence: CalibrationConfidence;
  requiresCalibrationReview: boolean;
  scoringVersion: string;
  notes: string[];
}

export interface PlayerRawStats {
  playerKey: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  objectiveTimeSeconds: number | null;
}

export interface PlayerNormalizedStats {
  kd: number | null;
  objective: number | null;
  assists: number | null;
}

export interface PlayerScoringResult {
  playerKey: string;
  raw: PlayerRawStats;
  normalized: PlayerNormalizedStats;
  performanceScore: number;
  matchPoints: number;
  provisional: boolean;
  notes: string[];
}
