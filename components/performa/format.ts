/**
 * Coaching aspects and the 0 to 100 score parser shared by Penilaian Mingguan and
 * Data SDM (client-safe, pure). Status tones live in components/ui/StatusChip only.
 */
import { COACHING_ASPECTS } from "@/lib/rules";

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
