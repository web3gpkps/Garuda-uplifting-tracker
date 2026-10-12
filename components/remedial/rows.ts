/*
 * Pure view helpers for the Remedial screen: who is on the list, the derived columns, the
 * filters, the order and the counts. No React, no server code,
 * so they are unit tested in rows.test.ts. Formulas stay in lib/rules.
 */
import {
  cleanFloat,
  remedialResult,
  staffBaseline,
  type FailureCause,
  type RemedialStatus,
  type Settings,
  type StaffRow,
  type RemedialRow,
} from "@/lib/rules";
import { formatDecimal } from "@/lib/format";

export const REMEDIAL_STATUSES = ["Belum dijadwalkan", "Menunggu hasil", "Lulus", "Belum Lulus"] as const satisfies
  ReadonlyArray<RemedialStatus>;

export const ABSENT_CAUSE: FailureCause = "Kendala operasional & kehadiran (absen role play)";

type StaffInput = Pick<StaffRow, "code" | "name" | "program" | "station" | "rolePlay" | "postTest" | "reportRemark"> & {
  touchPoint?: string | null;
};

type RemedialInput = RemedialRow & { updatedAt?: string | null; updatedByLink?: string | null };

export type RemedialListRow = {
  code: string;
  name: string;
  program: string | null;
  station: string | null;
  touchPoint: string | null;
  /** Training baseline (Master SDM J/K/L/N/P). */
  baselineRolePlay: number | null;
  baselinePostTest: number | null;
  baselineFinal: number | null;
  /** True when the baseline status is Failed (someone with a remedial row may no longer be). */
  failed: boolean;
  failureCause: FailureCause | null;
  /** The stored remedial row, or null when nothing is recorded yet. */
  remedial: {
    action: string | null;
    remedialOn: string | null;
    rolePlay: number | null;
    postTest: number | null;
    reported: string | null;
    notes: string | null;
    updatedAt: string | null;
    updatedByLink: string | null;
  } | null;
  /** Remedial L: final of the retake. */
  finalResult: number | null;
  /** Remedial M. */
  status: RemedialStatus;
  /** Kenaikan: retake final − Final Result awal. */
  gain: number | null;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * One row per staff member who Failed the training (staffBaseline status), plus anyone that
 * already has a remedial row, in the given staff order.
 */
export function remedialRows(
  staff: readonly StaffInput[],
  remedials: readonly RemedialInput[],
  s: Settings,
): RemedialListRow[] {
  const byStaff = new Map(remedials.map((r) => [r.staffCode, r] as const));
  const out: RemedialListRow[] = [];
  for (const st of staff) {
    const rolePlay = num(st.rolePlay);
    const postTest = num(st.postTest);
    const baseline = staffBaseline({ rolePlay, postTest, reportRemark: st.reportRemark }, s);
    const rem = byStaff.get(st.code) ?? null;
    const failed = baseline.status === "Failed";
    if (!failed && !rem) continue;
    const remedial = rem
      ? {
          action: rem.action ?? null,
          remedialOn: rem.remedialOn ?? null,
          rolePlay: num(rem.rolePlay),
          postTest: num(rem.postTest),
          reported: rem.reported ?? null,
          notes: rem.notes ?? null,
          updatedAt: rem.updatedAt ?? null,
          updatedByLink: rem.updatedByLink ?? null,
        }
      : null;
    const result = remedialResult(
      { action: remedial?.action ?? null, rolePlay: remedial?.rolePlay ?? null, postTest: remedial?.postTest ?? null },
      s,
    );
    out.push({
      code: st.code,
      name: st.name ?? st.code,
      program: st.program,
      station: st.station,
      touchPoint: st.touchPoint ?? null,
      baselineRolePlay: rolePlay,
      baselinePostTest: postTest,
      baselineFinal: baseline.finalResult,
      failed,
      failureCause: baseline.failureCause,
      remedial,
      finalResult: result.finalResult,
      status: result.status,
      gain:
        result.finalResult === null || baseline.finalResult === null
          ? null
          : cleanFloat(result.finalResult - baseline.finalResult),
    });
  }
  return out;
}

export type RemedialFilter = {
  program: string | null;
  status: RemedialStatus | null;
  station: string | null;
};

/** Reads ?program=, ?status= (and the already-parsed station) into a filter. */
export function parseRemedialFilter(
  program: string | undefined,
  status: string | undefined,
  station: string | null,
  programs: readonly string[],
): RemedialFilter {
  const p = program?.toUpperCase();
  return {
    program: p && programs.includes(p) ? p : null,
    status: (REMEDIAL_STATUSES as readonly string[]).includes(status ?? "") ? (status as RemedialStatus) : null,
    station,
  };
}

export function filterRemedialRows(rows: readonly RemedialListRow[], f: RemedialFilter): RemedialListRow[] {
  return rows.filter(
    (r) =>
      (!f.program || r.program === f.program) &&
      (!f.status || r.status === f.status) &&
      (!f.station || r.station === f.station),
  );
}

export type RemedialCounts = {
  /** Peserta Failed (baseline). */
  failed: number;
  /** Has a remedial action or a result (status is not "Belum dijadwalkan"). */
  scheduled: number;
  passed: number;
  notPassed: number;
  waiting: number;
  /** Failed because of an absent role play (failure cause). */
  absentRolePlay: number;
  /** Results already reported (Dilaporkan = Ya). */
  reported: number;
  /** Status "Belum dijadwalkan". */
  unscheduled: number;
};

export function remedialCounts(rows: readonly RemedialListRow[]): RemedialCounts {
  const c: RemedialCounts = {
    failed: 0,
    scheduled: 0,
    passed: 0,
    notPassed: 0,
    waiting: 0,
    absentRolePlay: 0,
    reported: 0,
    unscheduled: 0,
  };
  for (const r of rows) {
    if (r.failed) c.failed += 1;
    if (r.status !== "Belum dijadwalkan") c.scheduled += 1;
    else c.unscheduled += 1;
    if (r.status === "Lulus") c.passed += 1;
    if (r.status === "Belum Lulus") c.notPassed += 1;
    if (r.status === "Menunggu hasil") c.waiting += 1;
    if (r.failureCause === ABSENT_CAUSE) c.absentRolePlay += 1;
    if (r.remedial?.reported === "Ya") c.reported += 1;
  }
  return c;
}

/** Short label of the failure cause for chips and narrow cells. */
export function shortCause(cause: FailureCause | null): string | null {
  if (cause === null) return null;
  if (cause === ABSENT_CAUSE) return "Absen role play";
  if (cause === "Role play & post-test belum optimal") return "Role play & post-test";
  return "Performa role play";
}

const STATUS_ORDER: Record<RemedialStatus, number> = {
  "Belum dijadwalkan": 0,
  "Belum Lulus": 1,
  "Menunggu hasil": 2,
  Lulus: 3,
};

/** "Belum dijadwalkan" first, then Belum Lulus, Menunggu hasil, Lulus; staff order inside each. */
export function byStatus<T extends Pick<RemedialListRow, "status">>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => STATUS_ORDER[a.row.status] - STATUS_ORDER[b.row.status] || a.index - b.index)
    .map((x) => x.row);
}

/** The row's one action: schedule it, enter the result, or change a stored result. */
export function rowAction(row: Pick<RemedialListRow, "remedial" | "finalResult">): "Jadwalkan" | "Isi hasil" | "Ubah" {
  if (!row.remedial?.action) return "Jadwalkan";
  return row.finalResult === null ? "Isi hasil" : "Ubah";
}

/** Score with up to one decimal: "82", "82,5". */
export function formatScore1(value: number | null | undefined): string {
  return formatDecimal(value, 0, 1);
}

/** Kenaikan with its sign: "+8", "-2,5", "0". */
export function formatGain(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return `${value > 0 ? "+" : ""}${formatDecimal(value, 0, 1)}`;
}
