"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/States";
import { ActionItemDialog } from "./ActionItemDialog";
import { ActionCards } from "./ActionRows";
import { DeleteActionItemDialog } from "./DeleteActionItemDialog";
import {
  ACTION_STATUSES,
  ASPECTS,
  FLAG_FILTERS,
  READ_ONLY_NOTE,
  byUrgency,
  byWorkbookOrder,
  matchesFilters,
  type ActionView,
} from "./action-view";

export type GroupSummary = {
  key: string;
  total: number;
  selesai: number;
  overdue: number;
  dueSoon: number;
  avgProgress: number | null;
};

type TindakLanjutBoardProps = {
  accessKey: string;
  /** KPS links and the owner; station links read only. */
  canEdit: boolean;
  /** Owner only: "Hapus butir" on each card. */
  isOwner?: boolean;
  today: string;
  items: ActionView[];
  /** From ?aspek=, "" for all aspects. */
  initialAspect: string;
  /** One per Kelompok shown, in workbook order. */
  groups: GroupSummary[];
};

function groupLine(g: GroupSummary): string {
  const parts = [`${g.total} butir`, `${g.selesai} selesai`];
  parts.push(`${g.overdue} OVERDUE`, `${g.dueSoon} jatuh tempo ≤ 7 hari`);
  if (g.avgProgress !== null) parts.push(`rata-rata progres ${Math.round(g.avgProgress)}%`);
  return parts.join(" · ");
}

function slug(key: string): string {
  return key.replace(/[^A-Za-z]+/g, "-").toLowerCase();
}

/**
 * The Tindak Lanjut screen on phones: what is late or due leads (one sentence, one filter),
 * then each Kelompok's items, most urgent first. Filters are local to this view.
 */
export function TindakLanjutBoard({
  accessKey,
  canEdit,
  isOwner = false,
  today,
  items,
  initialAspect,
  groups,
}: TindakLanjutBoardProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [aspectFilter, setAspectFilter] = useState(initialAspect);
  const [order, setOrder] = useState<"urgency" | "id">("urgency");
  const [editing, setEditing] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const overdue = items.filter((v) => v.flag === "OVERDUE").length;
  const dueSoon = items.filter((v) => v.flag === "Jatuh tempo ≤ 7 hari").length;
  const filtersActive = statusFilter !== "" || flagFilter !== "" || aspectFilter !== "";

  const visible = useMemo(() => {
    const rows = items.filter((v) => matchesFilters(v, { status: statusFilter, flag: flagFilter, aspect: aspectFilter }));
    return rows.sort(order === "urgency" ? byUrgency : byWorkbookOrder);
  }, [items, statusFilter, flagFilter, aspectFilter, order]);

  // Ringkasan links here as #tl-<code>. The table (desktop) and the cards (phones) both carry
  // the item, so scroll to whichever is displayed and put focus on its button.
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

  const deletingItem = deleting ? (items.find((v) => v.code === deleting) ?? null) : null;
  const editingItem = editing ? (items.find((v) => v.code === editing) ?? null) : null;

  function clearFilters() {
    setStatusFilter("");
    setFlagFilter("");
    setAspectFilter("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 sm:px-6">
        <div role="status" aria-live="polite">
          {notice ? <p className="text-sm font-semibold text-good">{notice}</p> : null}
        </div>
        {!canEdit ? <p className="text-sm text-ink-muted">{READ_ONLY_NOTE} Hanya tampilan baca.</p> : null}
        {overdue + dueSoon > 0 ? (
          <Button variant="secondary" onClick={() => setFlagFilter(flagFilter === "perlu" ? "" : "perlu")}>
            {flagFilter === "perlu" ? "Tampilkan semua butir" : "Hanya yang perlu ditangani"}
          </Button>
        ) : null}
      </div>

      <form
        aria-label="Saring tindak lanjut"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-3 px-4 sm:px-6"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Aspek">
            <Select value={aspectFilter} onChange={(e) => setAspectFilter(e.target.value)}>
              <option value="">Semua aspek</option>
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Semua status</option>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Flag">
            <Select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}>
              {FLAG_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Urutan">
            <Select value={order} onChange={(e) => setOrder(e.target.value === "id" ? "id" : "urgency")}>
              <option value="urgency">Paling mendesak dulu</option>
              <option value="id">Urutan ID</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            Menampilkan {visible.length} dari {items.length} butir.
          </p>
          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Hapus filter
            </Button>
          ) : null}
        </div>
      </form>

      {groups.map((g) => {
        const rows = visible.filter((v) => v.groupName === g.key);
        const id = `kelompok-${slug(g.key)}`;
        return (
          <section key={g.key} id={id} aria-labelledby={`${id}-judul`} className="border-t border-line">
            <div className="px-4 pt-4 pb-3 sm:px-6">
              <h3 id={`${id}-judul`} className="text-base font-semibold text-ink">
                {g.key}
              </h3>
              <p className="mt-0.5 text-sm text-ink-muted">{groupLine(g)}</p>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 sm:px-6">
                <EmptyState
                  title={`Tidak ada butir ${g.key} dengan filter ini`}
                  action={
                    filtersActive ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Hapus filter
                      </Button>
                    ) : undefined
                  }
                >
                  {g.total === 0
                    ? "Kelompok ini belum punya butir tindak lanjut di database."
                    : "Semua butir kelompok ini tersaring. Ubah atau hapus filter untuk melihatnya lagi."}
                </EmptyState>
              </div>
            ) : (
              <div className="border-t border-line">
                <ActionCards
                  caption={`Tindak lanjut ${g.key}`}
                  items={rows}
                  canEdit={canEdit}
                  savedAt={savedAt}
                  onEdit={setEditing}
                  onDelete={isOwner ? setDeleting : undefined}
                />
              </div>
            )}
          </section>
        );
      })}

      <ActionItemDialog
        accessKey={accessKey}
        canEdit={canEdit}
        today={today}
        item={editingItem}
        onClose={() => setEditing(null)}
        onSaved={(code, at) => setSavedAt((current) => ({ ...current, [code]: at }))}
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
