"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ASSIGNMENT_STATUSES, PROGRAMS, TOUCH_POINTS, staffBaseline, type Settings } from "@/lib/rules";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, NumberInput, Select, Textarea, parseDecimal } from "@/components/ui/Field";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatDecimal } from "@/lib/format";
import { REMARKS, type StaffBaselineInput } from "./staff-input";
import type { SaveStaffAction, SdmRow } from "./types";

type StaffDialogProps = {
  open: boolean;
  onClose: () => void;
  /** null = "Tambah SDM". */
  row: SdmRow | null;
  /** Changes on every open so the form starts from the row's current values. */
  formKey: string;
  accessKey: string;
  isKps: boolean;
  /** Station of a station link; null for KPS (the person picks one). */
  ownStation: string | null;
  stations: string[];
  settings: Settings;
  saveAction: SaveStaffAction;
  onSaved: (message: string) => void;
  /** Owner only: "Hapus SDM" in the edit form (the keyboard path to the delete confirmation). */
  onDelete?: (row: SdmRow) => void;
};

/**
 * Add or edit one staff member. Every link edits the profile (program, provider, name,
 * employee number, L/P, touch point, status penugasan, catatan); KPS and the owner also
 * pick the station and edit the training result (Role Play, Post-Test, Remark, Feedback).
 * Client component.
 */
export function StaffDialog(props: StaffDialogProps) {
  const { open, onClose, row } = props;
  const [saving, setSaving] = useState(false);
  const adding = row === null;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      dismissible={!saving}
      size="md"
      title={adding ? "Tambah SDM" : `Ubah data ${row.name}`}
      description={adding ? "Kode TMB dibuat otomatis." : `${row.code} · ${row.station} · ${row.changedLabel}`}
    >
      {open ? <StaffForm key={props.formKey} {...props} onSavingChange={setSaving} /> : null}
    </Dialog>
  );
}

type Errors = Partial<Record<string, string>>;

function baselineDraft(row: SdmRow | null) {
  return {
    rolePlay: row?.rolePlay == null ? "" : formatDecimal(row.rolePlay, 0, 2),
    postTest: row?.postTest == null ? "" : formatDecimal(row.postTest, 0, 2),
    reportRemark: row?.reportRemark ?? "",
    feedback: row?.feedback ?? "",
  };
}

function testOk(v: number | null): boolean {
  return v === null || (Number.isFinite(v) && v >= 0 && v <= 100);
}

function StaffForm({
  row,
  accessKey,
  isKps,
  ownStation,
  stations,
  settings,
  saveAction,
  onSaved,
  onClose,
  onDelete,
  onSavingChange,
}: StaffDialogProps & { onSavingChange: (saving: boolean) => void }) {
  const id = useId();
  const formId = `${id}-form`;
  const adding = row === null;
  const [station, setStation] = useState(row?.station ?? ownStation ?? "");
  const [program, setProgram] = useState(row?.program ?? "");
  const [provider, setProvider] = useState(row?.provider ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [employeeNo, setEmployeeNo] = useState(row?.employeeNo ?? "");
  const [gender, setGender] = useState(row?.gender ?? "");
  const [touchPoint, setTouchPoint] = useState(row?.touchPoint ?? "");
  const [status, setStatus] = useState(row?.assignmentStatus ?? "Aktif");
  const [notes, setNotes] = useState(row?.notes ?? "");
  const original = baselineDraft(row);
  const [baseline, setBaseline] = useState(original);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);

  // After a failed check, move focus to the first marked field (once it is rendered as invalid).
  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  const rolePlay = parseDecimal(baseline.rolePlay);
  const postTest = parseDecimal(baseline.postTest);
  const preview = staffBaseline(
    {
      rolePlay: rolePlay !== null && Number.isFinite(rolePlay) ? rolePlay : null,
      postTest: postTest !== null && Number.isFinite(postTest) ? postTest : null,
      reportRemark: baseline.reportRemark || null,
    },
    settings,
  );
  const pass = formatDecimal(settings.passGrade, 0, 2);

  function setBusy(value: boolean) {
    setSaving(value);
    onSavingChange(value);
  }

  function validate(): { errors: Errors; baselineInput: StaffBaselineInput | null } {
    const next: Errors = {};
    if (isKps && !station) next.station = "Pilih stasiun.";
    if (name.trim() === "") next.name = "Nama wajib diisi.";
    if (employeeNo.trim().length > 50) next.employee_no = "Employee Number paling panjang 50 karakter.";
    let baselineInput: StaffBaselineInput | null = null;
    if (isKps) {
      if (!testOk(rolePlay)) next.role_play = "Isi angka 0 sampai 100, atau kosongkan.";
      if (!testOk(postTest)) next.post_test = "Isi angka 0 sampai 100, atau kosongkan.";
      const changed =
        baseline.rolePlay.trim() !== original.rolePlay ||
        baseline.postTest.trim() !== original.postTest ||
        baseline.reportRemark !== original.reportRemark ||
        baseline.feedback.trim() !== original.feedback.trim();
      if (changed) {
        baselineInput = {
          rolePlay,
          postTest,
          reportRemark: baseline.reportRemark || null,
          feedback: baseline.feedback,
        };
      }
    }
    return { errors: next, baselineInput };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const { errors: found, baselineInput } = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setFormError("Periksa kolom yang ditandai.");
      setFocusRequest((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await saveAction(accessKey, {
        code: row?.code ?? null,
        program: program || null,
        provider,
        station: station || null,
        name,
        employeeNo,
        gender: gender || null,
        touchPoint: touchPoint || null,
        assignmentStatus: status,
        notes,
        baseline: baselineInput,
      });
      if (result.ok) {
        setBusy(false);
        onSaved(adding ? `${result.code} ${result.name} ditambahkan.` : `Data ${result.code} ${result.name} tersimpan.`);
        onClose();
        return;
      }
      const message = result.saved
        ? `Profil tersimpan, hasil training gagal: ${result.error.message}`
        : result.error.message;
      if (result.error.field) {
        setErrors({ [result.error.field]: result.error.message });
        setFocusRequest((n) => n + 1);
      }
      setFormError(message);
    } catch {
      setFormError("Koneksi terputus. Isian masih ada; coba simpan lagi.");
    }
    setBusy(false);
  }

  return (
    <form ref={formRef} id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {formError ? (
        <p role="alert" className="rounded-control bg-critical-tint px-3 py-2 text-sm font-semibold text-critical">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {isKps ? (
          <Field label="Stasiun" required error={errors.station}>
            <Select value={station} onChange={(e) => setStation(e.target.value)}>
              <option value="">Pilih stasiun</option>
              {stations.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="self-end text-sm text-ink">
            <span className="font-semibold">Stasiun</span> <span className="station-code">{row?.station ?? ownStation}</span>
          </p>
        )}
        <Field label="Program" error={errors.program}>
          <Select value={program} onChange={(e) => setProgram(e.target.value)}>
            <option value="">Belum diisi</option>
            {PROGRAMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Nama" required error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employee Number" error={errors.employee_no}>
          <Input value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} maxLength={50} autoComplete="off" />
        </Field>
        <Field label="Provider" error={errors.provider}>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} maxLength={100} autoComplete="off" />
        </Field>
        <Field label="L/P" help="Untuk kategori BMI" error={errors.gender}>
          <Select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Belum diisi</option>
            <option value="L">L (laki-laki)</option>
            <option value="P">P (perempuan)</option>
          </Select>
        </Field>
        <Field label="Touch Point" error={errors.touch_point}>
          <Select value={touchPoint} onChange={(e) => setTouchPoint(e.target.value)}>
            <option value="">Belum diisi</option>
            {TOUCH_POINTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Status penugasan" error={errors.assignment_status}>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {ASSIGNMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Catatan" error={errors.notes}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={3} />
      </Field>

      {isKps ? (
        <fieldset className="flex flex-col gap-4 rounded-panel border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">Hasil training</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role Play" error={errors.role_play} help="0 sampai 100">
              <NumberInput
                decimal
                value={baseline.rolePlay}
                onChange={(e) => setBaseline({ ...baseline, rolePlay: e.target.value })}
              />
            </Field>
            <Field label="Post-Test" error={errors.post_test} help="0 sampai 100">
              <NumberInput
                decimal
                value={baseline.postTest}
                onChange={(e) => setBaseline({ ...baseline, postTest: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Remark di laporan" error={errors.report_remark}>
            <Select
              value={baseline.reportRemark}
              onChange={(e) => setBaseline({ ...baseline, reportRemark: e.target.value })}
            >
              <option value="">Belum diisi</option>
              {REMARKS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Feedback" error={errors.feedback}>
            <Textarea
              value={baseline.feedback}
              onChange={(e) => setBaseline({ ...baseline, feedback: e.target.value })}
              maxLength={8000}
              rows={3}
            />
          </Field>
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-3" aria-live="polite">
            <div>
              <dt className="section-label">Final Result</dt>
              <dd className="font-semibold tabular-nums">{formatDecimal(preview.finalResult, 1) || "Belum ada nilai"}</dd>
            </div>
            <div>
              <dt className="section-label">Status ≥{pass}</dt>
              <dd>
                <StatusChip label={preview.status} />
              </dd>
            </div>
            <div>
              <dt className="section-label">Cek konsistensi</dt>
              <dd>
                <StatusChip label={preview.consistency} emptyLabel="Belum bisa dicek" />
              </dd>
            </div>
          </dl>
          {preview.failureCause ? <p className="text-sm text-warning">Penyebab utama: {preview.failureCause}.</p> : null}
        </fieldset>
      ) : !adding ? (
        <p className="text-sm text-ink-muted">Hasil training diisi oleh KPS.</p>
      ) : null}

      <DialogActions>
        {onDelete && row ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              onClose();
              onDelete(row);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-control px-3 text-sm font-semibold text-critical transition-colors duration-120 hover:bg-critical-tint sm:mr-auto sm:min-h-10"
          >
            Hapus SDM
          </button>
        ) : null}
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" loading={saving} loadingText={adding ? "Menambahkan…" : "Menyimpan…"}>
          {adding ? "Tambah SDM" : "Simpan data SDM"}
        </Button>
      </DialogActions>
    </form>
  );
}
