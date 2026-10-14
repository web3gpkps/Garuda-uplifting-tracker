/**
 * Master SDM input checks and RPC arguments (share_save_staff, share_kps_save_staff_baseline).
 * Pure, so the Server Action and the tests share it. The database re-checks everything.
 */
import { ASSIGNMENT_STATUSES, PROGRAMS } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";

export const REMARKS = ["Passed", "Failed"] as const;

export type StaffProfileInput = {
  /** null adds a new staff member (the database assigns the next TMB-xx code). */
  code: string | null;
  program: string | null;
  provider: string | null;
  /** Station code. A station link may leave it empty (its own station is used). */
  station: string | null;
  name: string;
  employeeNo: string | null;
  gender: string | null;
  touchPoint: string | null;
  assignmentStatus: string;
  notes: string | null;
};

/** KPS / owner only. All four are written as given, so send the full baseline. */
export type StaffBaselineInput = {
  rolePlay: number | null;
  postTest: number | null;
  reportRemark: string | null;
  feedback: string | null;
};

export type StaffInput = StaffProfileInput & {
  /** Only when a baseline field changed. */
  baseline: StaffBaselineInput | null;
};

export function blankToNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

function invalid(field: string, message: string): LinkError {
  return { code: "invalid_input", field, message };
}

function oneOf(value: string | null, list: readonly string[]): boolean {
  return value === null || list.includes(value);
}

/** Profile check before the RPC; null when fine. */
export function checkProfile(input: StaffProfileInput): LinkError | null {
  const name = blankToNull(input.name);
  if (!name) return invalid("name", "Nama wajib diisi.");
  if (name.length > 200) return invalid("name", "Nama paling panjang 200 karakter.");
  if (!oneOf(blankToNull(input.program), PROGRAMS)) return invalid("program", "Pilih program IULS atau RUST.");
  if ((blankToNull(input.provider)?.length ?? 0) > 100) return invalid("provider", "Provider paling panjang 100 karakter.");
  if ((blankToNull(input.employeeNo)?.length ?? 0) > 50) {
    return invalid("employee_no", "Employee Number paling panjang 50 karakter.");
  }
  if (!oneOf(blankToNull(input.gender), ["L", "P"])) return invalid("gender", "Pilih L, P, atau kosongkan.");
  // The five listed touch points or free text ("Other"), as the database allows.
  if ((blankToNull(input.touchPoint) ?? "").length > 60) return invalid("touch_point", "Touch point maksimal 60 karakter.");
  if (!(ASSIGNMENT_STATUSES as readonly string[]).includes(input.assignmentStatus)) {
    return invalid("assignment_status", "Pilih status penugasan dari daftar.");
  }
  if ((blankToNull(input.notes)?.length ?? 0) > 4000) return invalid("notes", "Catatan paling panjang 4000 karakter.");
  return null;
}

function pct(value: number | null): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

/** Baseline check before the RPC; null when fine. */
export function checkBaseline(b: StaffBaselineInput): LinkError | null {
  if (!pct(b.rolePlay)) return invalid("role_play", "Role Play harus angka 0 sampai 100.");
  if (!pct(b.postTest)) return invalid("post_test", "Post-Test harus angka 0 sampai 100.");
  if (!oneOf(blankToNull(b.reportRemark), REMARKS)) return invalid("report_remark", "Pilih Passed, Failed, atau kosongkan.");
  if ((blankToNull(b.feedback)?.length ?? 0) > 8000) return invalid("feedback", "Feedback paling panjang 8000 karakter.");
  return null;
}

/** Cast for RPC args: the generated types are non-nullable, the functions accept NULL. */
function nullable<T>(value: T | null): T {
  return value as T;
}

/** share_save_staff arguments without p_token. It writes every field, so send them all. */
export function profileArgs(input: StaffProfileInput) {
  return {
    p_code: nullable(input.code),
    p_program: nullable(blankToNull(input.program)),
    p_provider: nullable(blankToNull(input.provider)),
    p_station: nullable(blankToNull(input.station)),
    p_name: blankToNull(input.name) ?? "",
    p_employee_no: nullable(blankToNull(input.employeeNo)),
    p_gender: nullable(blankToNull(input.gender)),
    p_touch_point: nullable(blankToNull(input.touchPoint)),
    p_assignment_status: input.assignmentStatus,
    p_notes: nullable(blankToNull(input.notes)),
  };
}

/** share_kps_save_staff_baseline arguments without p_token. */
export function baselineArgs(code: string, b: StaffBaselineInput) {
  return {
    p_code: code,
    p_role_play: nullable(b.rolePlay),
    p_post_test: nullable(b.postTest),
    p_report_remark: nullable(blankToNull(b.reportRemark)),
    p_feedback: nullable(blankToNull(b.feedback)),
  };
}

/** Database field errors of share_save_staff in the words of the form. */
export function staffFieldMessage(error: LinkError): LinkError {
  if (error.code !== "invalid_input") return error;
  const messages: Record<string, string> = {
    station: "Pilih unit (stasiun) yang ada di daftar.",
    name: "Nama wajib diisi, paling panjang 200 karakter.",
    program: "Pilih program IULS atau RUST.",
    touch_point: "Touch point maksimal 60 karakter.",
    employee_no: "Employee Number paling panjang 50 karakter.",
    provider: "Provider paling panjang 100 karakter.",
  };
  const message = error.field ? messages[error.field] : undefined;
  return message ? { ...error, message } : error;
}
