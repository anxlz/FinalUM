import type {
  CalibrationPoint,
  CurveResult,
  OutOfRangePolicy,
} from "./scoring.types";

export function roundPoints(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function lerp(a: CalibrationPoint, b: CalibrationPoint, gap: number): number {
  if (b.gapPercentage === a.gapPercentage) return a.points;
  const t = (gap - a.gapPercentage) / (b.gapPercentage - a.gapPercentage);
  return a.points + t * (b.points - a.points);
}

export function evaluateCurve(
  curve: CalibrationPoint[],
  gapPercentage: number,
  policy: OutOfRangePolicy,
): CurveResult {
  if (curve.length === 0) {
    throw new Error("Calibration curve is empty — cannot score this mode.");
  }

  const sorted = [...curve].sort((a, b) => a.gapPercentage - b.gapPercentage);

  if (sorted.length === 1) {
    const only = sorted[0]!;
    const exact = only.points;
    return {
      points: roundPoints(exact),
      exactPoints: exact,
      confidence:
        gapPercentage === only.gapPercentage ? "CALIBRATED" : "INSUFFICIENT_CALIBRATION",
    };
  }

  const lowest = sorted[0]!;
  const highest = sorted[sorted.length - 1]!;

  const exactHit = sorted.find((p) => p.gapPercentage === gapPercentage);
  if (exactHit) {
    return {
      points: roundPoints(exactHit.points),
      exactPoints: exactHit.points,
      confidence: "CALIBRATED",
    };
  }

  if (gapPercentage < lowest.gapPercentage) {
    if (policy === "CLAMP") {
      return {
        points: roundPoints(lowest.points),
        exactPoints: lowest.points,
        confidence: "CLAMPED_LOW",
      };
    }
    const exact = lerp(sorted[0]!, sorted[1]!, gapPercentage);
    return { points: roundPoints(exact), exactPoints: exact, confidence: "EXTRAPOLATED" };
  }

  if (gapPercentage > highest.gapPercentage) {
    if (policy === "CLAMP") {
      return {
        points: roundPoints(highest.points),
        exactPoints: highest.points,
        confidence: "CLAMPED_HIGH",
      };
    }
    const exact = lerp(sorted[sorted.length - 2]!, highest, gapPercentage);
    return { points: roundPoints(exact), exactPoints: exact, confidence: "EXTRAPOLATED" };
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const lower = sorted[i]!;
    const upper = sorted[i + 1]!;
    if (gapPercentage >= lower.gapPercentage && gapPercentage <= upper.gapPercentage) {
      const exact = lerp(lower, upper, gapPercentage);
      return { points: roundPoints(exact), exactPoints: exact, confidence: "INTERPOLATED" };
    }
  }

  throw new Error(`Unreachable: gap ${gapPercentage} fell through curve evaluation.`);
}
