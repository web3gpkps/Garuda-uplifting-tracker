/*
 * Tindak Lanjut view model. Every number and label comes from lib/rules.ts (daysLeft,
 * actionFlag); this file only shapes the rows for the screen: which link last changed
 * them, how urgent they are, how the due date reads. Pure and server-safe (the page
 * derives, the client filters).
 */
import { formatTanggal } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import { ACTION_GROUPS, ASPECTS, actionFlag, daysLeft, type ActionFlag, type IsoDate } from "@/lib/rules";
import type { Workspace, WorkspaceActionItem } from "@/lib/workspace";
import { changedVia, lastChangedLabel } from "@/lib/workspace/view";

export const ACTION_STATUSES = ["Belum Mulai", "On Progress", "Selesai", "Tertunda"] as const;
export type ActionStatusValue = (typeof ACTION_STATUSES)[number];

export const ACTION_KINDS = ["Sekali", "Rutin"] as const;

export { ACTION_GROUPS, ASPECTS };

export const NO_DUE_FLAG: ActionFlag = "Batas waktu belum ditetapkan";

export type ActionView = {
  code: string;
  /** Kelompok (Coaching Frontliner, Timeline Training, Evaluasi IULS & RUST). */
  groupName: string;
  aspect: string | null;
  rootCause: string | null;
  action: string | null;
  target: string | null;
  kind: string | null;
  schedule: string | null;
  pic: string | null;
  dueDate: IsoDate | null;
  /** "31 Okt 2026" or null. */
  dueLabel: string | null;
  daysLeft: number | null;
  flag: ActionFlag;
  status: string;
  progress: number;
  updatedOn: IsoDate | null;
  evidence: string | null;
  kpsNotes: string | null;
  /** Where the item came from, e.g. an evaluation report. */
  source: string | null;
  sortOrder: number;
  /** 0 OVERDUE, 1 due within 7 days, 2 no due date, 3 on track / routine, 4 done. */
  urgency: number;
  /** "tautan ini", another link's label, or "pengelola". */
  lastChangedBy: string;
  /** "Diubah lewat tautan ini, 8 Okt 14.05". */
  changedLabel: string;
  updatedAt: string;
};

export function urgencyOf(flag: ActionFlag): number {
  if (flag === "OVERDUE") return 0;
  if (flag === "Jatuh tempo ≤ 7 hari") return 1;
  if (flag === "Selesai") return 4;
  if (flag === NO_DUE_FLAG) return 2;
  return 3;
}

export function toActionView(
  item: WorkspaceActionItem,
  today: IsoDate,
  ws: Pick<Workspace, "linkId" | "linkLabels">,
): ActionView {
  const flag = actionFlag(item, today);
  return {
    code: item.code,
    groupName: item.groupName,
    aspect: item.aspect,
    rootCause: item.rootCause,
    action: item.action,
    target: item.target,
    kind: item.kind,
    schedule: item.schedule,
    pic: item.pic,
    dueDate: item.dueDate,
    dueLabel: item.dueDate ? formatTanggal(item.dueDate) : null,
    daysLeft: daysLeft(item.dueDate, item.status, today),
    flag,
    status: item.status,
    progress: item.progress,
    updatedOn: item.updatedOn,
    evidence: item.evidence,
    kpsNotes: item.kpsNotes,
    source: item.source,
    sortOrder: item.sortOrder ?? 0,
    urgency: urgencyOf(flag),
    lastChangedBy: changedVia(item, ws),
    changedLabel: lastChangedLabel(item, ws),
    updatedAt: item.updatedAt,
  };
}

/** Most urgent first: OVERDUE, due within 7 days, no due date yet, then the rest by days left; done last. */
export function byUrgency(a: ActionView, b: ActionView): number {
  return (
    a.urgency - b.urgency ||
    (a.daysLeft ?? Number.POSITIVE_INFINITY) - (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
    a.sortOrder - b.sortOrder ||
    a.code.localeCompare(b.code)
  );
}

/** Sisa hari in words. Null (done, or no due date) is "Tidak dihitung". */
export function describeDaysLeft(days: number | null): string {
  if (days === null) return "Tidak dihitung";
  const text = relativeDays(days);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function needsAttention(view: Pick<ActionView, "urgency">): boolean {
  return view.urgency <= 1;
}

export type ActionFilters = { group: string | null; status: string; aspect: string };

export function matchesFilters(view: Pick<ActionView, "groupName" | "status" | "aspect">, f: ActionFilters): boolean {
  if (f.group && view.groupName !== f.group) return false;
  if (f.status && view.status !== f.status) return false;
  return !f.aspect || view.aspect === f.aspect;
}

/** `?aspek=` as one of ASPECTS, else "" (all aspects). */
export function parseAspect(raw: string | null | undefined): string {
  return raw && (ASPECTS as readonly string[]).includes(raw) ? raw : "";
}

/** `?kelompok=` as one of ACTION_GROUPS, else null (all groups). */
export function parseGroup(raw: string | null | undefined): string | null {
  return raw && (ACTION_GROUPS as readonly string[]).includes(raw) ? raw : null;
}

/** `?status=` as one of ACTION_STATUSES, else "" (all statuses). */
export function parseStatus(raw: string | null | undefined): string {
  return raw && (ACTION_STATUSES as readonly string[]).includes(raw) ? raw : "";
}
