"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { createActionItem } from "./actions";
import { ACTION_GROUPS, ACTION_KINDS, ASPECTS } from "./action-view";
import { nextActionCode, type ExistingItem, type NewItemField, type NewItemInput } from "./owner-items";

type AddActionItemButtonProps = {
  accessKey: string;
  /** Every item (code + group), to propose the next free ID; the action re-checks in the database. */
  existing: Pick<ExistingItem, "code" | "groupName">[];
  /** Pre-selected Kelompok (the current filter), if any. */
  defaultGroup: string | null;
};

const EMPTY: Omit<NewItemInput, "groupName" | "code"> = {
  aspect: "",
  rootCause: "",
  action: "",
  target: "",
  kind: "Sekali",
  schedule: "",
  dueDate: "",
  pic: "",
  source: "",
};

/** Owner only: "Tambah butir" opens a form; the ID is proposed as the next free GA-TLnn. */
export function AddActionItemButton({ accessKey, existing, defaultGroup }: AddActionItemButtonProps) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [notice, setNotice] = useState("");

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
      >
        Tambah butir
      </Button>
      <span role="status" aria-live="polite" className="text-sm font-semibold text-good">
        {notice}
      </span>
      <Dialog open={open} onClose={() => setOpen(false)} size="md" title="Tambah butir tindak lanjut">
        {open ? (
          <AddForm
            key={round}
            accessKey={accessKey}
            existing={existing}
            defaultGroup={defaultGroup}
            onCancel={() => setOpen(false)}
            onAdded={(code) => {
              setOpen(false);
              setNotice(`Butir ${code} ditambahkan.`);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}

function AddForm({
  accessKey,
  existing,
  defaultGroup,
  onCancel,
  onAdded,
}: AddActionItemButtonProps & { onCancel: () => void; onAdded: (code: string) => void }) {
  const [group, setGroup] = useState(defaultGroup ?? "");
  const [code, setCode] = useState(() => nextActionCode(existing));
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<NewItemField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: keyof typeof EMPTY) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const local: Partial<Record<NewItemField, string>> = {};
    if (!group) local.groupName = "Pilih kelompok.";
    if (!values.aspect) local.aspect = "Pilih aspek.";
    if (!code.trim()) local.code = "Isi ID butir.";
    if (!values.action.trim()) local.action = "Wajib diisi.";
    setErrors(local);
    setMessage(null);
    if (Object.keys(local).length > 0) return;
    startTransition(async () => {
      try {
        const result = await createActionItem(accessKey, { groupName: group, code, ...values });
        if (result.ok) onAdded(result.code);
        else {
          setErrors(result.fieldErrors ?? {});
          setMessage(result.message);
        }
      } catch {
        setMessage("Server tidak menjawab. Periksa koneksi, lalu coba lagi.");
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kelompok" error={errors.groupName} required>
          <Select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Pilih kelompok</option>
            {ACTION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ID" help="Diusulkan otomatis" error={errors.code} required>
          <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Aspek" error={errors.aspect} required>
          <Select value={values.aspect} onChange={(e) => set("aspect")(e.target.value)}>
            <option value="">Pilih aspek</option>
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sumber" help="Dokumen asal, misalnya laporan evaluasi" error={errors.source}>
          <Input value={values.source} onChange={(e) => set("source")(e.target.value)} />
        </Field>
      </div>
      <Field label="Akar masalah" error={errors.rootCause}>
        <Textarea rows={2} value={values.rootCause} onChange={(e) => set("rootCause")(e.target.value)} />
      </Field>
      <Field label="Tindakan" error={errors.action} required>
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
        <Field label="Batas waktu" help="Kosongkan jika belum ditetapkan." error={errors.dueDate}>
          <Input type="date" value={values.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
        </Field>
      </div>
      <Field label="Jadwal" error={errors.schedule}>
        <Input value={values.schedule} onChange={(e) => set("schedule")(e.target.value)} />
      </Field>
      {message ? (
        <p role="alert" className="text-sm font-semibold text-critical">
          {message}
        </p>
      ) : null}
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" loading={pending} loadingText="Menambahkan…">
          Tambah butir
        </Button>
      </DialogActions>
    </form>
  );
}
