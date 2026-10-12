"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, NumberInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { formatTanggal, formatTanggalPendek, isValidIsoDate } from "@/lib/dates";
import { DEFAULT_SETTINGS, bmiCheckDate, weekEnd, weekStart, type Settings } from "@/lib/rules";
import { saveSettings } from "@/app/admin/pengaturan/actions";
import {
  SETTING_SECTIONS,
  notMonday,
  validateSettings,
  weightSum,
  type SettingField,
  type SettingKey,
  type SettingsErrors,
  type SettingsValues,
} from "./settings-schema";

type SettingsFormProps = {
  initial: SettingsValues;
};

function scheduleOf(values: SettingsValues): Settings | null {
  const weeks = Number(values.weeks);
  const interval = Number(values.bmi_interval_days);
  const months = Number(values.bmi_interval_months);
  const periods = Number(values.bmi_periods);
  if (!isValidIsoDate(values.week1_start) || !isValidIsoDate(values.bmi_first_check)) return null;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 20) return null;
  if (!Number.isInteger(interval) || interval < 1 || interval > 90) return null;
  if (!Number.isInteger(months) || months < 1 || months > 12) return null;
  if (!Number.isInteger(periods) || periods < 1 || periods > 12) return null;
  return {
    ...DEFAULT_SETTINGS,
    week1Start: values.week1_start,
    weeks,
    bmiFirstCheck: values.bmi_first_check,
    bmiIntervalDays: interval,
    bmiIntervalMonths: months,
    bmiPeriods: periods,
  };
}

/**
 * Parameter form: every settings column with its label and short help, checked
 * like the database checks it, saved in one update. Typed values survive a failed save.
 */
export function SettingsForm({ initial }: SettingsFormProps) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const dirty = (Object.keys(values) as SettingKey[]).some((k) => values[k] !== saved[k]);
  const schedule = scheduleOf(values);
  const weights = weightSum(values);

  const set = (key: SettingKey, value: string) => setValues((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validateSettings(values);
    setErrors(checked.errors);
    if (!checked.update) {
      setSave({ status: "error", message: "Periksa isian yang ditandai." });
      return;
    }
    setSave({ status: "saving" });
    startTransition(async () => {
      try {
        const result = await saveSettings(values);
        if (result.ok) {
          setSaved(values);
          setSave({ status: "saved", at: result.savedAt });
        } else {
          setErrors(result.errors ?? {});
          setSave({ status: "error", message: result.message });
        }
      } catch {
        setSave({ status: "error", message: "Server tidak menjawab. Coba lagi." });
      }
    });
  }

  function control(field: SettingField) {
    const value = values[field.key];
    if (field.kind === "date") {
      return <Input type="date" value={value} onChange={(e) => set(field.key, e.target.value)} />;
    }
    return (
      <NumberInput
        decimal={field.kind !== "int"}
        unit={field.unit}
        value={value}
        onChange={(e) => set(field.key, e.target.value)}
        alignEnd={false}
      />
    );
  }

  function note(key: SettingKey) {
    if ((key === "week1_start" || key === "bmi_first_check") && notMonday(values[key])) {
      return <p className="text-sm text-warning">Tanggal ini bukan hari Senin.</p>;
    }
    return null;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {SETTING_SECTIONS.map((section) => (
        <Panel key={section.id} id={`param-${section.id}`} title={section.title}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <Field
                    label={field.label}
                    help={field.help}
                    error={errors[field.key]}
                    required
                  >
                    {control(field)}
                  </Field>
                  {note(field.key)}
                </div>
              ))}
            </div>
            {section.id === "jadwal" && schedule ? (
              <p className="text-sm text-ink-muted">
                Minggu ke-1 mulai {formatTanggal(weekStart(1, schedule))} · Minggu ke-{schedule.weeks} berakhir{" "}
                {formatTanggal(weekEnd(schedule.weeks, schedule))}
              </p>
            ) : null}
            {section.id === "cek-bmi" && schedule ? (
              <p className="text-sm text-ink-muted">
                Jadwal cek:{" "}
                {Array.from({ length: schedule.bmiPeriods }, (_, i) => bmiCheckDate(i + 1, schedule))
                  .map((d, i, all) => (i === all.length - 1 ? formatTanggal(d) : formatTanggalPendek(d)))
                  .join(", ")}
              </p>
            ) : null}
            {section.id === "kelulusan" && weights !== null && weights !== 100 ? (
              <p role="note" className="text-sm font-semibold text-warning">
                Jumlah bobot {String(weights).replace(".", ",")} %, harus 100 %.
              </p>
            ) : null}
          </div>
        </Panel>
      ))}

      <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink">{dirty ? "Ada perubahan belum disimpan" : "Tidak ada perubahan"}</p>
          <SaveStatus state={save} />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="secondary"
            disabled={!dirty || pending}
            onClick={() => {
              setValues(saved);
              setErrors({});
              setSave({ status: "idle" });
            }}
          >
            Batalkan perubahan
          </Button>
          <Button type="submit" loading={pending} loadingText="Menyimpan parameter…">
            Simpan parameter
          </Button>
        </div>
      </div>
    </form>
  );
}
