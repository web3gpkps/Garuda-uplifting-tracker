"use client";

import { formatDecimal } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { StatusChip } from "@/components/ui/StatusChip";
import { REASON_LABELS, reasonsFor } from "./rows";
import type { SdmRow } from "./types";

type StaffCardsProps = {
  rows: SdmRow[];
  emptyTitle: string;
  emptyHint: string;
  onEdit: (row: SdmRow) => void;
  /** Owner only: opens the delete confirmation. */
  onDelete?: (row: SdmRow) => void;
};

/**
 * Data SDM on phones (< 900 px): one card per person with the core fields, the
 * "Periksa" marker and its reasons, and "Ubah data" for the full form. Client component.
 */
export function StaffCards({ rows, emptyTitle, emptyHint, onEdit, onDelete }: StaffCardsProps) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  }
  return (
    <ul className="rounded-panel border border-line bg-surface">
      {rows.map((row) => {
        const reasons = reasonsFor(row).map((r) => REASON_LABELS[r]);
        return (
          <li key={row.code} className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{row.name}</h3>
                <p className="text-xs text-ink-muted tabular-nums">
                  {row.code} · {row.program ?? "Program belum diisi"} · <span className="station-code">{row.station}</span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {reasons.length > 0 ? <StatusChip label="Periksa" tone="warning" /> : null}
                {row.assignmentStatus !== "Aktif" ? <StatusChip label={row.assignmentStatus} /> : null}
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div className="col-span-1">
                <dt className="section-label">Final Result</dt>
                <dd className="font-semibold tabular-nums">{formatDecimal(row.finalResult, 1) || "–"}</dd>
              </div>
              <div className="col-span-1">
                <dt className="section-label">Status</dt>
                <dd>
                  <StatusChip label={row.status} emptyLabel="–" />
                </dd>
              </div>
              <div className="col-span-1">
                <dt className="section-label">Touch Point</dt>
                <dd className={row.touchPoint ? undefined : "text-ink-muted"}>{row.touchPoint ?? "–"}</dd>
              </div>
            </dl>

            {reasons.length > 0 ? <p className="text-xs text-warning">Perlu diperiksa: {reasons.join(", ")}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onEdit(row)}>
                Ubah data<span className="sr-only"> {row.name}</span>
              </Button>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(row)}
                  className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-critical transition-colors duration-120 hover:bg-critical-tint"
                >
                  Hapus SDM<span className="sr-only"> {row.name}</span>
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
