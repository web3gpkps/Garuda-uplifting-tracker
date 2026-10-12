/** Small synthetic data set (no real names) for sync tests. Station codes are taken from the staff code. */
import type { DbSnapshot } from "../types";

export const STATION_CODES = ["CGK", "DPS", "KNO", "SUB", "UPG"];

export function settingsRow(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    week1_start: "2026-10-05",
    weeks: 10,
    bmi_first_check: "2026-10-12",
    bmi_interval_days: 14,
    bmi_interval_months: 1,
    bmi_periods: 6,
    bmi_underweight_below: 18.5,
    bmi_normal_max: 25,
    bmi_overweight_max: 27,
    pass_grade: 85,
    weight_role_play: 0.4,
    weight_post_test: 0.6,
    target_overweight_max: 0.2,
    target_overweight_months: 6,
    target_knowledge: 0.9,
    target_interactive: 0.92,
    target_coverage: 812,
    coverage_done: 795,
    target_pass_rate: 1,
    replacement_deadline: "2026-12-14",
    updated_at: "2026-10-07T00:00:00Z",
    ...over,
  };
}

export function staffRow(code: string, n: number, over: Record<string, unknown> = {}) {
  return {
    code,
    program: "IULS",
    provider: "Gapura",
    station: code.slice(0, 3),
    name: `Petugas ${code}`,
    employee_no: String(1000 + n),
    gender: null,
    touch_point: "Check-in Counter",
    role_play: 80,
    post_test: 90,
    report_remark: "Passed",
    assignment_status: "Aktif",
    feedback: null,
    notes: null,
    bmi_has_note: null,
    bmi_note: null,
    sort_order: n,
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_link: null,
    ...over,
  };
}

export function weeklyRow(id: number, staff_code: string, week: number, over: Record<string, unknown> = {}) {
  return {
    id,
    staff_code,
    week,
    touch_point: "Check-in Counter",
    score_grooming: 80,
    score_knowledge: 80,
    score_attitude: 80,
    score_communication: 80,
    gap_topic: null,
    observer: "Supervisor",
    coaching_notes: null,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by: null,
    updated_by_link: null,
    ...over,
  };
}

export function bmiRow(id: number, staff_code: string, period: number, over: Record<string, unknown> = {}) {
  return {
    id,
    staff_code,
    period,
    check_date: "2026-10-12",
    height_cm: 170,
    weight_kg: 65.5,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_user: null,
    updated_by_link: null,
    ...over,
  };
}

export function actionRow(code: string, n: number, over: Record<string, unknown> = {}) {
  return {
    code,
    group_name: "Coaching Frontliner",
    aspect: "Product Knowledge",
    root_cause: null,
    action: `Tindakan ${n}`,
    target: "100%",
    kind: "Sekali",
    schedule: null,
    due_date: "2026-10-30",
    pic: "PIC",
    status: "Belum Mulai",
    progress: 0,
    updated_on: null,
    evidence: null,
    kps_notes: null,
    source: "Slide 15",
    sort_order: n,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_link: null,
    ...over,
  };
}

export function remedialRow(id: number, staff_code: string, over: Record<string, unknown> = {}) {
  return {
    id,
    staff_code,
    action: "Refresher & Remedial Assessment",
    remedial_on: null,
    role_play: null,
    post_test: null,
    reported: "Belum",
    notes: null,
    sort_order: id,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_link: null,
    ...over,
  };
}

export function replacementRow(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    program: "IULS",
    station: "SUB",
    staff_code: null,
    replaced_name: `Diganti ${id}`,
    reason: "Final Result di bawah passing grade",
    withdrawn_on: null,
    replacement_name: null,
    effective_on: null,
    training_on: null,
    post_test: null,
    final_result: null,
    reported: "Belum",
    notes: null,
    sort_order: id,
    updated_at: "2026-10-07T00:00:00Z",
    updated_by_link: null,
    ...over,
  };
}

export function smallDb(): DbSnapshot {
  return {
    stations: STATION_CODES.map((code) => ({ code })),
    settings: [settingsRow()],
    staff: [staffRow("SUB-01", 1), staffRow("SUB-02", 2, { report_remark: "Failed", role_play: 60, assignment_status: "Remedial" }), staffRow("DPS-01", 3)],
    weekly_scores: [weeklyRow(1, "SUB-01", 1), weeklyRow(2, "SUB-02", 1, { score_communication: 70 })],
    bmi_checks: [bmiRow(1, "SUB-01", 1)],
    action_items: [actionRow("GA-TL01", 1), actionRow("GA-TL02", 2, { kind: "Rutin" })],
    remedials: [remedialRow(1, "SUB-02")],
    replacements: [replacementRow(1)],
    weekly_reports: [
      { week: 1, scope: "SUB", findings: "Temuan minggu 1", updated_at: "2026-10-07T00:00:00Z", updated_by_link: null },
      { week: 1, scope: "KPS", findings: "Ringkasan KPS minggu 1", updated_at: "2026-10-07T00:00:00Z", updated_by_link: "00000000-0000-0000-0000-000000000001" },
    ],
  };
}

/** n staff rows for guard tests. */
export function manyStaff(n: number) {
  return Array.from({ length: n }, (_, i) => staffRow(`SUB-${String(i + 1).padStart(2, "0")}`, i + 1));
}
