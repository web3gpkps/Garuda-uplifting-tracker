/*
 * Owner-only Tindak Lanjut changes: add a new item, delete an item. Pure logic behind the
 * Server Actions in ./actions.ts, written against a tiny table port so it can be unit-tested
 * with a mocked client (owner-items.test.ts). The guard lives here too: anything but the
 * owner is refused before the table is touched; the admin RLS policy refuses it again.
 */
import { ACTION_GROUPS, ASPECTS } from "@/lib/rules";
import { ACTION_KINDS } from "./action-view";

export type NewItemInput = {
  groupName: string;
  aspect: string;
  code: string;
  rootCause: string;
  action: string;
  target: string;
  kind: string;
  schedule: string;
  dueDate: string;
  pic: string;
  source: string;
};

export type NewItemField = keyof NewItemInput;

export type NewItemRow = {
  code: string;
  group_name: string;
  aspect: string;
  root_cause: string | null;
  action: string;
  target: string | null;
  kind: string | null;
  schedule: string | null;
  due_date: string | null;
  pic: string | null;
  source: string | null;
  status: "Belum Mulai";
  progress: 0;
  sort_order: number;
};

export type ExistingItem = { code: string; groupName: string; sortOrder: number | null };

/** What the owner actions need from action_items (the cookie client under admin RLS). */
export type ActionItemsPort = {
  list: () => Promise<{ data: ExistingItem[]; error: { message: string } | null }>;
  insert: (row: NewItemRow) => Promise<{ error: { code?: string; message: string } | null }>;
  remove: (code: string) => Promise<{ deleted: number; error: { message: string } | null }>;
};

export type OwnerResult =
  | { ok: true; code: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<NewItemField, string>> };

const MAX_TEXT = 4000;
const MAX_SOURCE = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** National codes: GA-TL01 … GA-TL15, new ones continue the numbering. */
export const CODE_PREFIX = "GA-TL";
const CODE = /^GA-TL(\d+)$/i;

export const OWNER_ONLY_MESSAGE = "Hanya pemilik aplikasi yang bisa menambah atau menghapus butir tindak lanjut.";

function clean(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Next free GA-TLnn: one more than the highest number in use, padded to two digits. */
export function nextActionCode(items: readonly Pick<ExistingItem, "code">[]): string {
  const taken = new Set(items.map((i) => i.code.toUpperCase()));
  let n = 0;
  for (const { code } of items) {
    const m = CODE.exec(code);
    if (m) n = Math.max(n, Number(m[1]));
  }
  let next = n + 1;
  while (taken.has(`${CODE_PREFIX}${String(next).padStart(2, "0")}`)) next += 1;
  return `${CODE_PREFIX}${String(next).padStart(2, "0")}`;
}

/** Field checks for "Tambah butir"; the row is null when anything is wrong. */
export function validateNewItem(
  input: NewItemInput,
  existing: readonly ExistingItem[],
): { fieldErrors: Partial<Record<NewItemField, string>>; row: NewItemRow | null } {
  const fieldErrors: Partial<Record<NewItemField, string>> = {};
  const group = clean(input.groupName);
  if (!group || !(ACTION_GROUPS as readonly string[]).includes(group)) fieldErrors.groupName = "Pilih kelompok.";
  const aspect = clean(input.aspect);
  if (!aspect || !(ASPECTS as readonly string[]).includes(aspect)) fieldErrors.aspect = "Pilih aspek.";

  const code = clean(input.code)?.replace(/\s+/g, "") ?? null;
  if (!code) fieldErrors.code = "Isi ID butir, misalnya GA-TL16.";
  else if (code.length > 40) fieldErrors.code = "Paling panjang 40 karakter.";
  else if (existing.some((i) => i.code.toUpperCase() === code.toUpperCase())) fieldErrors.code = `ID ${code} sudah dipakai.`;

  const action = clean(input.action);
  if (!action) fieldErrors.action = "Wajib diisi.";
  const texts = {
    rootCause: clean(input.rootCause),
    action,
    target: clean(input.target),
    schedule: clean(input.schedule),
    pic: clean(input.pic),
  };
  for (const [field, value] of Object.entries(texts) as Array<[NewItemField, string | null]>) {
    if (value && value.length > MAX_TEXT) fieldErrors[field] = `Paling panjang ${MAX_TEXT} karakter.`;
  }
  const source = clean(input.source);
  if (source && source.length > MAX_SOURCE) fieldErrors.source = `Paling panjang ${MAX_SOURCE} karakter.`;

  const kind = clean(input.kind);
  if (kind && !(ACTION_KINDS as readonly string[]).includes(kind)) fieldErrors.kind = "Pilih Sekali atau Rutin.";
  const dueDate = clean(input.dueDate);
  if (dueDate && !isIsoDate(dueDate)) fieldErrors.dueDate = "Tanggal tidak valid.";

  if (Object.keys(fieldErrors).length > 0 || !group || !aspect || !code || !action) return { fieldErrors, row: null };

  // Placed after the last item of its group (ties sort by ID, so a new TL16 follows the group's last item).
  const inGroup = existing.filter((i) => i.groupName === group).map((i) => i.sortOrder ?? 0);
  const all = existing.map((i) => i.sortOrder ?? 0);
  const sortOrder = inGroup.length > 0 ? Math.max(...inGroup) : (all.length > 0 ? Math.max(...all) : 0) + 1;

  return {
    fieldErrors,
    row: {
      code,
      group_name: group,
      aspect,
      root_cause: texts.rootCause,
      action,
      target: texts.target,
      kind,
      schedule: texts.schedule,
      due_date: dueDate,
      pic: texts.pic,
      source,
      status: "Belum Mulai",
      progress: 0,
      sort_order: sortOrder,
    },
  };
}

/** "Tambah butir". `isOwner` must come from the resolved access, never from the client. */
export async function addActionItem(isOwner: boolean, port: ActionItemsPort | null, input: NewItemInput): Promise<OwnerResult> {
  if (!isOwner || !port) return { ok: false, message: OWNER_ONLY_MESSAGE };
  const existing = await port.list();
  if (existing.error) return { ok: false, message: "Tidak bisa disimpan. Coba lagi." };

  const { fieldErrors, row } = validateNewItem(input, existing.data);
  if (!row) return { ok: false, message: "Periksa isian yang ditandai.", fieldErrors };

  const { error } = await port.insert(row);
  if (!error) return { ok: true, code: row.code };
  if (error.code === "23505") {
    return { ok: false, message: `ID ${row.code} sudah dipakai.`, fieldErrors: { code: `ID ${row.code} sudah dipakai.` } };
  }
  if (error.code === "23514" || error.code === "23502") {
    return { ok: false, message: "Ada isian yang tidak valid. Periksa lagi isinya." };
  }
  return { ok: false, message: "Tidak bisa disimpan. Coba lagi." };
}

/** "Hapus butir". */
export async function removeActionItem(isOwner: boolean, port: ActionItemsPort | null, code: string): Promise<OwnerResult> {
  if (!isOwner || !port) return { ok: false, message: OWNER_ONLY_MESSAGE };
  const target = clean(code);
  if (!target) return { ok: false, message: "Butir tidak dikenali." };
  const { deleted, error } = await port.remove(target);
  if (error) return { ok: false, message: "Tidak bisa dihapus. Coba lagi." };
  if (deleted === 0) return { ok: false, message: `Butir ${target} tidak ditemukan; mungkin sudah dihapus.` };
  return { ok: true, code: target };
}
