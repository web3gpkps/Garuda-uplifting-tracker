"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, DataTableEmpty, Td, Th, Tr } from "@/components/ui/DataTable";
import { StatusChip } from "@/components/ui/StatusChip";
import { cx } from "@/components/ui/cx";
import { ActionItemDialog } from "./ActionItemDialog";
import { DeleteActionItemDialog } from "./DeleteActionItemDialog";
import { describeDaysLeft, type ActionView } from "./action-view";

type ActionTableProps = {
  accessKey: string;
  /** KPS links and the owner get "Perbarui progres"; station links a plain read-only list. */
  canEdit: boolean;
  /** Owner only: "Hapus" on each row. */
  isOwner: boolean;
  today: string;
  /** Already filtered and sorted (most urgent first). */
  items: ActionView[];
  /** Shown when the filters leave nothing. */
  emptyTitle: string;
};

function DueDate({ view }: { view: ActionView }) {
  if (!view.dueLabel) return <span className="text-ink-muted">Belum ditetapkan</span>;
  return (
    <span className="flex flex-col">
      <span className="tabular">{view.dueLabel}</span>
      {view.daysLeft !== null ? (
        <span className={cx("text-xs", view.daysLeft < 0 ? "font-semibold text-critical" : "text-ink-muted")}>
          {describeDaysLeft(view.daysLeft)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Tindak Lanjut list: a table from 900 px, one card per item below. Each row opens
 * "Perbarui progres" in a dialog (KPS and the owner). Client component.
 */
export function ActionTable({ accessKey, canEdit, isOwner, today, items, emptyTitle }: ActionTableProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  // Beranda links here as #tl-<code>: scroll that item into view and focus its button.
  useEffect(() => {
    if (!window.location.hash.startsWith("#tl-")) return;
    const code = decodeURIComponent(window.location.hash.slice(4));
    const target = [...document.querySelectorAll<HTMLElement>("[data-tl-code]")].find(
      (el) => el.dataset.tlCode === code && el.getClientRects().length > 0,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center" });
    target.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);

  const editingItem = editing ? (items.find((v) => v.code === editing) ?? null) : null;
  const deletingItem = deleting ? (items.find((v) => v.code === deleting) ?? null) : null;
  const columns = canEdit ? 7 : 6;

  const rowActions = (view: ActionView) =>
    canEdit ? (
      <span className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => setEditing(view.code)}>
          Perbarui progres<span className="sr-only"> {view.code}</span>
        </Button>
        {isOwner ? (
          <Button size="sm" variant="ghost" onClick={() => setDeleting(view.code)}>
            Hapus<span className="sr-only"> butir {view.code}</span>
          </Button>
        ) : null}
      </span>
    ) : null;

  return (
    <>
      <div role="status" aria-live="polite" className="empty:hidden px-4 pt-3 text-sm font-semibold text-good">
        {notice}
      </div>

      <div className="hidden grid:block">
        <DataTable caption="Tindak lanjut" minWidth="960px">
          <thead>
            <tr>
              <Th>Butir</Th>
              <Th>Flag</Th>
              <Th>Status</Th>
              <Th numeric>% Progres</Th>
              <Th>Batas waktu</Th>
              <Th>PIC</Th>
              {canEdit ? (
                <Th>
                  <span className="sr-only">Aksi</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <DataTableEmpty colSpan={columns} title={emptyTitle} />
            ) : (
              items.map((view) => (
                <Tr key={view.code} data-tl-code={view.code} selected={Boolean(savedAt[view.code])}>
                  <Th scope="row" className="max-w-md font-normal whitespace-normal">
                    <span className="station-code">{view.code}</span>
                    <span className="block text-ink">{view.action ?? "Tindakan belum diisi"}</span>
                    <span className="block text-xs text-ink-muted">{view.aspect ?? "Aspek belum diisi"}</span>
                  </Th>
                  <Td>
                    <StatusChip label={view.flag} />
                  </Td>
                  <Td>
                    <StatusChip label={view.status} />
                  </Td>
                  <Td numeric>{view.progress}%</Td>
                  <Td>
                    <DueDate view={view} />
                  </Td>
                  <Td className="whitespace-normal">{view.pic ?? <span className="text-ink-muted">–</span>}</Td>
                  {canEdit ? <Td>{rowActions(view)}</Td> : null}
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
      </div>

      <ul aria-label="Tindak lanjut" className="divide-y divide-line grid:hidden">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-sm font-semibold text-ink">{emptyTitle}</li>
        ) : (
          items.map((view) => (
            <li
              key={view.code}
              data-tl-code={view.code}
              className={cx("flex flex-col gap-2 px-4 py-4", savedAt[view.code] && "bg-brand-tint")}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm text-ink">
                  <span className="station-code">{view.code}</span>
                  <span className="block">{view.action ?? "Tindakan belum diisi"}</span>
                </p>
                <StatusChip label={view.flag} />
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-muted">Status</dt>
                  <dd>
                    <StatusChip label={view.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Progres</dt>
                  <dd className="tabular">{view.progress}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-muted">Batas waktu</dt>
                  <dd>
                    <DueDate view={view} />
                  </dd>
                </div>
              </dl>
              {canEdit ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" fullWidth onClick={() => setEditing(view.code)}>
                    Perbarui progres<span className="sr-only"> {view.code}</span>
                  </Button>
                  {isOwner ? (
                    <Button variant="ghost" fullWidth onClick={() => setDeleting(view.code)}>
                      Hapus<span className="sr-only"> butir {view.code}</span>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {canEdit ? (
        <ActionItemDialog
          accessKey={accessKey}
          today={today}
          item={editingItem}
          onClose={() => setEditing(null)}
          onSaved={(code, at) => setSavedAt((current) => ({ ...current, [code]: at }))}
        />
      ) : null}
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
    </>
  );
}
