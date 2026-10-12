"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
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
import { EmptyState } from "@/components/ui/States";
import { FilterBar } from "@/components/ui/Toolbar";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { StaffDialog } from "./StaffDialog";
import { StaffCards } from "./StaffCards";
import { DeleteStaffDialog } from "./DeleteStaffDialog";
import { REMARKS } from "./staff-input";
import { REASON_LABELS, reasonsFor, staffColumnKeys } from "./rows";
import type { DeleteStaffAction, SaveStaffAction, SdmRow } from "./types";

type StaffGridProps = {
  caption: string;
  rows: SdmRow[];
  /** Station, program and "Perlu diperiksa" selects (server-rendered). */
  toolbar: ReactNode;
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

const MORE_GROUP = "Lainnya";

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
 * Data SDM as an entry grid. Core columns: ID, Nama (with the "Periksa" marker), Program,
 * Unit (KPS), Touch Point, Final Result, Status, Status penugasan. "Kolom lainnya" adds the
 * profile details and the training baseline (Role Play, Post-Test, Remark, Feedback: KPS
 * and the owner edit them). Computed cells follow the row live (lib/rules). Each row saves
 * itself; "Ubah" opens the full form. Under 900 px a card list is shown. Client component.
 */
export function StaffGrid(props: StaffGridProps) {
  const { rows, isKps, accessKey, saveAction, settings, stations, canDelete } = props;
  const [editing, setEditing] = useState<SdmRow | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [deleting, setDeleting] = useState<SdmRow | null>(null);
  const [more, setMore] = useState(false);

  const openEdit = useCallback((row: SdmRow) => {
    setEditing(row);
    setOpenCount((n) => n + 1);
    setDialogOpen(true);
  }, []);

  const columns = useMemo<GridColumn<SdmRow>[]>(() => {
    const kpsOnly = () => isKps;
    // While the training columns are hidden the grid cannot read them: use the stored values.
    const rolePlay = (row: SdmRow, value: (key: string) => CellValue) => (more ? num(value("role_play")) : row.rolePlay);
    const postTest = (row: SdmRow, value: (key: string) => CellValue) => (more ? num(value("post_test")) : row.postTest);
    const final = (row: SdmRow, value: (key: string) => CellValue) =>
      finalResult(rolePlay(row, value), postTest(row, value), settings);
    const pass = formatDecimal(settings.passGrade, 0, 2);
    const byKey: Record<string, GridColumn<SdmRow>> = {
      code: { key: "code", header: "ID", width: 92, editor: "readonly", frozen: true },
      name: {
        key: "name",
        header: "Nama",
        width: 220,
        editor: "text",
        required: true,
        maxLength: 200,
        frozen: true,
        render: (value, row) => {
          const reasons = reasonsFor(row).map((r) => REASON_LABELS[r]);
          if (reasons.length === 0) return value;
          return (
            <span className="flex items-center gap-1.5" title={`Perlu diperiksa: ${reasons.join(", ")}`}>
              <span className="truncate">{value}</span>
              <StatusChip label="Periksa" tone="warning" />
              <span className="sr-only">: {reasons.join(", ")}</span>
            </span>
          );
        },
      },
      program: { key: "program", header: "Program", width: 88, editor: "select", options: PROGRAMS.map((value) => ({ value })) },
      station: {
        key: "station",
        header: "Unit",
        label: "Unit (stasiun)",
        width: 76,
        editor: "select",
        required: true,
        options: stations.map((value) => ({ value })),
      },
      touch_point: {
        key: "touch_point",
        header: "Touch Point",
        width: 160,
        editor: "select",
        options: TOUCH_POINTS.map((value) => ({ value })),
        get: (r) => r.touchPoint,
      },
      final_result: {
        key: "final_result",
        header: "Final Result",
        label: `Final Result (Role Play ${formatDecimal(settings.weightRolePlay * 100, 0)}% dan Post-Test ${formatDecimal(
          settings.weightPostTest * 100,
          0,
        )}%)`,
        width: 96,
        editor: "readonly",
        align: "end",
        derive: final,
        render: (value) => <span className="font-semibold">{formatDecimal(num(value), 1) || "–"}</span>,
      },
      status: {
        key: "status",
        header: `Status ≥${pass}`,
        label: `Status menurut passing grade ${pass}`,
        width: 104,
        editor: "readonly",
        derive: (row, value) => passStatus(final(row, value), settings),
        render: chip,
      },
      assignment_status: {
        key: "assignment_status",
        header: "Status penugasan",
        width: 168,
        editor: "select",
        required: true,
        options: ASSIGNMENT_STATUSES.map((value) => ({ value })),
        get: (r) => r.assignmentStatus,
        render: chip,
      },
      employee_no: {
        key: "employee_no",
        header: "Employee Number",
        group: MORE_GROUP,
        width: 140,
        editor: "text",
        maxLength: 50,
        get: (r) => r.employeeNo,
      },
      provider: { key: "provider", header: "Provider", group: MORE_GROUP, width: 140, editor: "text", maxLength: 100 },
      gender: {
        key: "gender",
        header: "L/P",
        group: MORE_GROUP,
        width: 60,
        editor: "select",
        options: [{ value: "L" }, { value: "P" }],
      },
      role_play: {
        key: "role_play",
        header: "Role Play",
        group: MORE_GROUP,
        width: 88,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.rolePlay,
        editable: kpsOnly,
      },
      post_test: {
        key: "post_test",
        header: "Post-Test",
        group: MORE_GROUP,
        width: 88,
        editor: "number",
        min: 0,
        max: 100,
        decimals: 2,
        get: (r) => r.postTest,
        editable: kpsOnly,
      },
      report_remark: {
        key: "report_remark",
        header: "Remark di laporan",
        group: MORE_GROUP,
        width: 132,
        editor: "select",
        options: REMARKS.map((value) => ({ value })),
        get: (r) => r.reportRemark,
        editable: kpsOnly,
        render: chip,
      },
      consistency: {
        key: "consistency",
        header: "Cek konsistensi",
        group: MORE_GROUP,
        width: 148,
        editor: "readonly",
        derive: (row, value) => consistency(text(value("report_remark")), passStatus(final(row, value), settings)),
        render: chip,
      },
      failure_cause: {
        key: "failure_cause",
        header: "Penyebab utama",
        group: MORE_GROUP,
        width: 300,
        editor: "readonly",
        derive: (row, value) =>
          failureCause(rolePlay(row, value), postTest(row, value), passStatus(final(row, value), settings), settings),
      },
      feedback: {
        key: "feedback",
        header: "Feedback",
        group: MORE_GROUP,
        width: 220,
        editor: "longtext",
        maxLength: 8000,
        editable: kpsOnly,
      },
      notes: { key: "notes", header: "Catatan", group: MORE_GROUP, width: 220, editor: "longtext", maxLength: 4000 },
    };
    return staffColumnKeys({ isKps, more }).map((key) => byKey[key]);
  }, [isKps, settings, stations, more]);

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

  return (
    <div className="flex flex-col gap-3">
      <div role="status" aria-live="polite" className="empty:hidden">
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
        toolbar={props.toolbar}
        summary={<span className="tabular-nums">{rows.length} SDM</span>}
        actions={
          <Button size="sm" variant="secondary" onClick={() => setMore((m) => !m)}>
            {more ? "Sembunyikan kolom lainnya" : "Kolom lainnya"}
          </Button>
        }
        rowActions={rowActions}
        emptyState={<EmptyState title={props.emptyTitle} layout="inline">{props.emptyHint}</EmptyState>}
        phone={
          <div className="flex flex-col gap-4">
            <FilterBar label="Filter SDM" end={<span className="tabular-nums">{rows.length} SDM</span>}>
              {props.toolbar}
            </FilterBar>
            <StaffCards
              rows={rows}
              emptyTitle={props.emptyTitle}
              emptyHint={props.emptyHint}
              onEdit={openEdit}
              onDelete={canDelete ? setDeleting : undefined}
            />
          </div>
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
