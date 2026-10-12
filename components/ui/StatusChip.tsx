import type {
  ActionFlag,
  ActionKind,
  ActionStatus,
  AssignmentStatus,
  BmiCategory,
  BmiScheduleStatus,
  CoachingStatus,
  Consistency,
  RemedialStatus,
  Remark,
  ReplacementPass,
  ReplacementTimeliness,
  Reported,
  Trend,
} from "@/lib/rules";
import { cx } from "./cx";

export type StatusTone = "good" | "warning" | "critical" | "progress" | "neutral";

/** Every status label lib/rules.ts can produce (the workbook's own wording). */
export type RuleStatusLabel =
  | Remark
  | Consistency
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
  | AssignmentStatus;

/*
 * Tone per label, following the workbook's colour code (Petunjuk: hijau / oranye /
 * merah) as transcribed in DESIGN.md, plus violet for work that is under way. `satisfies`
 * makes this exhaustive: if lib/rules.ts adds or renames a label, the build fails here
 * until it gets a tone. "Lewat <tanggal>" (late replacement) is matched by prefix below.
 */
const RULE_TONES = {
  // Remark laporan training, status kelulusan, konsistensi remark vs status
  Passed: "good",
  Failed: "critical",
  Sama: "good",
  "Beda – verifikasi": "warning",
  // Status coaching mingguan, remedial, penggantian (shared labels)
  Lulus: "good",
  "Belum Lulus": "critical",
  "Menunggu hasil": "warning",
  "Belum dijadwalkan": "warning",
  "Belum training/dinilai": "neutral",
  // Tren nilai
  "▲ Naik": "good",
  "▼ Turun": "warning",
  "= Tetap": "neutral",
  // Kategori BMI
  Kurus: "warning",
  Normal: "good",
  Overweight: "warning",
  Obesitas: "critical",
  // Jadwal cek BMI
  Terjadwal: "good",
  "Cek ≤ 7 hari": "warning",
  "Terlambat cek": "critical",
  // Status dan jenis tindak lanjut
  "Belum Mulai": "neutral",
  "On Progress": "progress",
  Selesai: "good",
  Tertunda: "neutral",
  Sekali: "neutral",
  Rutin: "progress",
  // Flag tindak lanjut
  OVERDUE: "critical",
  "Jatuh tempo ≤ 7 hari": "warning",
  "Rutin – pantau": "progress",
  "On Track": "good",
  "Batas waktu belum ditetapkan": "warning",
  // Ketepatan waktu penggantian, dilaporkan
  "Tepat waktu": "good",
  Menunggu: "warning",
  Ya: "good",
  Belum: "warning",
  // Status penugasan (the default "Aktif" stays quiet so exceptions stand out)
  Aktif: "neutral",
  Remedial: "progress",
  "Individual Coaching": "progress",
  "Ditarik dari layanan": "critical",
} satisfies Record<Exclude<RuleStatusLabel, `Lewat ${string}`>, StatusTone>;

/** Workbook pick-list values that lib/rules does not type as a status (Parameter "Ya/Tidak"). */
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

const toneClasses: Record<StatusTone, string> = {
  good: "bg-good-tint text-good", // 5.7:1
  warning: "bg-warning-tint text-warning", // 6.1:1
  critical: "bg-critical-tint text-critical", // 6.3:1
  progress: "bg-progress-tint text-progress", // 6.3:1
  neutral: "bg-neutral-tint text-neutral", // 5.9:1
};

type StatusChipProps = {
  /** The status text from lib/rules (or the DB), shown as-is. Status is never colour alone. */
  label: string | null | undefined;
  /** Override the looked-up tone (rarely needed). */
  tone?: StatusTone;
  /** Text shown when label is empty. */
  emptyLabel?: string;
  /**
   * 1 px border in the tone's colour. Use inside DataGrid: the yellow input tint is almost
   * as light as the warning tint, so a chip there needs an edge (DESIGN.md --input-tint).
   */
  bordered?: boolean;
  className?: string;
};

const borderClasses: Record<StatusTone, string> = {
  good: "border border-good",
  warning: "border border-warning",
  critical: "border border-critical",
  progress: "border border-progress",
  neutral: "border border-neutral",
};

/** Status label on its tone's tint, 6 px radius. Server-component friendly. */
export function StatusChip({ label, tone, emptyLabel = "Belum ada data", bordered = false, className }: StatusChipProps) {
  const hasLabel = Boolean(label && label.trim() !== "");
  const resolved = tone ?? (hasLabel ? toneForStatus(label) : "neutral");
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center rounded-control px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[resolved],
        bordered && borderClasses[resolved],
        className,
      )}
    >
      {hasLabel ? label : emptyLabel}
    </span>
  );
}
