/**
 * Parameter (public.settings, id = 1): labels, short help, and validation that mirrors the table's CHECK
 * constraints (supabase/migrations/*_stations_settings.sql), so the form says what the
 * database would refuse before it is sent. Pure: used by the form and the Server Action.
 *
 * Percent fields (bobot, target) are fractions in the database (0.92) and percentages in
 * the form ("92"), as the workbook formats them ("0%").
 */
import { parseDecimal } from "@/components/ui/Field";

export type SettingKey =
  | "week1_start"
  | "weeks"
  | "bmi_first_check"
  | "bmi_interval_days"
  | "bmi_interval_months"
  | "bmi_periods"
  | "bmi_underweight_below"
  | "bmi_normal_max"
  | "bmi_overweight_max"
  | "pass_grade"
  | "weight_role_play"
  | "weight_post_test"
  | "target_overweight_max"
  | "target_overweight_months"
  | "target_knowledge"
  | "target_interactive"
  | "target_coverage"
  | "coverage_done"
  | "target_pass_rate"
  | "replacement_deadline";

/** "percent": 0–100 in the form, 0–1 in the database. */
export type SettingKind = "date" | "int" | "decimal" | "percent";

export type SettingField = {
  key: SettingKey;
  kind: SettingKind;
  /** Field label. */
  label: string;
  /** One short help line: the allowed range or what the value is used for. */
  help: string;
  unit?: string;
};

export type SettingSection = { id: string; title: string; fields: SettingField[] };

export const SETTING_SECTIONS: SettingSection[] = [
  {
    id: "jadwal",
    title: "Jadwal pemantauan",
    fields: [
      { key: "week1_start", kind: "date", label: "Tanggal mulai Minggu ke-1", help: "Hari Senin." },
      { key: "weeks", kind: "int", label: "Jumlah minggu pemantauan", help: "1 sampai 20.", unit: "minggu" },
    ],
  },
  {
    id: "cek-bmi",
    title: "Cek BMI",
    fields: [
      { key: "bmi_first_check", kind: "date", label: "Tanggal cek BMI ke-1", help: "Cek berikutnya dijadwalkan dari tanggal ini." },
      {
        key: "bmi_interval_days",
        kind: "int",
        label: "Interval cek, ada catatan BMI",
        help: "1 sampai 90 hari.",
        unit: "hari",
      },
      {
        key: "bmi_interval_months",
        kind: "int",
        label: "Interval cek, tanpa catatan BMI",
        help: "1 sampai 12 bulan.",
        unit: "bulan",
      },
      { key: "bmi_periods", kind: "int", label: "Jumlah cek BMI", help: "1 sampai 12.", unit: "kali" },
    ],
  },
  {
    id: "klasifikasi-bmi",
    title: "Klasifikasi BMI",
    fields: [
      {
        key: "bmi_underweight_below",
        kind: "decimal",
        label: "Kurus jika BMI di bawah",
        help: "Kemenkes RI: 18,5.",
      },
      { key: "bmi_normal_max", kind: "decimal", label: "Normal sampai BMI", help: "Kemenkes RI: 25,0." },
      {
        key: "bmi_overweight_max",
        kind: "decimal",
        label: "Overweight sampai BMI",
        help: "Di atasnya Obesitas. Kemenkes RI: 27,0.",
      },
    ],
  },
  {
    id: "kelulusan",
    title: "Kriteria kelulusan",
    fields: [
      { key: "pass_grade", kind: "decimal", label: "Nilai lulus (minimal)", help: "0 sampai 100." },
      {
        key: "weight_role_play",
        kind: "percent",
        label: "Bobot Role Play di Final Result",
        help: "Jumlah kedua bobot 100 %.",
        unit: "%",
      },
      {
        key: "weight_post_test",
        kind: "percent",
        label: "Bobot Post-Test di Final Result",
        help: "Jumlah kedua bobot 100 %.",
        unit: "%",
      },
    ],
  },
  {
    id: "target",
    title: "Target KPI",
    fields: [
      {
        key: "target_overweight_max",
        kind: "percent",
        label: "BMI overweight + obesitas, maksimal",
        help: "Proporsi SDM yang sudah dicek.",
        unit: "%",
      },
      {
        key: "target_overweight_months",
        kind: "int",
        label: "Jangka waktu target BMI",
        help: "1 sampai 36 bulan.",
        unit: "bulan",
      },
      {
        key: "target_knowledge",
        kind: "percent",
        label: "Product Knowledge, minimal",
        help: "Rata-rata skor aspek Product Knowledge.",
        unit: "%",
      },
      {
        key: "target_interactive",
        kind: "percent",
        label: "Interactive Communicating, minimal",
        help: "Rata-rata skor aspek komunikasi.",
        unit: "%",
      },
      {
        key: "target_coverage",
        kind: "int",
        label: "Target cakupan coaching",
        help: "Jumlah frontliner.",
        unit: "orang",
      },
      {
        key: "coverage_done",
        kind: "int",
        label: "Frontliner sudah coaching",
        help: "Perbarui bila ada coaching susulan.",
        unit: "orang",
      },
      {
        key: "target_pass_rate",
        kind: "percent",
        label: "Kelulusan IULS dan RUST setelah remedial",
        help: "Termasuk peserta yang lulus remedial.",
        unit: "%",
      },
    ],
  },
  {
    id: "penggantian",
    title: "Penggantian SDM",
    fields: [
      {
        key: "replacement_deadline",
        kind: "date",
        label: "Batas waktu penggantian SDM",
        help: "Dipakai untuk status ketepatan waktu.",
      },
    ],
  },
];

export const SETTING_FIELDS: SettingField[] = SETTING_SECTIONS.flatMap((s) => s.fields);

const KIND_BY_KEY = new Map(SETTING_FIELDS.map((f) => [f.key, f.kind]));

export type SettingsValues = Record<SettingKey, string>;
export type SettingsErrors = Partial<Record<SettingKey, string>>;

type DateKey = "week1_start" | "bmi_first_check" | "replacement_deadline";

/** The update sent to public.settings: dates as 'YYYY-MM-DD', percentages already as fractions. */
export type SettingsUpdate = { [K in SettingKey]: K extends DateKey ? string : number };

/** Fractions are stored with up to 6 decimals; the form shows percentages with up to 4. */
function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * A DB value as the form shows it: dates as-is, decimals with a comma ("18,5"),
 * percent fields multiplied by 100 ("92").
 */
export function toFormValue(value: string | number | null | undefined, kind: SettingKind = "decimal"): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  const shown = kind === "percent" ? roundTo(value * 100, 4) : value;
  return String(shown).replace(".", ",");
}

/** Form values from a settings row (missing columns become ""). */
export function settingsToFormValues(row: Partial<Record<SettingKey, string | number | null>>): SettingsValues {
  return Object.fromEntries(
    SETTING_FIELDS.map((f) => [f.key, toFormValue(row[f.key], f.kind)]),
  ) as SettingsValues;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** True for a valid date that is not a Monday (the workbook schedules both on Mondays). */
export function notMonday(value: string): boolean {
  return isIsoDate(value) && new Date(`${value}T00:00:00Z`).getUTCDay() !== 1;
}

/**
 * Sum of both weights in percent when both parse, else null. Not a database rule: the form
 * only warns when it is not 100, because Final Result then leaves the 0–100 scale.
 */
export function weightSum(values: Pick<SettingsValues, "weight_role_play" | "weight_post_test">): number | null {
  const rp = parseDecimal(values.weight_role_play.trim());
  const pt = parseDecimal(values.weight_post_test.trim());
  if (rp === null || pt === null || Number.isNaN(rp) || Number.isNaN(pt)) return null;
  return roundTo(rp + pt, 4);
}

function between(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Parses and checks every field; `update` is set only when there are no errors. */
export function validateSettings(values: SettingsValues): { errors: SettingsErrors; update: SettingsUpdate | null } {
  const errors: SettingsErrors = {};
  /** Form-scale numbers (percent fields still 0–100) and dates. */
  const out: Partial<Record<SettingKey, string | number>> = {};

  for (const field of SETTING_FIELDS) {
    const raw = (values[field.key] ?? "").trim();
    if (field.kind === "date") {
      if (raw === "") errors[field.key] = "Wajib diisi.";
      else if (!isIsoDate(raw)) errors[field.key] = "Tanggal tidak valid.";
      else out[field.key] = raw;
      continue;
    }
    const n = parseDecimal(raw);
    if (n === null) {
      errors[field.key] = "Wajib diisi.";
      continue;
    }
    if (Number.isNaN(n)) {
      errors[field.key] = field.kind === "int" ? "Isi bilangan bulat, misalnya 14." : "Isi angka, misalnya 18,5.";
      continue;
    }
    if (field.kind === "int" && !Number.isInteger(n)) {
      errors[field.key] = "Isi bilangan bulat.";
      continue;
    }
    out[field.key] = n;
  }

  const num = (k: SettingKey) => (typeof out[k] === "number" ? (out[k] as number) : null);
  const check = (k: SettingKey, ok: boolean, message: string) => {
    if (!errors[k] && num(k) !== null && !ok) errors[k] = message;
  };

  check("weeks", between(num("weeks") ?? 0, 1, 20), "Isi 1 sampai 20 minggu.");
  check("bmi_interval_days", between(num("bmi_interval_days") ?? 0, 1, 90), "Isi 1 sampai 90 hari.");
  check("bmi_interval_months", between(num("bmi_interval_months") ?? 0, 1, 12), "Isi 1 sampai 12 bulan.");
  check("bmi_periods", between(num("bmi_periods") ?? 0, 1, 12), "Isi 1 sampai 12 slot.");

  const under = num("bmi_underweight_below");
  const normal = num("bmi_normal_max");
  const over = num("bmi_overweight_max");
  check("bmi_underweight_below", (under ?? 0) > 0, "Harus lebih dari 0.");
  if (under !== null && normal !== null) {
    check("bmi_underweight_below", under <= normal, "Tidak boleh di atas batas Normal.");
  }
  if (normal !== null && over !== null) {
    check("bmi_normal_max", normal <= over, "Tidak boleh di atas batas Overweight.");
  }
  check("bmi_overweight_max", (over ?? 0) <= 100, "Tidak boleh di atas 100.");

  check("pass_grade", between(num("pass_grade") ?? -1, 0, 100), "Isi 0 sampai 100.");
  for (const field of SETTING_FIELDS) {
    if (field.kind === "percent") check(field.key, between(num(field.key) ?? -1, 0, 100), "Isi 0 sampai 100 %.");
  }
  check("target_overweight_months", between(num("target_overweight_months") ?? 0, 1, 36), "Isi 1 sampai 36 bulan.");
  check("target_coverage", (num("target_coverage") ?? 0) > 0, "Harus lebih dari 0.");
  check("coverage_done", (num("coverage_done") ?? -1) >= 0, "Tidak boleh negatif.");

  if (Object.keys(errors).length > 0) return { errors, update: null };

  const update = Object.fromEntries(
    Object.entries(out).map(([key, value]) => [
      key,
      KIND_BY_KEY.get(key as SettingKey) === "percent" ? roundTo((value as number) / 100, 6) : value,
    ]),
  ) as SettingsUpdate;
  return { errors, update };
}
