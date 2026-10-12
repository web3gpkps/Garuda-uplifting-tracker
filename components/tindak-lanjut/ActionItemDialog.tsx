"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";
import { isValidIsoDate } from "@/lib/dates";
import { actionFlag } from "@/lib/rules";
import { saveActionDefinition, saveActionProgress } from "@/components/tindak-lanjut/actions";
import {
  ACTION_GROUPS,
  ACTION_KINDS,
  ACTION_STATUSES,
  ASPECTS,
  type ActionView,
} from "./action-view";
import type { DefinitionField, DefinitionInput, ProgressField } from "./types";

type ActionItemDialogProps = {
  accessKey: string;
  /** Today in Asia/Jakarta (default "Tgl update"). */
  today: string;
  /** The item being updated; null closes the dialog. */
  item: ActionView | null;
  onClose: () => void;
  /** Called after a successful save, for the per-row status. */
  onSaved: (code: string, savedAt: string) => void;
};

/**
 * "Perbarui progres" for one national item (KPS links and the owner): Status, % progres,
 * Tgl update, Realisasi / Bukti, and on a second tab the KPS note and the item's definition.
 */
export function ActionItemDialog({ accessKey, today, item, onClose, onSaved }: ActionItemDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={item !== null}
      onClose={() => {
        if (!busy) onClose();
      }}
      dismissible={!busy}
      size="md"
      title={item ? `Perbarui progres ${item.code}` : "Perbarui progres"}
      description={item ? [item.groupName, item.aspect].filter(Boolean).join(" · ") : undefined}
    >
      {item ? (
        // Keyed by code: opening another item starts from that item's saved values.
        <div key={item.code} className="flex flex-col gap-4">
          <ItemSummary item={item} />
          <Tabs
            label={`Bagian yang diubah untuk ${item.code}`}
            items={[
              {
                id: "progres",
                label: "Progres",
                panel: <ProgressForm accessKey={accessKey} today={today} item={item} onBusyChange={setBusy} onSaved={onSaved} />,
              },
              {
                id: "definisi",
                label: "Catatan dan definisi",
                panel: (
                  <DefinitionForm accessKey={accessKey} today={today} item={item} onBusyChange={setBusy} onSaved={onSaved} />
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </Dialog>
  );
}

function Entry({ label, value, wide = true }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-ink">{value ?? <span className="text-ink-muted">–</span>}</dd>
    </div>
  );
}

/** The context above the forms. */
function ItemSummary({ item }: { item: ActionView }) {
  return (
    <dl className="grid gap-3 rounded-control border border-line bg-surface-sunken p-3 sm:grid-cols-2">
      <Entry label="Tindakan" value={item.action} />
      <Entry label="Target (KPI)" value={item.target} />
      <div>
        <dt className="text-xs text-ink-muted">Batas waktu</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="tabular">{item.dueLabel ?? "Belum ditetapkan"}</span>
          <StatusChip label={item.flag} />
        </dd>
      </div>
      <Entry label="PIC" value={item.pic} wide={false} />
      <div className="sm:col-span-2">
        <dt className="sr-only">Perubahan terakhir</dt>
        <dd className="text-xs text-ink-muted">{item.changedLabel}</dd>
      </div>
    </dl>
  );
}

// Progress (KPS and the owner)

type FormProps = {
  accessKey: string;
  today: string;
  item: ActionView;
  onBusyChange: (busy: boolean) => void;
  onSaved: (code: string, savedAt: string) => void;
};

function ProgressForm({ accessKey, today, item, onBusyChange, onSaved }: FormProps) {
  const [status, setStatus] = useState(item.status);
  const [progress, setProgress] = useState(String(item.progress));
  // A new update is dated today unless the person changes it.
  const [updatedOn, setUpdatedOn] = useState(today);
  const [evidence, setEvidence] = useState(item.evidence ?? "");
  const [errors, setErrors] = useState<Partial<Record<ProgressField, string>>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const parsed = parseDecimal(progress);
  const sliderValue = parsed !== null && Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseDecimal(progress);
    if (value === null || !Number.isInteger(value) || value < 0 || value > 100) {
      setErrors({ progress: "Isi bilangan bulat 0 sampai 100." });
      setSave({ status: "error", message: "Periksa isian yang ditandai." });
      return;
    }
    setErrors({});
    setSave({ status: "saving" });
    onBusyChange(true);
    startTransition(async () => {
      try {
        const result = await saveActionProgress(accessKey, {
          code: item.code,
          status,
          progress: value,
          updatedOn,
          evidence,
        });
        if (result.ok) {
          setSave({ status: "saved", at: result.savedAt });
          onSaved(item.code, result.savedAt);
        } else {
          setErrors(result.fieldErrors ?? {});
          setSave({ status: "error", message: result.message });
        }
      } catch {
        setSave({ status: "error", message: "Server tidak menjawab. Periksa koneksi, lalu simpan lagi." });
      } finally {
        onBusyChange(false);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" error={errors.status} required>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tgl update" error={errors.updatedOn}>
          <Input type="date" value={updatedOn} onChange={(e) => setUpdatedOn(e.target.value)} />
        </Field>
      </div>

      <Field label="% Progres" help="0 sampai 100" error={errors.progress} required>
        <NumberInput value={progress} onChange={(e) => setProgress(e.target.value)} className="max-w-32" />
      </Field>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={sliderValue}
        onChange={(e) => setProgress(e.target.value)}
        aria-label={`Geser % progres ${item.code}`}
        aria-valuetext={`${sliderValue}%`}
        className="-mt-2 h-11 w-full cursor-pointer accent-brand sm:h-8"
      />

      <Field label="Realisasi / Bukti" error={errors.evidence}>
        <Textarea
          rows={4}
          value={evidence}
          placeholder="Daftar hadir, checklist, nomor dokumen, atau tautan berkas"
          onChange={(e) => setEvidence(e.target.value)}
        />
      </Field>

      <DialogActions>
        <SaveStatus state={save} className="sm:mr-auto" />
        <Button type="submit" loading={pending} loadingText="Menyimpan progres…">
          Simpan progres
        </Button>
      </DialogActions>
    </form>
  );
}

// KPS note + definition (KPS and the owner)

function DefinitionForm({ accessKey, today, item, onBusyChange, onSaved }: FormProps) {
  const [values, setValues] = useState<Omit<DefinitionInput, "code">>({
    kpsNotes: item.kpsNotes ?? "",
    groupName: item.groupName,
    aspect: item.aspect ?? "",
    rootCause: item.rootCause ?? "",
    action: item.action ?? "",
    target: item.target ?? "",
    kind: item.kind ?? "",
    schedule: item.schedule ?? "",
    dueDate: item.dueDate ?? "",
    pic: item.pic ?? "",
    source: item.source ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<DefinitionField, string>>>({});
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();

  const set = (field: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  // What Flag will show with these values (same rule as the table).
  const due = isValidIsoDate(values.dueDate) ? values.dueDate : null;
  const previewFlag = actionFlag({ dueDate: due, status: item.status, kind: values.kind || null }, today);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setSave({ status: "saving" });
    onBusyChange(true);
    startTransition(async () => {
      try {
        const result = await saveActionDefinition(accessKey, { code: item.code, ...values });
        if (result.ok) {
          setSave({ status: "saved", at: result.savedAt });
          onSaved(item.code, result.savedAt);
        } else {
          setErrors(result.fieldErrors ?? {});
          setSave({ status: "error", message: result.message });
        }
      } catch {
        setSave({ status: "error", message: "Server tidak menjawab. Periksa koneksi, lalu simpan lagi." });
      } finally {
        onBusyChange(false);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Catatan Garuda / KPS" error={errors.kpsNotes}>
        <Textarea rows={3} value={values.kpsNotes} onChange={(e) => set("kpsNotes")(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kelompok" error={errors.groupName} required>
          <Select value={values.groupName} onChange={(e) => set("groupName")(e.target.value)}>
            {ACTION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aspek" error={errors.aspect}>
          <Select value={values.aspect} onChange={(e) => set("aspect")(e.target.value)}>
            <option value="">Belum diisi</option>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Akar masalah" error={errors.rootCause}>
        <Textarea rows={2} value={values.rootCause} onChange={(e) => set("rootCause")(e.target.value)} />
      </Field>
      <Field label="Tindakan" error={errors.action}>
        <Textarea rows={3} value={values.action} onChange={(e) => set("action")(e.target.value)} />
      </Field>
      <Field label="Target (KPI)" error={errors.target}>
        <Textarea rows={2} value={values.target} onChange={(e) => set("target")(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Jenis" error={errors.kind}>
          <Select value={values.kind} onChange={(e) => set("kind")(e.target.value)}>
            <option value="">Belum diisi</option>
            {ACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="PIC" error={errors.pic}>
          <Input value={values.pic} onChange={(e) => set("pic")(e.target.value)} />
        </Field>
        <Field label="Batas waktu" help="Kosongkan jika belum ditetapkan" error={errors.dueDate}>
          <Input type="date" value={values.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
        </Field>
        <Field label="Sumber" help="Dokumen asal, misalnya laporan evaluasi" error={errors.source}>
          <Input value={values.source} onChange={(e) => set("source")(e.target.value)} />
        </Field>
      </div>
      <Field label="Jadwal" error={errors.schedule}>
        <Input value={values.schedule} onChange={(e) => set("schedule")(e.target.value)} />
      </Field>
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted" aria-live="polite">
        Flag <StatusChip label={previewFlag} />
      </p>

      <DialogActions>
        <SaveStatus state={save} className="sm:mr-auto" />
        <Button type="submit" loading={pending} loadingText="Menyimpan definisi…">
          Simpan definisi
        </Button>
      </DialogActions>
    </form>
  );
}
