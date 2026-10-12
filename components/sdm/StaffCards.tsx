"use client";

import type { Settings } from "@/lib/rules";
import { formatDecimal } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SdmRow } from "./types";

type StaffCardsProps = {
  rows: SdmRow[];
  emptyTitle: string;
  emptyHint: string;
  settings: Settings;
  onEdit: (row: SdmRow) => void;
  /** Owner only: opens the delete confirmation. */
  onDelete?: (row: SdmRow) => void;
};

function Value({ value, empty = "Belum diisi" }: { value: string | null | undefined; empty?: string }) {
  return value ? <span>{value}</span> : <span className="text-ink-muted">{empty}</span>;
}

/**
 * Master SDM on phones (< 900 px): one card per staff member with what decides "is this
 * record right": flags first, the key fields, and "Ubah data" for the full form. Client component.
 */
export function StaffCards({ rows, emptyTitle, emptyHint, settings, onEdit, onDelete }: StaffCardsProps) {
  if (rows.length === 0) {
    return (
      <div className="py-6">
        <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
        <p className="mt-1 text-sm text-ink-muted">{emptyHint}</p>
      </div>
    );
  }
  const pass = formatDecimal(settings.passGrade, 0, 2);
  return (
    <ul className="-mx-4 border-t border-line sm:-mx-6">
      {rows.map((row) => (
        <li key={row.code} className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">{row.name}</h3>
              <p className="text-xs text-ink-muted tabular-nums">
                {row.code} · {row.program ?? "Program belum diisi"} · Unit {row.station}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.status ? <StatusChip label={row.status} /> : null}
              {row.consistency === "Beda – verifikasi" ? (
                <StatusChip label={row.consistency} />
              ) : null}
              {row.assignmentStatus !== "Aktif" ? (
                <StatusChip label={row.assignmentStatus} />
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="section-label">Employee Number</dt>
              <dd className="tabular-nums">
                <Value value={row.employeeNo} />
              </dd>
            </div>
            <div>
              <dt className="section-label">Touch Point</dt>
              <dd>
                <Value value={row.touchPoint} />
              </dd>
            </div>
            <div>
              <dt className="section-label">Role Play / Post-Test</dt>
              <dd className="tabular-nums">
                {row.rolePlay === null && row.postTest === null
                  ? "Belum ada"
                  : `${formatDecimal(row.rolePlay, 0, 2) || "kosong"} / ${formatDecimal(row.postTest, 0, 2) || "kosong"}`}
              </dd>
            </div>
            <div>
              <dt className="section-label">Final Result (lulus ≥{pass})</dt>
              <dd className="font-semibold tabular-nums">{formatDecimal(row.finalResult, 1) || "Belum ada"}</dd>
            </div>
            <div>
              <dt className="section-label">Remark di Laporan</dt>
              <dd>
                <Value value={row.reportRemark} />
              </dd>
            </div>
            <div>
              <dt className="section-label">L/P</dt>
              <dd>
                <Value value={row.gender} />
              </dd>
            </div>
          </dl>

          {row.failureCause ? <p className="text-xs text-warning">Penyebab utama: {row.failureCause}.</p> : null}
          {row.feedback ? <p className="text-xs text-ink-muted">Feedback: {row.feedback}</p> : null}
          {row.notes ? <p className="text-xs text-ink-muted">Catatan: {row.notes}</p> : null}

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
          <p className="text-xs text-ink-muted">{row.changedLabel}</p>
        </li>
      ))}
    </ul>
  );
}
