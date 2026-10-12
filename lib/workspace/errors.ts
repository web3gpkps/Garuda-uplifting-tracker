/**
 * Errors raised by the share_* RPCs (see supabase/migrations/*share_rpcs.sql):
 * - invalid_link   (P0001): unknown or revoked token
 * - out_of_scope   (P0001): the row belongs to another station
 * - forbidden_field        : a KPS-only field sent by a station link
 * - invalid_input  (22023): a value failed validation; `details` names the field
 * Plus, from resolveAccess: unauthorized (the owner's session is gone or not an admin).
 */
export type LinkErrorCode =
  | "invalid_link"
  | "out_of_scope"
  | "forbidden_field"
  | "invalid_input"
  | "unauthorized"
  | "unknown";

export type LinkError = {
  code: LinkErrorCode;
  /** For invalid_input: the field name from `details` (e.g. "height_cm"). */
  field?: string;
  /** Plain-language message for the UI (Bahasa Indonesia). */
  message: string;
};

const MESSAGES: Record<Exclude<LinkErrorCode, "unknown" | "invalid_input" | "unauthorized">, string> = {
  invalid_link: "Tautan tidak berlaku. Minta tautan baru kepada pengelola aplikasi.",
  out_of_scope: "Data ini milik stasiun lain dan tidak bisa diubah lewat tautan ini.",
  forbidden_field: "Isian ini hanya bisa diubah oleh KPS.",
};

/** Shown for any failure the app cannot explain in plain words (never the raw database text). */
export const GENERIC_SAVE_ERROR = "Tidak bisa disimpan. Coba lagi.";

/**
 * Indonesian labels for the fields the share_* RPCs name in `details`. Unknown fields fall
 * back to a generic sentence, so a column name never reaches the screen.
 */
export const FIELD_LABELS: Record<string, string> = {
  week: "Minggu",
  period: "Cek ke",
  staff_code: "ID SDM",
  station: "Stasiun",
  name: "Nama",
  employee_no: "Nomor pegawai",
  gender: "Jenis kelamin",
  program: "Program",
  provider: "Provider",
  touch_point: "Touch point",
  role_play: "Role play",
  post_test: "Post-test",
  final_result: "Nilai akhir",
  report_remark: "Remark laporan",
  feedback: "Feedback",
  notes: "Catatan",
  assignment_status: "Status penugasan",
  bmi_note: "Catatan BMI",
  bmi_has_note: "Ada catatan BMI",
  check_date: "Tanggal cek",
  height_cm: "Tinggi badan",
  weight_kg: "Berat badan",
  score_grooming: "Skor grooming",
  score_knowledge: "Skor product knowledge",
  score_attitude: "Skor attitude",
  score_communication: "Skor komunikasi",
  gap_topic: "Topik gap",
  observer: "Observer",
  coaching_notes: "Catatan coaching",
  status: "Status",
  progress: "Progres",
  kind: "Jenis",
  schedule: "Jadwal",
  pic: "PIC",
  evidence: "Bukti",
  kps_notes: "Catatan KPS",
  root_cause: "Akar masalah",
  action: "Tindakan",
  target: "Target",
  source: "Sumber",
  reason: "Alasan",
  replaced_name: "Nama yang diganti",
  replacement_name: "Nama pengganti",
  reported: "Dilaporkan",
  findings: "Temuan",
};

/** "Tinggi badan tidak valid. Periksa lagi isinya." for a known field, a generic sentence otherwise. */
export function invalidFieldMessage(field: string | undefined): string {
  const label = field ? FIELD_LABELS[field] : undefined;
  return label ? `${label} tidak valid. Periksa lagi isinya.` : "Ada isian yang tidak valid. Periksa lagi isinya.";
}

type PostgrestLikeError = { message?: string; code?: string; details?: string | null };

/**
 * Maps a PostgREST error from a share_* RPC to a code + plain Indonesian message.
 * `field` keeps the raw column name for code that places the error on an input; the
 * message never contains it.
 */
export function toLinkError(error: PostgrestLikeError): LinkError {
  const message = error.message ?? "";
  if (message === "invalid_link" || message === "out_of_scope" || message === "forbidden_field") {
    return { code: message, message: MESSAGES[message] };
  }
  if (message === "invalid_input" || error.code === "22023") {
    const field = error.details ?? undefined;
    return { code: "invalid_input", field, message: invalidFieldMessage(field) };
  }
  return { code: "unknown", message: GENERIC_SAVE_ERROR };
}
