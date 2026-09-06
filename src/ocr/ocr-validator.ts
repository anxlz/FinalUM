import type { OcrGameMode, OcrPlayer, OcrResponse } from "./ocr.types";

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
}

interface ScoreRule {
  min: number;
  max: number;
  winningScore: number | null;
  allowOvertime: boolean;
}

const SCORE_RULES: Record<OcrGameMode, ScoreRule> = {
  hardpoint: { min: 0, max: 250, winningScore: 250, allowOvertime: false },
  search_and_destroy: { min: 0, max: 30, winningScore: 9, allowOvertime: true },
  control: { min: 0, max: 6, winningScore: 4, allowOvertime: false },
};

function isNonNegativeInteger(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function visiblePlayers(response: OcrResponse): OcrPlayer[] {
  return [...response.teams.left.players, ...response.teams.right.players].filter(
    (p) => p.rowPresent,
  );
}

export function validateOcrResponse(response: OcrResponse): ValidationResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!response.match) {
    return {
      valid: false,
      issues: response.validation?.issues?.length
        ? response.validation.issues
        : ["Not a CODM scoreboard"],
      warnings,
    };
  }

  const match = response.match;

  if (!match.mode || !(match.mode in SCORE_RULES)) {
    issues.push("Could not identify game mode");
  }

  if (match.leftScore === null || match.rightScore === null) {
    issues.push("Could not identify final score");
  }

  if (match.mode && match.mode in SCORE_RULES && match.leftScore !== null && match.rightScore !== null) {
    const rule = SCORE_RULES[match.mode];

    for (const [label, value] of [
      ["left", match.leftScore],
      ["right", match.rightScore],
    ] as const) {
      if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
        issues.push(`Conflicting OCR values`);
        warnings.push(`${label} score of ${value} is outside the valid range for ${match.mode}.`);
      }
    }

    if (match.leftScore === match.rightScore) {
      issues.push("Conflicting OCR values");
      warnings.push("Both sides show the same score — exactly one side must win.");
    } else {
      const winning = Math.max(match.leftScore, match.rightScore);
      if (rule.winningScore !== null && winning < rule.winningScore) {
        warnings.push(
          `Winning score of ${winning} is below the normal ${rule.winningScore} for ${match.mode} — the match may be incomplete.`,
        );
      }
      if (rule.winningScore !== null && winning > rule.winningScore && !rule.allowOvertime) {
        issues.push("Conflicting OCR values");
        warnings.push(`${match.mode} cannot exceed ${rule.winningScore}.`);
      }
      if (rule.allowOvertime && winning > rule.winningScore!) {
        warnings.push(`Overtime result (${match.leftScore}-${match.rightScore}) accepted.`);
      }
    }
  }

  const players = visiblePlayers(response);

  if (response.teams.left.players.length === 0 && response.teams.right.players.length === 0) {
    issues.push("Could not identify both scoreboard sides");
  }

  for (const player of players) {
    for (const [label, value] of [
      ["kills", player.kills],
      ["deaths", player.deaths],
      ["assists", player.assists],
      ["objectiveTimeSeconds", player.objectiveTimeSeconds],
    ] as const) {
      if (!isNonNegativeInteger(value)) {
        issues.push("Conflicting OCR values");
        warnings.push(`Slot ${player.slot} (${player.side}) has an invalid ${label}: ${value}.`);
      }
    }
  }

  for (const side of ["left", "right"] as const) {
    const names = response.teams[side].players
      .filter((p) => p.rowPresent && p.name)
      .map((p) => p.name!.trim().toLowerCase());
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    if (duplicates.length > 0) {
      issues.push("Conflicting OCR values");
      warnings.push(`Duplicate player name on the ${side} side: ${[...new Set(duplicates)].join(", ")}.`);
    }
  }

  for (const side of ["left", "right"] as const) {
    const count = response.teams[side].players.filter((p) => p.rowPresent).length;
    if (count > 0 && count < 5) {
      warnings.push(`${side} side shows ${count} players — valid, not an OCR failure.`);
    }
  }

  const anonymous = players.filter((p) => p.identityStatus === "STREAMER_MODE_ANONYMOUS");
  if (anonymous.length > 0 && !match.streamer_mode_enabled) {
    warnings.push(
      `${anonymous.length} row(s) are tagged anonymous but streamer_mode_enabled is false — staff should confirm identities manually.`,
    );
  }
  if (match.streamer_mode_enabled) {
    warnings.push(
      "Streamer Mode detected — anonymous slots require staff identity resolution before player points are awarded.",
    );
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)], warnings };
}

export function coerceObjectiveTime(
  mode: OcrGameMode | null,
  value: number | null,
): number | null {
  if (mode !== "hardpoint") return value;
  return value;
}
