"use client";

import { use, useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import { cleanFloat, REMEDIAL_ACTIONS, remedialResult, type Settings } from "@/lib/rules";
import type { LinkError } from "@/lib/workspace/errors";
import { toInputText } from "@/lib/format";
import { isPlausibleDate } from "@/components/bmi/format";
import { saveRemedial } from "./actions";
import { CONNECTION_LOST, PageStatusContext, RemedialDeleteButton } from "./RemedialDialogs";
import { formatGain, formatScore1, rowAction, type RemedialListRow } from "./rows";

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

type RemedialEditorProps = {
  accessKey: string;
  row: RemedialListRow;
  settings: Settings;
  /** Full-width button on a phone card. */
  fullWidth?: boolean;
};

/**
 * The row's one action and its dialog (full screen on a phone). "Jadwalkan" asks for the
 * action and date only; "Isi hasil" / "Ubah" adds the retake scores with a live Final ulang,
 * Kenaikan and Status, Dilaporkan and Catatan. share_save_remedial writes every field.
 */
export function RemedialEditor({ accessKey, row, settings, fullWidth }: RemedialEditorProps) {
  const formId = useId();
  const page = use(PageStatusContext);
  const label = rowAction(row);
  const scheduling = label === "Jadwalkan";
  const stored = row.remedial;

  const [open, setOpen] = useState(false);
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
  const live = remedialResult(
    {
      action: action || null,
      rolePlay: scoreError(rolePlay, rpValue) === undefined ? rpValue : null,
      postTest: scoreError(postTest, ptValue) === undefined ? ptValue : null,
    },
    settings,
  );
  const gain =
    live.finalResult === null || row.baselineFinal === null ? null : cleanFloat(live.finalResult - row.baselineFinal);

  function show() {
    setAction(stored?.action ?? "");
    setRemedialOn(stored?.remedialOn ?? "");
    setRolePlay(toInputText(stored?.rolePlay));
    setPostTest(toInputText(stored?.postTest));
    setReported(stored?.reported ?? "");
    setNotes(stored?.notes ?? "");
    setErrors({});
    setSave({ status: "idle" });
    setOpen(true);
  }

  function edit(field: keyof Errors, apply: () => void) {
    apply();
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
    if (save.status === "error") setSave({ status: "idle" });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const next: Errors = {
      action: scheduling && action === "" ? "Pilih tindakan remedial." : undefined,
      rolePlay: scoreError(rolePlay, rpValue),
      postTest: scoreError(postTest, ptValue),
      remedialOn: remedialOn !== "" && !isPlausibleDate(remedialOn) ? "Tanggal tidak valid." : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
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
          page?.set({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
          setSave({ status: "idle" });
          setOpen(false);
        } else {
          setErrors(serverErrors(result.error));
          setSave({ status: "error", message: result.error.message });
        }
      } catch {
        setSave({ status: "error", message: CONNECTION_LOST });
      }
    });
  }

  const meta = [row.code, row.program, row.station].filter(Boolean).join(" · ");

  return (
    <>
      <Button
        size="sm"
        variant={label === "Ubah" ? "ghost" : "secondary"}
        fullWidth={fullWidth}
        onClick={show}
      >
        {label}
        <span className="sr-only"> remedial {row.name}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        dismissible={!pending}
        size="md"
        title={`${scheduling ? "Jadwalkan remedial" : "Hasil remedial"} ${row.name}`}
        description={
          <span className="tabular-nums">
            {meta} · Final awal {row.baselineFinal === null ? "–" : formatScore1(row.baselineFinal)}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" form={formId} loading={pending} loadingText="Menyimpan…">
              {scheduling ? "Simpan jadwal" : "Simpan hasil"}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field label="Tindakan" error={errors.action}>
              <Select value={action} onChange={(e) => edit("action", () => setAction(e.target.value))}>
                <option value="">Belum dipilih</option>
                {REMEDIAL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tgl remedial" error={errors.remedialOn}>
              <Input
                type="date"
                value={remedialOn}
                onChange={(e) => edit("remedialOn", () => setRemedialOn(e.target.value))}
                className="tabular-nums"
              />
            </Field>
          </div>

          {scheduling ? null : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role play ulang" error={errors.rolePlay}>
                  <NumberInput decimal value={rolePlay} onChange={(e) => edit("rolePlay", () => setRolePlay(e.target.value))} />
                </Field>
                <Field label="Post-test ulang" error={errors.postTest}>
                  <NumberInput decimal value={postTest} onChange={(e) => edit("postTest", () => setPostTest(e.target.value))} />
                </Field>
              </div>
              <dl
                aria-live="polite"
                className="grid grid-cols-3 gap-3 rounded-control bg-surface-sunken px-3 py-2 text-sm"
              >
                <div className="flex flex-col">
                  <dt className="text-ink-muted">Final ulang</dt>
                  <dd className="font-semibold text-ink tabular-nums">
                    {live.finalResult === null ? "–" : formatScore1(live.finalResult)}
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-ink-muted">Kenaikan</dt>
                  <dd className="font-semibold text-ink tabular-nums">{gain === null ? "–" : formatGain(gain)}</dd>
                </div>
                <div className="flex flex-col items-start">
                  <dt className="text-ink-muted">Status</dt>
                  <dd>
                    <StatusChip label={live.status} />
                  </dd>
                </div>
              </dl>
              <Field label="Dilaporkan" error={errors.reported} className="sm:max-w-48">
                <Select value={reported} onChange={(e) => edit("reported", () => setReported(e.target.value))}>
                  <option value="">Belum diisi</option>
                  <option value="Ya">Ya</option>
                  <option value="Belum">Belum</option>
                </Select>
              </Field>
              <Field label="Catatan" error={errors.notes}>
                <Textarea value={notes} maxLength={4000} onChange={(e) => edit("notes", () => setNotes(e.target.value))} />
              </Field>
            </>
          )}

          <SaveStatus state={save} />
        </form>
        {stored ? (
          <div className="mt-4 border-t border-line pt-3">
            <RemedialDeleteButton
              accessKey={accessKey}
              staffCode={row.code}
              name={row.name}
              variant="card"
              onDeleted={() => setOpen(false)}
            />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
