/*
 * "Perlu ditangani" for one workspace (or one station of KPS): the exceptions, most urgent
 * first. Every status comes from lib/rules and lib/aggregate (actionFlag, daysLeft, the BMI
 * schedule, staffBaseline consistency, remedial status, replacementTimeliness); this file
 * only selects, groups and orders them. Pure: "today" is an argument.
 */
import type { StaffDerived, TrackerData } from "@/lib/aggregate";
import { diffDays, type IsoDate } from "@/lib/dates";
import { isFailedWithoutRemedial, isOnDuty } from "@/lib/dashboard";
import {
  actionFlag,
  coachingAvg,
  daysLeft,
  replacementTimeliness,
  startsWithText,
  type ReplacementTimeliness,
} from "@/lib/rules";

export type DueItem = {
  code: string;
  group: string | null;
  aspect: string | null;
  action: string | null;
  pic: string | null;
  status: string | null;
  flag: "OVERDUE" | "Jatuh tempo ≤ 7 hari";
  dueDate: IsoDate;
  daysLeft: number;
};

export type StaffRef = { code: string; name: string };

/** One station's staff in a group, with the base they are counted against. */
export type StationList = { station: string; staff: StaffRef[]; of: number };

export type StaffGroup = { total: number; of: number; stations: StationList[] };

export type ReplacementAlert = {
  id: number | undefined;
  station: string | null;
  replacedName: string;
  reason: string | null;
  timeliness: ReplacementTimeliness;
};

export type Attention = {
  dueItems: DueItem[];
  /** Staff on duty without a score in `week`; null before the programme. */
  notScored: (StaffGroup & { week: number }) | null;
  /** Staff on duty whose next BMI check date has passed ("Terlambat cek"). */
  lateBmi: StaffGroup;
  /** Failed in the training report without a remedial action. */
  failedNoRemedial: StaffGroup;
  /** Remark in the training report differs from the computed Passed / Failed. */
  beda: StaffGroup;
  replacements: ReplacementAlert[];
  replacementDeadline: IsoDate;
  daysToReplacementDeadline: number;
};

function hasText(v: string | null | undefined): boolean {
  return v != null && v.trim() !== "";
}

/** Groups the staff matching `pick` by station, counted against the staff matching `base`. */
export function groupByStation(
  derived: readonly StaffDerived[],
  stations: readonly string[],
  base: (d: StaffDerived) => boolean,
  pick: (d: StaffDerived) => boolean,
): StaffGroup {
  const named = derived.filter(
    (d) => hasText(d.staff.name) && d.staff.station !== null && stations.includes(d.staff.station) && base(d),
  );
  const list = stations
    .map((station) => {
      const inStation = named.filter((d) => d.staff.station === station);
      return {
        station,
        of: inStation.length,
        staff: inStation.filter(pick).map((d) => ({ code: d.staff.code, name: d.staff.name ?? d.staff.code })),
      };
    })
    .filter((s) => s.staff.length > 0);
  return { total: list.reduce((n, s) => n + s.staff.length, 0), of: named.length, stations: list };
}

export function buildAttention(
  data: TrackerData,
  derived: readonly StaffDerived[],
  stations: readonly string[],
  today: IsoDate,
  /** Running week (the last week after the programme), or null before it. */
  week: number | null,
): Attention {
  const s = data.settings;

  const dueItems: DueItem[] = [];
  for (const it of data.actionItems) {
    const flag = actionFlag(it, today);
    if (flag !== "OVERDUE" && flag !== "Jatuh tempo ≤ 7 hari") continue;
    dueItems.push({
      code: it.code,
      group: it.groupName ?? null,
      aspect: it.aspect ?? null,
      action: it.action ?? null,
      pic: it.pic ?? null,
      status: it.status,
      flag,
      dueDate: it.dueDate!,
      daysLeft: daysLeft(it.dueDate, it.status, today)!,
    });
  }
  dueItems.sort((a, b) => a.daysLeft - b.daysLeft || a.code.localeCompare(b.code));

  const onDuty = (d: StaffDerived) => isOnDuty(d.staff.assignmentStatus);

  let notScored: Attention["notScored"] = null;
  if (week !== null) {
    const scored = new Set(
      data.weeklyScores.filter((r) => r.week === week && coachingAvg(r) !== null).map((r) => r.staffCode),
    );
    notScored = { week, ...groupByStation(derived, stations, onDuty, (d) => !scored.has(d.staff.code)) };
  }

  const replacements: ReplacementAlert[] = [];
  for (const r of data.replacements) {
    const t = replacementTimeliness(r, s, today);
    if (t === "OVERDUE" || t === "Menunggu" || (t !== null && t.startsWith("Lewat"))) {
      replacements.push({
        id: r.id,
        station: r.station ?? null,
        replacedName: r.replacedName ?? "",
        reason: r.reason ?? null,
        timeliness: t,
      });
    }
  }
  replacements.sort((a, b) => urgency(a.timeliness) - urgency(b.timeliness));

  return {
    dueItems,
    notScored,
    lateBmi: groupByStation(derived, stations, onDuty, (d) => d.bmi.scheduleStatus === "Terlambat cek"),
    failedNoRemedial: groupByStation(derived, stations, (d) => d.baseline.status === "Failed", isFailedWithoutRemedial),
    beda: groupByStation(derived, stations, () => true, (d) => startsWithText(d.baseline.consistency, "Beda")),
    replacements,
    replacementDeadline: s.replacementDeadline,
    daysToReplacementDeadline: diffDays(s.replacementDeadline, today),
  };
}

function urgency(t: ReplacementTimeliness): number {
  return t === "OVERDUE" ? 0 : t === "Menunggu" ? 2 : 1;
}

/** Nothing to act on. */
export function isQuiet(a: Attention): boolean {
  return (
    a.dueItems.length === 0 &&
    (a.notScored?.total ?? 0) === 0 &&
    a.lateBmi.total === 0 &&
    a.failedNoRemedial.total === 0 &&
    a.beda.total === 0 &&
    a.replacements.length === 0
  );
}
