/**
 * Posisi awal (evaluasi Agu 2026): where the programme started, before the 10 monitoring
 * weeks. Static numbers from the August 2026 evaluation, never synced or edited in the app.
 * lib/aggregate compares the live KPIs with them. Ratios are fractions 0..1.
 */

/** Coaching Frontliner All BO, evaluated up to 31 Agu 2026. */
export const BASELINE_COACHING = {
  /** Frontliners coached. */
  coached: 795,
  /** Frontliners in scope (the coverage target). */
  targetCoverage: 812,
  /** Coached ÷ in scope. */
  coverage: 795 / 812,
  /** Coaching sessions at or above the passing grade (617 of 795). */
  passRate: 617 / 795,
} as const;

/** Share of BMI findings among service gaps at the evaluation (posisi awal of the overweight KPI). */
export const BASELINE_BMI_GAP = 0.3732;

/** IULS and RUST training results of Gapura participants (Apr to Agu 2026). */
export const BASELINE_TRAINING: Readonly<Record<"IULS" | "RUST", { participants: number; passed: number }>> = {
  IULS: { participants: 116, passed: 97 },
  RUST: { participants: 155, passed: 71 },
};

/** Gapura pass rate for one program, or for both together (any other key). */
export function baselinePassRate(key: string): number {
  if (key === "IULS" || key === "RUST") {
    const p = BASELINE_TRAINING[key];
    return p.passed / p.participants;
  }
  const i = BASELINE_TRAINING.IULS;
  const r = BASELINE_TRAINING.RUST;
  return (i.passed + r.passed) / (i.participants + r.participants);
}
