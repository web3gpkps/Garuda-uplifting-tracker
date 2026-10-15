/**
 * The step of a sync run that keeps the structure of the Cek BMI tab in line with Parameter
 * (lib/sync/bmi-structure.ts has the planning; this file reads what it needs, applies the requests and
 * reports). It runs after the data of the run is written, with the settings the run ended with: the
 * merged values of the sheet and the database, so a change made on either side restructures the tab.
 *
 * Opt-in: it only runs when SYNC_BMI_STRUCTURE=on (the data sync is unchanged without it). It rewrites formulas
 * of the live tab, so switch it on after checking a dry run (docs/SYNC.md "Struktur tab Cek BMI").
 */
import { isValidIsoDate } from "../dates";
import { MAX_BMI_PERIODS } from "../bmi-periods";
import { BMI_SHEET, SLOT_WIDTH, planBmiStructure, type BmiStructureSettings } from "./bmi-structure";
import type { SheetsPort } from "./sheets";
import type { Baseline } from "./types";

export interface StructureSummary {
  /** What was (or, in a dry run, would be) changed, in plain words. */
  actions: string[];
  /** Why a change was refused or could not be made. */
  blockers: string[];
  applied: boolean;
}

/** The three settings that decide the structure, from the run's final baseline; null when one is missing. */
export function structureSettings(baseline: Baseline): BmiStructureSettings | null {
  const get = (key: string) => (baseline.tables.settings?.[key] as { value?: unknown } | undefined)?.value;
  const bmiFirstCheck = get("bmi_first_check");
  const bmiIntervalDays = Number(get("bmi_interval_days"));
  const bmiPeriods = Number(get("bmi_periods"));
  if (typeof bmiFirstCheck !== "string" || !isValidIsoDate(bmiFirstCheck)) return null;
  if (!Number.isInteger(bmiIntervalDays) || bmiIntervalDays < 1 || bmiIntervalDays > 90) return null;
  if (!Number.isInteger(bmiPeriods) || bmiPeriods < 1 || bmiPeriods > MAX_BMI_PERIODS) return null;
  return { bmiFirstCheck, bmiIntervalDays, bmiPeriods };
}

export function structureEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SYNC_BMI_STRUCTURE === "on";
}

/**
 * Plan (and, unless `dryRun`, apply) the structure change for `settings`. Needs a port that can run
 * batchUpdate requests; a port without it (the in-memory fakes) leaves the tab alone.
 */
export async function reconcileBmiStructure(
  sheets: SheetsPort,
  settings: BmiStructureSettings,
  opts: { dryRun?: boolean } = {},
): Promise<StructureSummary | null> {
  if (!sheets.batchUpdate) return null;
  const snapshot = await sheets.read([BMI_SHEET, "Parameter", "Laporan Mingguan", "Petunjuk"]);
  const bmi = snapshot.tabs[BMI_SHEET];
  if (!bmi) return { actions: [], blockers: [`Tab "${BMI_SHEET}" tidak ditemukan.`], applied: false };

  // Widths of the last group, so inserted groups look like it.
  const sub = ((bmi.values[4] ?? []) as unknown[]).map((h) => String(h).replace(/\s+/g, " ").trim().toLowerCase());
  const starts = sub.flatMap((h, c) => (h === "tgl cek" ? [c] : []));
  const lastStart = starts[starts.length - 1];
  const lastGroupWidths = lastStart !== undefined && sheets.columnWidths ? await sheets.columnWidths(BMI_SHEET, lastStart, SLOT_WIDTH) : undefined;

  const plan = planBmiStructure({
    bmi,
    parameter: snapshot.tabs.Parameter,
    laporan: snapshot.tabs["Laporan Mingguan"],
    petunjuk: snapshot.tabs.Petunjuk,
    settings,
    lastGroupWidths,
  });
  if (plan.requests.length > 0 && !opts.dryRun) await sheets.batchUpdate(plan.requests);
  return { actions: plan.actions, blockers: plan.blockers, applied: plan.requests.length > 0 && !opts.dryRun };
}
