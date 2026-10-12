/**
 * Log Performa input check and RPC arguments (share_save_weekly_score). Pure, so the
 * Server Action and the tests share it. The database re-checks everything.
 */
import { TOUCH_POINTS } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { ASPECT_FIELDS } from "./format";

export type WeeklyScoreInput = {
  staffCode: string;
  week: number;
  touchPoint: string | null;
  /** The four aspects in COACHING_ASPECTS order (grooming, knowledge, attitude, communication), 0 to 100 or null. */
  scores: Array<number | null>;
  gapTopic: string | null;
  observer: string | null;
  coachingNotes: string | null;
};

/** weekly_scores.week is 1..20 in the table; the function narrows it to settings.weeks. */
export const MAX_WEEK = 20;

function text(value: unknown): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t === "" ? null : t;
}

function invalid(field: string, message: string): LinkError {
  return { code: "invalid_input", field, message };
}

export function checkWeeklyInput(input: WeeklyScoreInput): LinkError | null {
  if (!input || typeof input.staffCode !== "string" || input.staffCode.trim() === "") {
    return invalid("staff_code", "SDM tidak dikenal. Muat ulang halaman lalu coba lagi.");
  }
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > MAX_WEEK) {
    return invalid("week", "Minggu di luar jadwal program. Muat ulang halaman lalu coba lagi.");
  }
  const touch = text(input.touchPoint);
  if (touch !== null && !(TOUCH_POINTS as readonly string[]).includes(touch)) {
    return invalid("touch_point", "Pilih touch point dari daftar.");
  }
  if (!Array.isArray(input.scores) || input.scores.length !== ASPECT_FIELDS.length) {
    return invalid(ASPECT_FIELDS[0].field, "Skor keempat aspek tidak lengkap. Muat ulang halaman lalu coba lagi.");
  }
  for (let i = 0; i < ASPECT_FIELDS.length; i++) {
    const v = input.scores[i];
    if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100)) {
      return invalid(ASPECT_FIELDS[i].field, `Skor ${ASPECT_FIELDS[i].label} harus angka 0 sampai 100.`);
    }
  }
  if ((text(input.gapTopic)?.length ?? 0) > 100) return invalid("gap_topic", "Topik gap paling panjang 100 karakter.");
  if ((text(input.observer)?.length ?? 0) > 200) return invalid("observer", "Observer paling panjang 200 karakter.");
  if ((text(input.coachingNotes)?.length ?? 0) > 4000) {
    return invalid("coaching_notes", "Catatan paling panjang 4000 karakter.");
  }
  return null;
}

/** Cast for RPC args: the generated types are non-nullable, the functions accept NULL. */
function nullable<T>(value: T | null): T {
  return value as T;
}

/** share_save_weekly_score arguments without p_token. Every field empty deletes the row. */
export function weeklyArgs(input: WeeklyScoreInput) {
  const [grooming, knowledge, attitude, communication] = input.scores;
  return {
    p_staff_code: input.staffCode,
    p_week: input.week,
    p_touch_point: nullable(text(input.touchPoint)),
    p_score_grooming: nullable(grooming),
    p_score_knowledge: nullable(knowledge),
    p_score_attitude: nullable(attitude),
    p_score_communication: nullable(communication),
    p_gap_topic: nullable(text(input.gapTopic)),
    p_observer: nullable(text(input.observer)),
    p_coaching_notes: nullable(text(input.coachingNotes)),
  };
}
