"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { bmiCheckName } from "@/lib/bmi-periods";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { COMMITMENT_IDEAL, COMMITMENT_LABEL, COMMITMENT_MAX, commitmentCell, commitmentToSave, needsCommitment } from "@/lib/bmi-commitment";
import { toInputText } from "@/lib/format";
import { bmi, bmiCategory, type BmiCategory, type Settings } from "@/lib/rules";
import { heightError, planCheck, weightError, type CheckErrors, type CheckField, type CheckInputs } from "./entry";
import { checkRhythm, hasNoteLabel, parseHasNote } from "./summary";
import { idOf, type BmiTrackerRow, type EditTarget } from "./tracker-model";

/** What a save came back with: the dialog shows `message` and marks the inputs in `errors`. */
export type SaveOutcome = { ok: true } | { ok: false; message: string; errors?: CheckErrors };

export type EditRequest = { n: number; target: EditTarget };

type EditCellDialogProps = {
  request: EditRequest | null;
  row: BmiTrackerRow | null;
  settings: Settings;
  plannedDates: string[];
  /** "BMI Cek ke-3 (Periode 9-22 Nov 2026)" for every period. */
  labels: string[];
  today: string;
  onClose: () => void;
  saveCheck: (
    code: string,
    period: number,
    check: { checkDate: string | null; heightCm: number; weightKg: number; commitment: string | null },
  ) => Promise<SaveOutcome>;
  deleteCheck: (code: string, period: number) => Promise<SaveOutcome>;
  saveProfile: (code: string, patch: { hasNote: boolean | null } | { fitnessNote: string | null }) => Promise<SaveOutcome>;
};

const FIELD_TITLE: Record<CheckField, string> = {
  date: "Tanggal Cek",
  height: "Tinggi Badan (cm)",
  weight: "Berat Badan (kg)",
};

function titleOf(target: EditTarget): string {
  if (target.kind === "hasNote") return "Ubah Ada Catatan BMI";
  if (target.kind === "fitnessNote") return "Ubah Catatan Program Kebugaran";
  if (target.kind === "commitment") return `Ubah ${COMMITMENT_LABEL}, ${bmiCheckName(target.period)}`;
  return `Ubah ${FIELD_TITLE[target.field]}, ${bmiCheckName(target.period)}`;
}

/**
 * The dialog behind every yellow cell: "Ubah <field>", one input, Batal / Simpan. Enter saves
 * (Ctrl+Enter in the note), Escape closes, and focus goes back to the cell. A check that is not
 * stored yet needs its date, height and weight together, so those inputs share the dialog.
 */
export function EditCellDialog({ request, row, ...rest }: EditCellDialogProps) {
  const open = request !== null && row !== null;
  const [busy, setBusy] = useState(false);
  // Which opening (request.n) is asking "Hapus cek?": the dialog title follows it.
  const [deleting, setDeleting] = useState<number | null>(null);
  const confirmDelete = request !== null && deleting === request.n;
  return (
    <Dialog
      open={open}
      onClose={() => !busy && rest.onClose()}
      dismissible={!busy}
      title={request ? (confirmDelete && request.target.kind === "check" ? `Hapus ${bmiCheckName(request.target.period)}?` : titleOf(request.target)) : "Ubah data"}
      description={request && row ? descriptionOf(request.target, row, rest.labels) : undefined}
      size="sm"
    >
      {request && row ? (
        <EditForm
          key={request.n}
          target={request.target}
          row={row}
          onBusy={setBusy}
          confirmDelete={confirmDelete}
          onConfirmDelete={(on) => setDeleting(on ? request.n : null)}
          {...rest}
        />
      ) : null}
    </Dialog>
  );
}

function descriptionOf(target: EditTarget, row: BmiTrackerRow, labels: string[]): string {
  const base = [row.name, idOf(row)].filter(Boolean).join(" · ");
  if (target.kind !== "check" && target.kind !== "commitment") return base;
  return `${base} · ${labels[target.period - 1] ?? bmiCheckName(target.period)}`;
}

type FormProps = Omit<EditCellDialogProps, "request" | "row"> & {
  target: EditTarget;
  row: BmiTrackerRow;
  onBusy: (busy: boolean) => void;
  confirmDelete: boolean;
  onConfirmDelete: (on: boolean) => void;
};

function EditForm({
  target,
  row,
  settings,
  plannedDates,
  today,
  onClose,
  onBusy,
  confirmDelete,
  onConfirmDelete,
  saveCheck,
  deleteCheck,
  saveProfile,
}: FormProps) {
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const stored = target.kind === "check" || target.kind === "commitment" ? (row.checks[target.period - 1] ?? null) : null;
  const planned = target.kind === "check" ? (plannedDates[target.period - 1] ?? today) : today;

  const [hasNote, setHasNote] = useState(hasNoteLabel(row.hasNote) ?? "");
  const [note, setNote] = useState(row.fitnessNote ?? "");
  const [inputs, setInputs] = useState<CheckInputs>({
    date: stored?.date ?? (today >= planned ? today : planned),
    height: toInputText(stored?.heightCm),
    weight: toInputText(stored?.weightKg),
  });
  // Komitmen/Target: what is typed (a stored "Sudah Ideal" is not text to edit).
  const [commitment, setCommitment] = useState(
    stored ? commitmentCell(bmiCategory(bmi(stored.heightCm, stored.weightKg), settings), stored.commitment).text : "",
  );
  const [errors, setErrors] = useState<CheckErrors & { note?: string }>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // The dialog opens after this form mounts, so focus the first input once it is showing.
  useEffect(() => {
    const frame = requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("input, select, textarea")?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function begin() {
    setBusy(true);
    onBusy(true);
    setMessage("");
    setErrors({});
  }
  function finish(outcome: SaveOutcome) {
    setBusy(false);
    onBusy(false);
    if (outcome.ok) return onClose();
    setMessage(outcome.message);
    if (outcome.errors) setErrors(outcome.errors);
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (target.kind === "hasNote") {
      if (hasNote === (hasNoteLabel(row.hasNote) ?? "")) return onClose();
      begin();
      void saveProfile(row.code, { hasNote: parseHasNote(hasNote) }).then(finish);
      return;
    }
    if (target.kind === "fitnessNote") {
      if (note.length > 2000) return setErrors({ note: "Catatan paling panjang 2000 karakter." });
      if (note.trim() === (row.fitnessNote ?? "").trim()) return onClose();
      begin();
      void saveProfile(row.code, { fitnessNote: note.trim() === "" ? null : note }).then(finish);
      return;
    }
    if (target.kind === "commitment") {
      if (!stored) return onClose();
      const category = bmiCategory(bmi(stored.heightCm, stored.weightKg), settings);
      const next = commitmentToSave(category, commitment);
      if (next === (stored.commitment ?? null)) return onClose();
      begin();
      void saveCheck(row.code, target.period, { checkDate: stored.date, heightCm: stored.heightCm, weightKg: stored.weightKg, commitment: next }).then(finish);
      return;
    }
    const plan = planCheck(inputs);
    if (!plan.ok) {
      setErrors(plan.errors);
      setMessage("Periksa isian yang ditandai.");
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const toSave = commitmentToSave(bmiCategory(bmi(plan.check.heightCm, plan.check.weightKg), settings), commitment);
    const unchanged =
      stored !== null &&
      stored.date === plan.check.checkDate &&
      stored.heightCm === plan.check.heightCm &&
      stored.weightKg === plan.check.weightKg &&
      (stored.commitment ?? null) === toSave;
    if (unchanged) return onClose();
    begin();
    void saveCheck(row.code, target.period, { ...plan.check, commitment: toSave }).then(finish);
  }

  function remove() {
    if (target.kind !== "check") return;
    begin();
    void deleteCheck(row.code, target.period).then((outcome) => {
      finish(outcome);
      if (!outcome.ok) onConfirmDelete(false);
    });
  }

  const noteKeys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  };

  const setInput = (field: CheckField, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const control = (field: CheckField) => {
    if (field === "date") {
      return (
        <Field key={field} label="Tanggal cek" error={errors.date}>
          <Input type="date" value={inputs.date} onChange={(e) => setInput("date", e.target.value)} />
        </Field>
      );
    }
    const label = field === "height" ? "Tinggi badan (cm)" : "Berat badan (kg)";
    return (
      <Field key={field} label={label} error={errors[field]}>
        <NumberInput
          decimal
         
          value={inputs[field]}
          onChange={(e) => setInput(field, e.target.value)}
        />
      </Field>
    );
  };

  // The category of what is typed now decides whether Komitmen/Target is asked for.
  const typedHeight = parseDecimal(inputs.height);
  const typedWeight = parseDecimal(inputs.weight);
  const liveCategory: BmiCategory | null =
    target.kind === "commitment" && stored
      ? bmiCategory(bmi(stored.heightCm, stored.weightKg), settings)
      : typedHeight !== null &&
          typedWeight !== null &&
          heightError(inputs.height) === undefined &&
          weightError(inputs.weight) === undefined
        ? bmiCategory(bmi(typedHeight, typedWeight), settings)
        : null;
  const commitmentField = needsCommitment(liveCategory) ? (
    <Field
      label={COMMITMENT_LABEL}
      help="Target atau komitmen, misalnya penurunan berat badan. Enter menambah baris. Ctrl+Enter menyimpan."
      error={errors.commitment}
    >
      <Textarea
        rows={3}
        maxLength={COMMITMENT_MAX}
        value={commitment}
        onChange={(e) => {
          setCommitment(e.target.value);
          if (errors.commitment) setErrors((prev) => ({ ...prev, commitment: undefined }));
        }}
        onKeyDown={noteKeys}
      />
    </Field>
  ) : liveCategory === "Normal" ? (
    <p className="text-sm text-ink-muted">
      {COMMITMENT_LABEL}: {COMMITMENT_IDEAL}. Hasil BMI Normal, tidak perlu diisi.
    </p>
  ) : null;

  let body;
  if (confirmDelete && target.kind === "check") {
    body = (
      <p className="text-sm text-ink">
        Hapus {bmiCheckName(target.period)} untuk {row.name}? Tanggal, tinggi, dan berat cek itu dikosongkan. Cek lain tidak berubah.
      </p>
    );
  } else if (target.kind === "hasNote") {
    body = (
      <Field
        label="Ada Catatan BMI"
        help={`Hanya catatan. Semua SDM dicek ${checkRhythm(settings)}.`}
      >
        <Select value={hasNote} onChange={(e) => setHasNote(e.target.value)}>
          <option value="">Belum diisi</option>
          <option value="Ya">Ya</option>
          <option value="Tidak">Tidak</option>
        </Select>
      </Field>
    );
  } else if (target.kind === "fitnessNote") {
    body = (
      <Field label="Catatan program kebugaran" help="Enter menambah baris. Ctrl+Enter menyimpan." error={errors.note}>
        <Textarea
          rows={7}
          maxLength={2000}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setErrors({});
          }}
          onKeyDown={noteKeys}
        />
      </Field>
    );
  } else if (target.kind === "commitment") {
    body = commitmentField;
  } else if (stored) {
    body = (
      <div className="flex flex-col gap-4">
        {control(target.field)}
        {commitmentField}
      </div>
    );
  } else {
    const order: CheckField[] = [target.field, ...(["date", "height", "weight"] as const).filter((f) => f !== target.field)];
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {bmiCheckName(target.period)} baru tersimpan setelah tanggal, tinggi, dan berat terisi.
        </p>
        {order.map((field) => control(field))}
        {commitmentField}
      </div>
    );
  }

  const footer = confirmDelete ? (
    <>
      <Button variant="secondary" onClick={() => onConfirmDelete(false)} disabled={busy}>
        Batal
      </Button>
      <Button variant="danger" onClick={remove} loading={busy} loadingText="Menghapus…">
        Hapus {target.kind === "check" ? bmiCheckName(target.period) : "cek"}
      </Button>
    </>
  ) : (
    <>
      {stored && target.kind === "check" ? (
        <Button variant="ghost" className="sm:mr-auto" onClick={() => onConfirmDelete(true)} disabled={busy}>
          Hapus cek
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Batal
      </Button>
      <Button type="submit" form={formId} loading={busy} loadingText="Menyimpan…">
        Simpan
      </Button>
    </>
  );

  return (
    <>
      <form id={formId} ref={form} onSubmit={submit} noValidate className="flex flex-col gap-3">
        {message ? (
          <p role="alert" className="rounded-control bg-critical-tint p-3 text-sm text-critical">
            {message}
          </p>
        ) : null}
        <fieldset disabled={busy} className="min-w-0">
          {body}
        </fieldset>
      </form>
      <DialogActions>{footer}</DialogActions>
    </>
  );
}
