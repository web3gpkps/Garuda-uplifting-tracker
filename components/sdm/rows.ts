/**
 * Master SDM rows and filters from one Workspace. Pure (no server-only import), unit-tested.
 */
import { PROGRAMS, staffBaseline, startsWithText, type Program, type Settings } from "@/lib/rules";
import type { Workspace, WorkspaceStaff } from "@/lib/workspace";
import { firstParam, lastChangedLabel } from "@/lib/workspace/view";
import type { SdmRow } from "./types";

export const CHECKS = ["beda", "failed", "absen"] as const;
export type Check = (typeof CHECKS)[number];

/** The record checks of the sheet ("Perlu diperiksa"). */
export const MATCHES: Record<Check, (r: SdmRow) => boolean> = {
  beda: (r) => r.consistency === "Beda – verifikasi",
  failed: (r) => r.status === "Failed",
  absen: (r) => startsWithText(r.failureCause, "Kendala"),
};

/** `?cek=` as a check, or null. */
export function parseCheck(raw: string | string[] | undefined): Check | null {
  const value = firstParam(raw);
  return (CHECKS as readonly string[]).includes(value ?? "") ? (value as Check) : null;
}

/** `?program=` as IULS / RUST, or null for "Semua program". */
export function parseProgram(raw: string | string[] | undefined): Program | null {
  const value = firstParam(raw)?.trim().toUpperCase();
  return (PROGRAMS as readonly string[]).includes(value ?? "") ? (value as Program) : null;
}

type RowSource = Pick<Workspace, "linkId" | "linkLabels" | "weeklyScores" | "bmiChecks" | "remedials" | "replacements">;

function countBy<T>(list: readonly T[], key: (item: T) => string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of list) {
    const k = key(item);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

export function toRows(ws: RowSource, list: readonly WorkspaceStaff[], settings: Settings): SdmRow[] {
  const scores = countBy(ws.weeklyScores, (r) => r.staffCode);
  const checks = countBy(ws.bmiChecks, (r) => r.staffCode);
  const remedials = countBy(ws.remedials, (r) => r.staffCode);
  const replacements = countBy(ws.replacements, (r) => r.staffCode);
  return list.map((s) => {
    const derived = staffBaseline(s, settings);
    return {
      code: s.code,
      program: s.program,
      provider: s.provider,
      station: s.station,
      name: s.name,
      employeeNo: s.employeeNo,
      gender: s.gender,
      touchPoint: s.touchPoint,
      rolePlay: s.rolePlay,
      postTest: s.postTest,
      reportRemark: s.reportRemark,
      assignmentStatus: s.assignmentStatus,
      feedback: s.feedback,
      notes: s.notes,
      finalResult: derived.finalResult,
      status: derived.status,
      consistency: derived.consistency,
      failureCause: derived.failureCause,
      changedLabel: lastChangedLabel(s, ws),
      weeklyScoreCount: scores.get(s.code) ?? 0,
      bmiCheckCount: checks.get(s.code) ?? 0,
      remedialCount: remedials.get(s.code) ?? 0,
      replacementCount: replacements.get(s.code) ?? 0,
    };
  });
}
