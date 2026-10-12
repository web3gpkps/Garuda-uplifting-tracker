"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ASSIGNMENT_STATUSES,
  PROGRAMS,
  TOUCH_POINTS,
  consistency,
  failureCause,
  finalResult,
  passStatus,
  type Settings,
} from "@/lib/rules";
import { formatDecimal } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { StaffDialog } from "./StaffDialog";
import { StaffCards } from "./StaffCards";
import { DeleteStaffDialog } from "./DeleteStaffDialog";
import { REMARKS } from "./staff-input";
import type { DeleteStaffAction, SaveStaffAction, SdmRow } from "./types";

type StaffGridProps = {
  caption: string;
  rows: SdmRow[];
  emptyTitle: string;
  emptyHint: string;
  accessKey: string;
  isKps: boolean;
  ownStation: string | null;
  stations: string[];
  settings: Settings;
  saveAction: SaveStaffAction;
  /** Owner only (access.kind === "owner"): the "Hapus" row action. The action re-checks it. */
  canDelete: boolean;
  deleteAction: DeleteStaffAction;
};

/** Training-baseline fields: KPS links and the owner only (share_kps_save_staff_baseline). */
const BASELINE = ["role_play", "post_test", "report_remark", "feedback"];

const rowKey = (r: SdmRow) => r.code;
const rowLabel = (r: SdmRow) => `${r.code}, ${r.name}`;
const SEARCH = {
  placeholder: "Nama, ID atau Employee Number",
  text: (r: SdmRow) => `${r.code} ${r.name} ${r.employeeNo ?? ""}`,
};

function num(value: CellValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: CellValue): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function chip(value: CellValue) {
  const label = text(value);
  return label ? <StatusChip label={label} /> : null;
}

/**
 * Master SDM as a spreadsheet (docs/UX.md §2), columns as in the workbook (B to S):
 * profile cells for every link, the training baseline (Role Play, Post-Test, Remark,
 * Feedback) for KPS and the owner, and Final Result / Status / Konsistensi / Penyebab
 * computed live (lib/rules). Each row saves itself. "Ubah" opens the full form. Under
 * 900 px a card list with the same form is shown instead. Client component.
 */
export function StaffGrid(props: StaffGridProps) {
  const { rows, isKps, accessKey, saveAction, settings, stations, canDelete } = props;
  const [editing, setEditing] = useState<SdmRow | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<SdmRow | null>(null);

  const openEdit = useCallback((row: SdmRow) => {
    setEditing(row);
    setOpenCount((n) => n + 1);
    setDialogOpen(true);
  }, []);

  const columns = useMemo<GridColumn<SdmRow>[]>(() => {
    const kpsOnly = () => isKps;
    const final = (value: (key: string) => CellValue) =>
      finalResult(num(value("role_play")), num(value("post_test")), settings);
    const pass = formatDecimal(settings.passGrade, 0, 2);
    const training = "Hasil training";
    return [
      { key: "code", header: "ID", width: 92, editor: "readonly", frozen: true },
      { key: "name", header: "Nama", width: 200, editor: "text", required: true, maxLength: 200, frozen: true },
      { key: "program", header: "Program", width: 88, editor: "select", options: PROGRAMS.map((value) => ({ value })) },
      { key: "provider", header: "Provider", width: 140, editor: "text", maxLength: 100 },
      {
        key: "station",
        header: "Unit",
        label: "Unit (stasiun)",
        width: 76,
        editor: isKps ? "select" : "readonly",
        required: true,
        options: stations.map((value) => ({ value })),
      },
      { key: "employee_no", header: "Employee Number", width: 140, editor: "text", maxLength: 50, get: (r) => r.employeeNo },
      { key: "gender", header: "L/P", width: 60, editor: "select", options: [{ value: "L" }, { value: "P" }] },
      {
        key: "touch_point",
        header: "Touch Point",
        width: 160,
        editor: "select",
        options: TOUCH_POINTS.map((value) => ({ value })),
        get: (r) => r.touchPoint,
      },
      {
        key: "role_play",
        header: "Role Play",
        group: training,
        width: 88,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.rolePlay,
        editable: kpsOnly,
      },
      {
        key: "post_test",
        header: "Post-Test",
        group: training,
        width: 88,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.postTest,
        editable: kpsOnly,
      },
      {
        key: "final_result",
        header: "Final Result",
        label: `Final Result (Role Play ${formatDecimal(settings.weightRolePlay * 100, 0)}% dan Post-Test ${formatDecimal(
          settings.weightPostTest * 100,
          0,
        )}%)`,
        group: training,
        width: 96,
        editor: "readonly",
        align: "end",
        derive: (_row, value) => final(value),
        render: (value) => <span className="font-semibold">{formatDecimal(num(value), 1)}</span>,
      },
      {
        key: "report_remark",
        header: "Remark di Laporan",
        group: training,
        width: 132,
        editor: "select",
        options: REMARKS.map((value) => ({ value })),
        get: (r) => r.reportRemark,
        editable: kpsOnly,
        render: chip,
      },
      {
        key: "status",
        header: `Status ≥${pass}`,
        label: `Status menurut passing grade ${pass}`,
        group: training,
        width: 104,
        editor: "readonly",
        derive: (_row, value) => passStatus(final(value), settings),
        render: chip,
      },
      {
        key: "consistency",
        header: "Cek Konsistensi",
        group: training,
        width: 148,
        editor: "readonly",
        derive: (_row, value) => consistency(text(value("report_remark")), passStatus(final(value), settings)),
        render: chip,
      },
      {
        key: "failure_cause",
        header: "Penyebab Utama",
        group: training,
        width: 300,
        editor: "readonly",
        derive: (_row, value) =>
          failureCause(num(value("role_play")), num(value("post_test")), passStatus(final(value), settings), settings),
      },
      {
        key: "assignment_status",
        header: "Status Penugasan",
        width: 168,
        editor: "select",
        required: true,
        options: ASSIGNMENT_STATUSES.map((value) => ({ value })),
        get: (r) => r.assignmentStatus,
        render: chip,
      },
      { key: "feedback", header: "Feedback", width: 220, editor: "longtext", maxLength: 8000, editable: kpsOnly },
      { key: "notes", header: "Catatan", width: 220, editor: "longtext", maxLength: 4000 },
    ];
  }, [isKps, settings, stations]);

  const rowActions = useMemo(
    () => ({
      header: "Aksi",
      width: canDelete ? 156 : 84,
      render: (row: SdmRow) => (
        <>
          <Button size="sm" variant="secondary" tabIndex={-1} onClick={() => openEdit(row)}>
            Ubah<span className="sr-only"> data {row.name}</span>
          </Button>
          {canDelete ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setDeleting(row)}
              className="inline-flex min-h-8 items-center rounded-control px-2 text-xs font-semibold text-critical transition-colors duration-120 hover:bg-critical-tint"
            >
              Hapus<span className="sr-only"> SDM {row.name}</span>
            </button>
          ) : null}
        </>
      ),
    }),
    [canDelete, openEdit],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: SdmRow): Promise<SaveRowResult> => {
      // share_save_staff and the baseline RPC write every field: merge the changes into the row.
      const pick = <T,>(field: string, fallback: T): T => (field in changes ? (changes[field] as T) : fallback);
      const baselineChanged = BASELINE.some((field) => field in changes);
      const result = await saveAction(accessKey, {
        code: row.code,
        program: pick("program", row.program),
        provider: pick("provider", row.provider),
        station: pick("station", row.station),
        name: pick("name", row.name),
        employeeNo: pick("employee_no", row.employeeNo),
        gender: pick("gender", row.gender),
        touchPoint: pick("touch_point", row.touchPoint),
        assignmentStatus: pick("assignment_status", row.assignmentStatus),
        notes: pick("notes", row.notes),
        baseline: baselineChanged
          ? {
              rolePlay: pick("role_play", row.rolePlay),
              postTest: pick("post_test", row.postTest),
              reportRemark: pick("report_remark", row.reportRemark),
              feedback: pick("feedback", row.feedback),
            }
          : null,
      });
      if (result.ok) return { ok: true };
      const message = result.saved ? `Profil tersimpan, hasil training gagal: ${result.error.message}` : result.error.message;
      return {
        ok: false,
        message,
        fieldErrors: result.error.field ? { [result.error.field]: result.error.message } : undefined,
      };
    },
    [accessKey, saveAction],
  );

  const withResult = rows.filter((r) => r.finalResult !== null).length;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
      <div role="status" aria-live="polite">
        {message ? <p className="text-sm font-semibold text-good">{message}</p> : null}
      </div>
      <DataGrid
        caption={props.caption}
        rows={rows}
        columns={columns}
        rowKey={rowKey}
        rowLabel={rowLabel}
        onSaveRow={onSaveRow}
        search={SEARCH}
        summary={`${rows.length} SDM · ${withResult} punya Final Result`}
        rowActions={rowActions}
        emptyState={
          <>
            <p className="text-sm font-semibold text-ink">{props.emptyTitle}</p>
            <p className="mt-1 text-sm text-ink-muted">{props.emptyHint}</p>
          </>
        }
        phone={
          <StaffCards
            rows={rows}
            emptyTitle={props.emptyTitle}
            emptyHint={props.emptyHint}
            settings={settings}
            onEdit={openEdit}
            onDelete={canDelete ? setDeleting : undefined}
          />
        }
      />
      <StaffDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        row={editing}
        formKey={`${editing?.code ?? "baru"}-${openCount}`}
        accessKey={accessKey}
        isKps={isKps}
        ownStation={props.ownStation}
        stations={stations}
        settings={settings}
        saveAction={saveAction}
        onSaved={setMessage}
        onDelete={canDelete ? setDeleting : undefined}
      />
      {canDelete ? (
        <DeleteStaffDialog
          row={deleting}
          onClose={() => setDeleting(null)}
          accessKey={accessKey}
          deleteAction={props.deleteAction}
          onDeleted={setMessage}
        />
      ) : null}
    </div>
  );
}
