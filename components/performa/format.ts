/**
 * Coaching aspects, the 0 to 100 score parser and status tones shared by Log Performa
 * and Master SDM (client-safe, pure).
 */
import { COACHING_ASPECTS } from "@/lib/rules";
import type { StatusTone } from "@/components/ui/StatusChip";

/** The four coaching aspects (lib/rules COACHING_ASPECTS) with their RPC / grid field names. */
export const ASPECT_FIELDS = COACHING_ASPECTS.map((a) => ({
  ...a,
  field: a.key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`) as
    | "score_grooming"
    | "score_knowledge"
    | "score_attitude"
    | "score_communication",
}));

export type AspectField = (typeof ASPECT_FIELDS)[number]["field"];

/** Strict 0 to 100 parse: null for blank, "invalid" for anything else. "87,5" → 87.5. */
export function parseScore(raw: string): number | null | "invalid" {
  const text = raw.trim().replace(/\s+/g, "");
  if (text === "") return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(text)) return "invalid";
  const n = Number(text.replace(",", "."));
  return n >= 0 && n <= 100 ? n : "invalid";
}

/*
 * Tones for the Garuda labels, following the workbook's colour code (hijau / oranye /
 * merah). Passed explicitly to StatusChip so the chips are right whatever its own table holds.
 */
const TONES: Record<string, StatusTone> = {
  Passed: "good",
  Failed: "critical",
  Lulus: "good",
  "Belum Lulus": "critical",
  Sama: "good",
  "Beda – verifikasi": "warning",
  "Kendala operasional & kehadiran (absen role play)": "warning",
  "Role play & post-test belum optimal": "warning",
  "Performa role play belum optimal": "warning",
  Aktif: "neutral",
  Remedial: "warning",
  "Individual Coaching": "progress",
  "Ditarik dari layanan": "critical",
  "▲ Naik": "good",
  "▼ Turun": "warning",
  "= Tetap": "neutral",
};

/** Tone of a Garuda status label; unknown or empty labels are neutral. */
export function toneOf(label: string | null | undefined): StatusTone {
  return (label && TONES[label]) || "neutral";
}
