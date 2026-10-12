"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { saveBmiCheck } from "@/components/bmi/actions";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { bmi, bmiCategory, type Settings } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { formatDecimal, toInputText } from "@/lib/format";
import { BmiPersonSheet, CLOSED_SHEET, closeSheet, openSheet, profileIncomplete, type BmiPerson } from "./BmiPersonSheet";
import { hasMoreThanOneDecimal, isPlausibleDate } from "./format";

export type BmiCardSaved = {
  checkDate: string | null;
  heightCm: number;
  weightKg: number;
};

export type BmiCardProps = {
  accessKey: string;
  period: number;
  /** Date a new check gets unless changed: today once the slot has started, else its planned date. */
  defaultDate: string;
  plannedDates: string[];
  settings: Settings;
  person: BmiPerson;
  saved: BmiCardSaved | null;
  /** "Belum dicek · terlambat 3 hari" and its tone. */
  status: { text: string; tone: StatusTone };
  showStation: boolean;
};

type CheckErrors = { date?: string; height?: string; weight?: string };

const CONNECTION_LOST = "Koneksi ke server terputus. Isian masih ada; simpan lagi.";
const HEIGHT_RANGE = "Tinggi 120 sampai 210 cm.";
const WEIGHT_RANGE = "Berat 30 sampai 200 kg.";

const STATUS_TEXT: Record<StatusTone, string> = {
  good: "text-good",
  neutral: "text-ink-muted",
  warning: "text-warning",
  critical: "text-critical",
  progress: "text-progress",
};

function heightError(raw: string, value: number | null): string | undefined {
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Tulis angka, misalnya 165,5.";
  if (hasMoreThanOneDecimal(raw)) return "Cukup satu angka di belakang koma.";
  if (value < 120 || value > 210) return HEIGHT_RANGE;
  return undefined;
}

function weightError(raw: string, value: number | null): string | undefined {
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Tulis angka, misalnya 62,5.";
  if (hasMoreThanOneDecimal(raw)) return "Cukup satu angka di belakang koma.";
  if (value < 30 || value > 200) return WEIGHT_RANGE;
  return undefined;
}

function serverErrors(error: LinkError): CheckErrors {
  if (error.code !== "invalid_input") return {};
  if (error.field === "height_cm") return { height: HEIGHT_RANGE };
  if (error.field === "weight_kg") return { weight: WEIGHT_RANGE };
  if (error.field === "check_date") return { date: "Tanggal cek tidak valid." };
  return {};
}

/**
 * One person on a phone for the chosen slot: name (opens the profile and history sheet),
 * one status line, TB, BB, live BMI and kategori, "Simpan & berikutnya". Enter saves too.
 */
export function BmiCard({
  accessKey,
  period,
  defaultDate,
  plannedDates,
  settings,
  person,
  saved,
  status,
  showStation,
}: BmiCardProps) {
  const savedDate = saved?.checkDate ?? defaultDate;
  const [checkDate, setCheckDate] = useState(savedDate);
  const [height, setHeight] = useState(toInputText(saved?.heightCm));
  const [weight, setWeight] = useState(toInputText(saved?.weightKg));
  const [errors, setErrors] = useState<CheckErrors>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [allDone, setAllDone] = useState(false);
  const [sheet, setSheet] = useState(CLOSED_SHEET);
  const formRef = useRef<HTMLFormElement>(null);

  const heightValue = parseDecimal(height);
  const weightValue = parseDecimal(weight);
  const liveBmi =
    heightError(height, heightValue) === undefined && weightError(weight, weightValue) === undefined
      ? bmi(heightValue, weightValue)
      : null;
  const liveCategory = bmiCategory(liveBmi, settings);

  /** Moves to the next person without a check in this slot. */
  function jumpToNext() {
    let next = formRef.current?.closest("li[data-bmi-row]")?.nextElementSibling ?? null;
    while (next && next.getAttribute("data-checked") !== "false") next = next.nextElementSibling;
    if (!next) {
      setAllDone(true);
      return;
    }
    next.scrollIntoView({ block: "start" });
    next.querySelector<HTMLInputElement>('input[name="height_cm"]')?.focus({ preventScroll: true });
  }

  function run(values: { checkDate: string | null; heightCm: number | null; weightKg: number | null }, goNext = false) {
    setSave({ status: "saving" });
    setAllDone(false);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveBmiCheck>>;
      try {
        result = await saveBmiCheck(accessKey, { staffCode: person.code, period, ...values });
      } catch {
        setConfirmOpen(false);
        setSave({ status: "error", message: CONNECTION_LOST });
        return;
      }
      setConfirmOpen(false);
      if (result.ok) {
        setErrors({});
        setSave({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
        if (result.deleted) setCheckDate(defaultDate);
        else if (goNext) jumpToNext();
        return;
      }
      setErrors(serverErrors(result.error));
      setSave({ status: "error", message: result.error.message });
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const goNext = submitter ? submitter.dataset.next === "true" : true;
    const next: CheckErrors = {
      height: heightError(height, heightValue),
      weight: weightError(weight, weightValue),
    };
    const bothEmpty = heightValue === null && weightValue === null;
    if (bothEmpty && !saved) {
      next.height = "Isi tinggi badan.";
      next.weight = "Isi berat badan.";
    } else if (heightValue === null && weightValue !== null) {
      next.height = "Isi juga tinggi badan.";
    } else if (weightValue === null && heightValue !== null) {
      next.weight = "Isi juga berat badan.";
    }
    if (!bothEmpty && !checkDate) next.date = "Isi tanggal cek.";
    else if (!bothEmpty && !isPlausibleDate(checkDate)) next.date = "Tanggal cek tidak valid.";

    setErrors(next);
    if (next.date || next.height || next.weight) {
      setSave({ status: "idle" });
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (bothEmpty) {
      setConfirmOpen(true);
      return;
    }
    run({ checkDate, heightCm: heightValue, weightKg: weightValue }, goNext);
  }

  function edit(field: keyof CheckErrors, apply: () => void) {
    apply();
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    if (save.status === "saved" || save.status === "error") setSave({ status: "idle" });
  }

  function cancelDelete() {
    if (pending) return;
    setConfirmOpen(false);
    setHeight(toInputText(saved?.heightCm));
    setWeight(toInputText(saved?.weightKg));
  }

  const incomplete = profileIncomplete(person);

  return (
    <li className="flex scroll-mt-4 flex-col" data-bmi-row="" data-checked={saved ? "true" : "false"}>
      <form
        ref={formRef}
        onSubmit={onSubmit}
        noValidate
        aria-label={`Cek BMI ke-${period}, ${person.name}`}
        className="grid grid-cols-2 gap-3 px-4 py-4"
      >
        <div className="col-span-2 flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => setSheet(openSheet)}
              className="min-h-11 min-w-0 text-left text-base font-semibold text-ink underline decoration-line-strong underline-offset-4 [overflow-wrap:anywhere] hover:decoration-brand"
            >
              {person.name}
              <span className="sr-only">, buka profil dan riwayat</span>
            </button>
            {showStation && person.station ? <span className="station-code text-xs text-ink-muted">{person.station}</span> : null}
            {incomplete ? <StatusChip label="Isi profil" tone="warning" /> : null}
          </div>
          <p className={cx("text-sm tabular-nums", STATUS_TEXT[status.tone])}>{status.text}</p>
        </div>

        <Field label="TB" error={errors.height}>
          <NumberInput
            decimal
            unit="cm"
            name="height_cm"
            value={height}
            onChange={(e) => edit("height", () => setHeight(e.target.value))}
          />
        </Field>

        <Field label="BB" error={errors.weight}>
          <NumberInput
            decimal
            unit="kg"
            name="weight_kg"
            value={weight}
            onChange={(e) => edit("weight", () => setWeight(e.target.value))}
          />
        </Field>

        <Field label="Tgl cek" error={errors.date}>
          <Input
            type="date"
            name="check_date"
            value={checkDate}
            onChange={(e) => edit("date", () => setCheckDate(e.target.value))}
            className="tabular-nums"
          />
        </Field>

        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-semibold text-ink">BMI</span>
          <div className="flex min-h-11 flex-wrap items-center gap-2" aria-live="polite">
            {liveBmi !== null ? (
              <>
                <span className="text-base font-semibold text-ink tabular-nums">{formatDecimal(liveBmi, 1)}</span>
                <StatusChip label={liveCategory} />
              </>
            ) : (
              <span className="text-sm text-ink-muted">–</span>
            )}
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button type="submit" data-next="true" loading={pending && !confirmOpen} loadingText="Menyimpan…" className="flex-1">
              Simpan &amp; berikutnya
            </Button>
            <Button type="submit" variant="secondary" data-next="false" disabled={pending}>
              Simpan
            </Button>
          </div>
          <SaveStatus state={save} />
          {allDone ? <span className="text-xs font-semibold text-ink">Semua sudah dicek</span> : null}
        </div>
      </form>

      <BmiPersonSheet
        key={sheet.n}
        open={sheet.open}
        onClose={() => setSheet(closeSheet)}
        accessKey={accessKey}
        person={person}
        plannedDates={plannedDates}
        period={period}
        settings={settings}
      />

      <Dialog
        open={confirmOpen}
        onClose={cancelDelete}
        dismissible={!pending}
        title={`Hapus cek BMI ke-${period}?`}
        description={`TB dan BB ${person.name} pada cek ke-${period} dihapus. Cek lain tidak berubah.`}
        footer={
          <>
            <Button variant="secondary" onClick={cancelDelete} disabled={pending}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={pending}
              loadingText="Menghapus…"
              onClick={() => run({ checkDate: null, heightCm: null, weightKg: null })}
            >
              Hapus cek ke-{period}
            </Button>
          </>
        }
      />
    </li>
  );
}
