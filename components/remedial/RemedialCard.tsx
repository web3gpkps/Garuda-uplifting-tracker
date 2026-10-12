"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { cleanFloat, REMEDIAL_ACTIONS, remedialResult, type Settings } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { toInputText } from "@/lib/format";
import { isPlausibleDate } from "@/components/bmi/format";
import { saveRemedial } from "./actions";
import { CONNECTION_LOST, RemedialDeleteButton } from "./RemedialDialogs";
import { formatGain, formatScore1, remedialTone, type RemedialListRow } from "./rows";

type Errors = Partial<Record<"action" | "remedialOn" | "rolePlay" | "postTest" | "reported" | "notes", string>>;

const SCORE_RANGE = "Isi angka 0 sampai 100.";

function scoreError(raw: string, value: number | null): string | undefined {
  if (value === null) return undefined;
  if (Number.isNaN(value)) return "Tulis angka, misalnya 86,5.";
  if (/[.,]\d{3,}$/.test(raw.trim())) return "Cukup dua angka di belakang koma.";
  if (value < 0 || value > 100) return SCORE_RANGE;
  return undefined;
}

function serverErrors(error: LinkError): Errors {
  if (error.code !== "invalid_input") return {};
  switch (error.field) {
    case "action":
      return { action: "Pilih tindakan dari daftar." };
    case "remedial_on":
      return { remedialOn: "Tanggal remedial tidak valid." };
    case "role_play":
      return { rolePlay: SCORE_RANGE };
    case "post_test":
      return { postTest: SCORE_RANGE };
    case "reported":
      return { reported: "Pilih Ya atau Belum." };
    case "notes":
      return { notes: "Catatan terlalu panjang." };
    default:
      return {};
  }
}

type RemedialCardProps = {
  accessKey: string;
  row: RemedialListRow;
  settings: Settings;
  showStation: boolean;
  /** "Diubah lewat tautan ini, 8 Okt 14.05", or null when nothing is recorded yet. */
  changedLabel: string | null;
};

/**
 * One Failed participant on a phone: the training result and failure cause, then the remedial
 * inputs (44 px controls) with a live Final ulang, Kenaikan and Status, saved with one button.
 */
export function RemedialCard({ accessKey, row, settings, showStation, changedLabel }: RemedialCardProps) {
  const stored = row.remedial;
  const [action, setAction] = useState(stored?.action ?? "");
  const [remedialOn, setRemedialOn] = useState(stored?.remedialOn ?? "");
  const [rolePlay, setRolePlay] = useState(toInputText(stored?.rolePlay));
  const [postTest, setPostTest] = useState(toInputText(stored?.postTest));
  const [reported, setReported] = useState(stored?.reported ?? "");
  const [notes, setNotes] = useState(stored?.notes ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const rpValue = parseDecimal(rolePlay);
  const ptValue = parseDecimal(postTest);
  const rpOk = scoreError(rolePlay, rpValue) === undefined;
  const ptOk = scoreError(postTest, ptValue) === undefined;
  const live = remedialResult(
    { action: action || null, rolePlay: rpOk ? rpValue : null, postTest: ptOk ? ptValue : null },
    settings,
  );
  const gain =
    live.finalResult === null || row.baselineFinal === null ? null : cleanFloat(live.finalResult - row.baselineFinal);

  const dirty =
    action !== (stored?.action ?? "") ||
    remedialOn !== (stored?.remedialOn ?? "") ||
    rpValue !== (stored?.rolePlay ?? null) ||
    ptValue !== (stored?.postTest ?? null) ||
    reported !== (stored?.reported ?? "") ||
    notes.trim() !== (stored?.notes ?? "").trim();

  function edit(field: keyof Errors, apply: () => void) {
    apply();
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    if (save.status === "saved" || save.status === "error" || save.status === "deleted") setSave({ status: "idle" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next: Errors = {
      rolePlay: scoreError(rolePlay, rpValue),
      postTest: scoreError(postTest, ptValue),
      remedialOn: remedialOn !== "" && !isPlausibleDate(remedialOn) ? "Tanggal belum lengkap atau tidak valid." : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      setSave({ status: "idle" });
      const form = event.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSave({ status: "saving" });
    startTransition(async () => {
      try {
        const result = await saveRemedial(accessKey, {
          staffCode: row.code,
          action: action || null,
          remedialOn: remedialOn || null,
          rolePlay: rpValue,
          postTest: ptValue,
          reported: reported === "Ya" || reported === "Belum" ? reported : null,
          notes: notes.trim() === "" ? null : notes,
        });
        if (result.ok) {
          setErrors({});
          setSave({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
        } else {
          setErrors(serverErrors(result.error));
          setSave({ status: "error", message: result.error.message });
        }
      } catch {
        setSave({ status: "error", message: CONNECTION_LOST });
      }
    });
  }

  const meta = [row.code, row.program, showStation && row.station ? `Stasiun ${row.station}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article aria-labelledby={`remedial-${row.code}`} className="flex flex-col rounded-panel border border-line bg-surface">
      <header className="flex flex-col gap-1 px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={`remedial-${row.code}`} className="font-semibold text-ink [overflow-wrap:anywhere]">
            {row.name}
          </h3>
          <StatusChip label={live.status} tone={remedialTone(live.status)} />
        </div>
        <p className="text-xs text-ink-muted">{meta}</p>
        <p className="text-sm text-ink">
          Final awal{" "}
          <span className="font-semibold tabular-nums">
            {row.baselineFinal === null ? "belum ada" : formatScore1(row.baselineFinal)}
          </span>
          {row.failureCause ? <span className="text-ink-muted"> · {row.failureCause}</span> : null}
          {!row.failed ? <span className="text-ink-muted"> · hasil training tidak Failed</span> : null}
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate aria-label={`Remedial ${row.name}`} className="grid grid-cols-2 gap-3 px-4 py-4 sm:px-6">
        <Field label="Tindakan" error={errors.action} className="col-span-2">
          <Select value={action} onChange={(e) => edit("action", () => setAction(e.target.value))}>
            <option value="">Belum dipilih</option>
            {REMEDIAL_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tgl remedial" error={errors.remedialOn} className="col-span-2">
          <Input
            type="date"
            value={remedialOn}
            onChange={(e) => edit("remedialOn", () => setRemedialOn(e.target.value))}
            className="tabular-nums"
          />
        </Field>
        <Field label="Role play ulang" error={errors.rolePlay}>
          <NumberInput decimal value={rolePlay} onChange={(e) => edit("rolePlay", () => setRolePlay(e.target.value))} />
        </Field>
        <Field label="Post-test ulang" error={errors.postTest}>
          <NumberInput decimal value={postTest} onChange={(e) => edit("postTest", () => setPostTest(e.target.value))} />
        </Field>
        <dl className="col-span-2 grid grid-cols-2 gap-3 rounded-control bg-neutral-tint px-3 py-2 text-sm">
          <div className="flex flex-col">
            <dt className="text-ink-muted">Final ulang</dt>
            <dd className="font-semibold text-ink tabular-nums">
              {live.finalResult === null ? "muncul setelah kedua nilai diisi" : formatScore1(live.finalResult)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-muted">Kenaikan</dt>
            <dd className="font-semibold text-ink tabular-nums">{gain === null ? "-" : formatGain(gain)}</dd>
          </div>
        </dl>
        <Field label="Dilaporkan" error={errors.reported}>
          <Select value={reported} onChange={(e) => edit("reported", () => setReported(e.target.value))}>
            <option value="">Belum diisi</option>
            <option value="Ya">Ya</option>
            <option value="Belum">Belum</option>
          </Select>
        </Field>
        <Field label="Catatan" error={errors.notes} className="col-span-2">
          <Textarea value={notes} maxLength={4000} onChange={(e) => edit("notes", () => setNotes(e.target.value))} />
        </Field>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Button type="submit" loading={pending} loadingText="Menyimpan…">
            Simpan remedial
          </Button>
          <SaveStatus state={save} />
          {dirty && save.status !== "saving" ? (
            <span className="text-xs text-ink-muted">Ada perubahan yang belum disimpan</span>
          ) : null}
        </div>
      </form>

      {stored || changedLabel ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-6">
          <p className="text-xs text-ink-muted">{changedLabel}</p>
          {stored ? <RemedialDeleteButton accessKey={accessKey} staffCode={row.code} name={row.name} variant="card" /> : null}
        </footer>
      ) : null}
    </article>
  );
}
