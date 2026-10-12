import type { KpiStatus } from "@/lib/aggregate";
import type {
  ActionFlag,
  ActionKind,
  ActionStatus,
  AssignmentStatus,
  BmiCategory,
  BmiScheduleStatus,
  CoachingStatus,
  Consistency,
  FailureCause,
  RemedialStatus,
  Remark,
  ReplacementPass,
  ReplacementTimeliness,
  Reported,
  Trend,
} from "@/lib/rules";
import { cx } from "./cx";

export type StatusTone = "good" | "warning" | "critical" | "progress" | "neutral";

/** Every status label lib/rules.ts and lib/aggregate.ts can produce. */
export type RuleStatusLabel =
  | Remark
  | Consistency
  | FailureCause
  | CoachingStatus
  | Trend
  | BmiCategory
  | BmiScheduleStatus
  | ActionStatus
  | ActionKind
  | ActionFlag
  | RemedialStatus
  | ReplacementPass
  | ReplacementTimeliness
  | Reported
  | AssignmentStatus
  | KpiStatus;

/*
 * THE tone map (DESIGN.md Tokens). `satisfies` makes it exhaustive: if lib/rules.ts adds or
 * renames a label, the build fails here until it gets a tone. "Lewat <tanggal>" (late
 * replacement) is matched by prefix below. Do not add tone tables anywhere else.
 */
const RULE_TONES = {
  // Training result, consistency, failure cause
  Passed: "good",
  Failed: "critical",
  Sama: "good",
  "Beda – verifikasi": "warning",
  "Kendala operasional & kehadiran (absen role play)": "warning",
  "Role play & post-test belum optimal": "warning",
  "Performa role play belum optimal": "warning",
  // Weekly coaching, remedial, replacement (shared labels)
  Lulus: "good",
  "Belum Lulus": "critical",
  "Menunggu hasil": "warning",
  "Belum dijadwalkan": "warning",
  "Belum training/dinilai": "neutral",
  // Trend
  "▲ Naik": "good",
  "▼ Turun": "warning",
  "= Tetap": "neutral",
  // BMI category
  Kurus: "warning",
  Normal: "good",
  Overweight: "warning",
  Obesitas: "critical",
  // BMI schedule
  Terjadwal: "good",
  "Cek ≤ 7 hari": "warning",
  "Terlambat cek": "critical",
  // Action item status and kind
  "Belum Mulai": "neutral",
  "On Progress": "progress",
  Selesai: "good",
  Tertunda: "neutral",
  Sekali: "neutral",
  Rutin: "progress",
  // Action item flag
  OVERDUE: "critical",
  "Jatuh tempo ≤ 7 hari": "warning",
  "Rutin – pantau": "progress",
  "On Track": "good",
  "Batas waktu belum ditetapkan": "warning",
  // Replacement timeliness, reported
  "Tepat waktu": "good",
  Menunggu: "warning",
  Ya: "good",
  Belum: "warning",
  // Assignment status ("Aktif" stays quiet so exceptions stand out)
  Aktif: "neutral",
  Remedial: "progress",
  "Individual Coaching": "progress",
  "Ditarik dari layanan": "critical",
  // KPI status
  Tercapai: "good",
  "Belum tercapai": "warning",
  "Di atas posisi awal": "good",
  "Di bawah posisi awal": "warning",
  "Belum ada data": "neutral",
} satisfies Record<Exclude<RuleStatusLabel, `Lewat ${string}`>, StatusTone>;

/** Pick-list values lib/rules does not type as a status (Parameter "Ya/Tidak"). */
const LIST_TONES: Record<string, StatusTone> = {
  Tidak: "neutral",
};

const TONE_BY_LABEL = new Map<string, StatusTone>(
  Object.entries({ ...LIST_TONES, ...RULE_TONES }).map(([label, tone]) => [normalise(label), tone]),
);

function normalise(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Tone for a status label. Unknown labels are "neutral". */
export function toneForStatus(label: string | null | undefined): StatusTone {
  if (!label) return "neutral";
  const key = normalise(label);
  if (key.startsWith("lewat ")) return "critical";
  return TONE_BY_LABEL.get(key) ?? "neutral";
}

/*
 * Only exceptions draw the eye: critical / warning / progress get a 4px tinted fill,
 * good and neutral are plain text in their tone colour.
 */
const toneClasses: Record<StatusTone, string> = {
  good: "text-good", // 5.7:1
  neutral: "text-ink-muted", // 6.85:1
  warning: "rounded-status bg-warning-tint px-1.5 text-warning", // 6.07:1
  critical: "rounded-status bg-critical-tint px-1.5 text-critical", // 6.28:1
  progress: "rounded-status bg-progress-tint px-1.5 text-progress", // 6.3:1
};

type StatusChipProps = {
  /** The status text from lib/rules (or the DB), shown as-is. Status is never colour alone. */
  label: string | null | undefined;
  /**
   * Override the looked-up tone. Avoid: add the label to RULE_TONES instead. Kept for
   * labels whose tone depends on context (e.g. "Belum" reported vs. not applicable).
   */
  tone?: StatusTone;
  /** Text shown when label is empty (neutral). */
  emptyLabel?: string;
  className?: string;
};

/** Status label in its tone (DESIGN.md Status labels). Server-component friendly. */
export function StatusChip({ label, tone, emptyLabel = "Belum ada data", className }: StatusChipProps) {
  const hasLabel = Boolean(label && label.trim() !== "");
  const resolved = tone ?? (hasLabel ? toneForStatus(label) : "neutral");
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[resolved],
        className,
      )}
    >
      {hasLabel ? label : emptyLabel}
    </span>
  );
}
