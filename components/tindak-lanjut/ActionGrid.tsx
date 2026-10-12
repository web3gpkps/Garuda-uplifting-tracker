"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { actionFlag, daysLeft } from "@/lib/rules";
import { saveActionDefinition, saveActionProgress } from "./actions";
import { ActionItemDialog } from "./ActionItemDialog";
import { DeleteActionItemDialog } from "./DeleteActionItemDialog";
import {
  ACTION_GROUPS,
  ACTION_KINDS,
  ACTION_STATUSES,
  ASPECTS,
  FLAG_FILTERS,
  READ_ONLY_NOTE,
  byUrgency,
  byWorkbookOrder,
  describeDaysLeft,
  matchesFilters,
  needsAttention,
  type ActionFilters,
  type ActionView,
} from "./action-view";
import type { DefinitionField, ProgressField } from "./types";

type ActionGridProps = {
  accessKey: string;
  /** KPS links and the owner. Station links get a read-only grid. */
  canEdit: boolean;
  isOwner: boolean;
  today: string;
  items: ActionView[];
  /** From ?aspek=, "" for all aspects. */
  initialAspect: string;
  /** Show the Kelompok column (no group filter). */
  showGroup: boolean;
  caption: string;
  /** Cards + dialog for phones (< 900 px). */
  phone: ReactNode;
};

type Filters = ActionFilters & { order: "urgency" | "id" };

const PROGRESS_KEYS: Record<string, ProgressField> = {
  status: "status",
  progress: "progress",
  updated_on: "updatedOn",
  evidence: "evidence",
};
const DEFINITION_KEYS: Record<string, DefinitionField> = {
  group_name: "groupName",
  aspect: "aspect",
  root_cause: "rootCause",
  action: "action",
  target: "target",
  kind: "kind",
  schedule: "schedule",
  due_date: "dueDate",
  pic: "pic",
  kps_notes: "kpsNotes",
  source: "source",
};
const GRID_KEY: Record<string, string> = Object.fromEntries(
  [...Object.entries(PROGRESS_KEYS), ...Object.entries(DEFINITION_KEYS)].map(([grid, field]) => [field, grid]),
);

const rowKey = (r: ActionView) => r.code;
const rowLabel = (r: ActionView) => `${r.code}, ${r.aspect ?? "tanpa aspek"}`;
const SEARCH = {
  placeholder: "ID, tindakan, akar masalah, PIC",
  text: (r: ActionView) => `${r.code} ${r.aspect ?? ""} ${r.action ?? ""} ${r.rootCause ?? ""} ${r.pic ?? ""} ${r.source ?? ""}`,
};

/** The order is taken when a filter changes, not on every save, so a row never jumps away while it is edited. */
function orderOf(items: ActionView[], f: Filters): string[] {
  return items
    .filter((v) => matchesFilters(v, f))
    .sort(f.order === "urgency" ? byUrgency : byWorkbookOrder)
    .map((v) => v.code);
}

function chip(value: CellValue, empty?: string) {
  return value ? <StatusChip label={String(value)} bordered /> : empty ? <span className="text-ink-muted">{empty}</span> : null;
}

const toolSelect =
  "select-control min-h-10 rounded-control border border-line-strong bg-surface pl-3 text-sm text-ink hover:border-ink";

/**
 * Tindak Lanjut as a spreadsheet (docs/UX.md §2). For KPS and the owner the yellow cells are
 * Status, % Progres, Tgl update, Realisasi / Bukti, Catatan Garuda / KPS and the item's
 * definition; white cells (Flag, Sisa hari) follow the row as typed. Each row saves itself:
 * progress through share_update_action_item, the rest through share_kps_update_action_item,
 * each merged with the stored row. Station links get the same grid read-only. Client component.
 */
export function ActionGrid({ accessKey, canEdit, isOwner, today, items, initialAspect, showGroup, caption, phone }: ActionGridProps) {
  // Today is fixed for this page view; memoising columns on it keeps the grid steady after saves.
  const [fixedToday] = useState(today);
  const initialFilters: Filters = { status: "", flag: "", aspect: initialAspect, order: "urgency" };
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [order, setOrder] = useState<string[]>(() => orderOf(items, initialFilters));
  const [opened, setOpened] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const changeFilters = (next: Partial<Filters>) => {
    const merged = { ...filters, ...next };
    setFilters(merged);
    setOrder(orderOf(items, merged));
  };

  const rows = useMemo(() => {
    const byCode = new Map(items.map((v) => [v.code, v] as const));
    const listed = order.map((code) => byCode.get(code)).filter((v): v is ActionView => v !== undefined);
    const known = new Set(order);
    // Items added since the order was taken (owner "Tambah butir") go to the end.
    const added = items.filter((v) => !known.has(v.code) && matchesFilters(v, filters));
    return [...listed, ...added];
  }, [items, order, filters]);

  const columns = useMemo<GridColumn<ActionView>[]>(() => {
    const t = fixedToday;
    const ruleRow = (row: ActionView, value: (key: string) => CellValue) => ({
      dueDate: (value("due_date") as string | null) ?? null,
      status: (value("status") as string | null) ?? row.status,
      kind: (value("kind") as string | null) ?? null,
    });
    const definition = "Definisi butir";
    const list: GridColumn<ActionView>[] = [
      { key: "code", header: "ID", width: 100, editor: "readonly", frozen: true },
      {
        key: "aspect",
        header: "Aspek",
        width: 200,
        editor: "select",
        options: ASPECTS.map((value) => ({ value })),
        frozen: true,
      },
    ];
    if (showGroup) {
      list.push({
        key: "group_name",
        header: "Kelompok",
        width: 176,
        editor: "select",
        required: true,
        options: ACTION_GROUPS.map((value) => ({ value })),
        get: (r) => r.groupName,
      });
    }
    list.push(
      {
        key: "flag",
        header: "Flag",
        group: "Dihitung otomatis",
        width: 216,
        editor: "readonly",
        derive: (row, value) => actionFlag(ruleRow(row, value), t),
        render: (v) => chip(v),
      },
      {
        key: "days_left",
        header: "Sisa hari",
        group: "Dihitung otomatis",
        width: 112,
        editor: "readonly",
        align: "start",
        derive: (row, value) => {
          const r = ruleRow(row, value);
          return daysLeft(r.dueDate, r.status, t);
        },
        render: (v) => {
          const days = typeof v === "number" ? v : null;
          return (
            <span className={days !== null && days < 0 ? "font-semibold text-critical" : days === null ? "text-ink-muted" : undefined}>
              {describeDaysLeft(days)}
            </span>
          );
        },
      },
      {
        key: "status",
        header: "Status",
        group: "Progres (diisi setiap minggu)",
        width: 140,
        editor: "select",
        required: true,
        options: ACTION_STATUSES.map((value) => ({ value })),
        render: (v) => chip(v),
      },
      {
        key: "progress",
        header: "% Progres",
        label: "% Progres (0 sampai 100)",
        group: "Progres (diisi setiap minggu)",
        width: 96,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 0,
        required: true,
        render: (v) => (v === null ? null : <span className="tabular-nums">{v}%</span>),
      },
      {
        key: "updated_on",
        header: "Tgl update",
        group: "Progres (diisi setiap minggu)",
        width: 124,
        editor: "date",
        get: (r) => r.updatedOn,
      },
      {
        key: "evidence",
        header: "Realisasi / Bukti",
        group: "Progres (diisi setiap minggu)",
        width: 260,
        editor: "longtext",
        maxLength: 4000,
      },
      {
        key: "kps_notes",
        header: "Catatan Garuda / KPS",
        group: "KPS",
        width: 240,
        editor: "longtext",
        maxLength: 4000,
        get: (r) => r.kpsNotes,
      },
      {
        key: "due_date",
        header: "Batas waktu",
        group: definition,
        width: 140,
        editor: "date",
        get: (r) => r.dueDate,
      },
      { key: "root_cause", header: "Akar masalah", group: definition, width: 260, editor: "longtext", maxLength: 4000, get: (r) => r.rootCause },
      { key: "action", header: "Tindakan", group: definition, width: 320, editor: "longtext", maxLength: 4000 },
      { key: "target", header: "Target (KPI)", group: definition, width: 220, editor: "longtext", maxLength: 4000 },
      { key: "pic", header: "PIC", group: definition, width: 180, editor: "text", maxLength: 4000 },
      {
        key: "kind",
        header: "Jenis",
        group: definition,
        width: 104,
        editor: "select",
        options: ACTION_KINDS.map((value) => ({ value })),
        render: (v) => chip(v),
      },
      { key: "schedule", header: "Jadwal", group: definition, width: 220, editor: "longtext", maxLength: 4000 },
      { key: "source", header: "Sumber", group: definition, width: 112, editor: "text", maxLength: 200 },
      {
        key: "changed",
        header: "Terakhir diubah",
        width: 220,
        editor: "readonly",
        get: (r) => r.changedLabel,
        render: (v) => <span className="text-xs text-ink-muted">{v}</span>,
      },
    );
    return list;
  }, [showGroup, fixedToday]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: isOwner ? 160 : 84,
      render: (row: ActionView) => (
        <span className="flex gap-1.5">
          <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => setOpened(row.code)}>
            Buka<span className="sr-only"> {row.code}</span>
          </Button>
          {isOwner ? (
            <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => setDeleting(row.code)}>
              Hapus<span className="sr-only"> butir {row.code}</span>
            </Button>
          ) : null}
        </span>
      ),
    }),
    [isOwner],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ActionView): Promise<SaveRowResult> => {
      const pick = <T,>(key: string, fallback: T): T => (key in changes ? (changes[key] as T) : fallback);
      const progressChanged = Object.keys(changes).some((k) => k in PROGRESS_KEYS);
      const definitionChanged = Object.keys(changes).some((k) => k in DEFINITION_KEYS);
      const fieldErrors = (errors: Partial<Record<string, string>> | undefined) =>
        errors
          ? Object.fromEntries(Object.entries(errors).map(([field, msg]) => [GRID_KEY[field] ?? field, msg ?? ""]))
          : undefined;

      if (progressChanged) {
        // A progress change without a typed date is dated today, as the workbook asks ("Tgl update").
        const updatedOn = "updated_on" in changes ? (changes.updated_on as string | null) : fixedToday;
        const result = await saveActionProgress(accessKey, {
          code: row.code,
          status: pick<string>("status", row.status),
          progress: pick<number>("progress", row.progress),
          updatedOn: updatedOn ?? "",
          evidence: pick<string | null>("evidence", row.evidence) ?? "",
        });
        if (!result.ok) return { ok: false, message: result.message, fieldErrors: fieldErrors(result.fieldErrors) };
      }
      if (definitionChanged) {
        const result = await saveActionDefinition(accessKey, {
          code: row.code,
          groupName: pick<string | null>("group_name", row.groupName) ?? "",
          aspect: pick<string | null>("aspect", row.aspect) ?? "",
          rootCause: pick<string | null>("root_cause", row.rootCause) ?? "",
          action: pick<string | null>("action", row.action) ?? "",
          target: pick<string | null>("target", row.target) ?? "",
          kind: pick<string | null>("kind", row.kind) ?? "",
          schedule: pick<string | null>("schedule", row.schedule) ?? "",
          dueDate: pick<string | null>("due_date", row.dueDate) ?? "",
          pic: pick<string | null>("pic", row.pic) ?? "",
          kpsNotes: pick<string | null>("kps_notes", row.kpsNotes) ?? "",
          source: pick<string | null>("source", row.source) ?? "",
        });
        if (!result.ok) {
          const message = progressChanged ? `Progres tersimpan; catatan/definisi gagal: ${result.message}` : result.message;
          return { ok: false, message, fieldErrors: fieldErrors(result.fieldErrors) };
        }
      }
      return { ok: true };
    },
    [accessKey, fixedToday],
  );

  const overdue = rows.filter((v) => v.flag === "OVERDUE").length;
  const dueSoon = rows.filter((v) => v.flag === "Jatuh tempo ≤ 7 hari").length;
  const attention = items.some(needsAttention);

  const toolbar = (
    <>
      {attention ? (
        <Button
          variant={filters.flag === "perlu" ? "primary" : "secondary"}
          onClick={() => changeFilters({ flag: filters.flag === "perlu" ? "" : "perlu" })}
        >
          {filters.flag === "perlu" ? "Tampilkan semua butir" : "Hanya yang perlu ditangani"}
        </Button>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="section-label">Aspek</span>
        <select className={toolSelect} value={filters.aspect} onChange={(e) => changeFilters({ aspect: e.target.value })}>
          <option value="">Semua aspek</option>
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="section-label">Status</span>
        <select className={toolSelect} value={filters.status} onChange={(e) => changeFilters({ status: e.target.value })}>
          <option value="">Semua status</option>
          {ACTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="section-label">Flag</span>
        <select className={toolSelect} value={filters.flag} onChange={(e) => changeFilters({ flag: e.target.value })}>
          {FLAG_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="section-label">Urutan</span>
        <select
          className={toolSelect}
          value={filters.order}
          onChange={(e) => changeFilters({ order: e.target.value === "id" ? "id" : "urgency" })}
        >
          <option value="urgency">Paling mendesak dulu</option>
          <option value="id">Urutan ID workbook</option>
        </select>
      </label>
    </>
  );

  // Dashboard links here as #tl-<code>: that row becomes the active, focused row.
  const [focusCode, setFocusCode] = useState<string | null>(null);
  useEffect(() => {
    const read = () =>
      setFocusCode(window.location.hash.startsWith("#tl-") ? decodeURIComponent(window.location.hash.slice(4)) : null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const openedItem = opened ? (items.find((v) => v.code === opened) ?? null) : null;
  const deletingItem = deleting ? (items.find((v) => v.code === deleting) ?? null) : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="status" aria-live="polite">
        {notice ? <p className="text-sm font-semibold text-good">{notice}</p> : null}
      </div>
      {!canEdit ? <p className="text-sm text-ink-muted">{READ_ONLY_NOTE} Sel tidak bisa diubah lewat tautan stasiun.</p> : null}
      <DataGrid
        caption={caption}
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        rowLabel={rowLabel}
        // No onSaveRow: the grid is read-only (station links).
        onSaveRow={canEdit ? onSaveRow : undefined}
        search={SEARCH}
        toolbar={toolbar}
        summary={`${rows.length} dari ${items.length} butir · ${overdue} OVERDUE · ${dueSoon} jatuh tempo ≤ 7 hari`}
        rowActions={rowActions}
        focusRowKey={focusCode}
        emptyState={
          <>
            <p className="text-sm font-semibold text-ink">Tidak ada butir dengan filter ini</p>
            <p className="mt-1 text-sm text-ink-muted">Ubah Aspek, Status, atau Flag di atas untuk melihat butir lain.</p>
          </>
        }
        phone={phone}
      />
      {/* One details dialog for the whole grid, opened from a row's button. */}
      <ActionItemDialog
        accessKey={accessKey}
        canEdit={canEdit}
        today={fixedToday}
        item={openedItem}
        onClose={() => setOpened(null)}
        onSaved={() => undefined}
      />
      {isOwner ? (
        <DeleteActionItemDialog
          accessKey={accessKey}
          item={deletingItem}
          onClose={() => setDeleting(null)}
          onDeleted={(code) => {
            setDeleting(null);
            setNotice(`Butir ${code} dihapus.`);
          }}
        />
      ) : null}
    </div>
  );
}
