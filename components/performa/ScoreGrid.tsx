"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { GAP_TOPICS, TOUCH_POINTS, coachingAvg, coachingStatus, deltaVsBaseline, type Settings } from "@/lib/rules";
import { formatDecimal, formatScore, formatSignedScore } from "@/lib/format";
import { StatusChip } from "@/components/ui/StatusChip";
import { DataGrid, type CellValue, type GridColumn, type SaveRowResult } from "@/components/grid/DataGrid";
import { ASPECT_FIELDS, type AspectField } from "./format";
import type { SaveScoreAction } from "./ScoreRow";

/** One staff member's Log Performa row for the selected week (column keys = RPC field names). */
export type ScoreGridRow = {
  code: string;
  name: string;
  station: string;
  assignmentStatus: string;
  /** Master SDM Final Result, for Δ vs Final Result. */
  finalResult: number | null;
  /** Master SDM touch point: used when a new row is scored without one. */
  defaultTouchPoint: string | null;
  touch_point: string | null;
  score_grooming: number | null;
  score_knowledge: number | null;
  score_attitude: number | null;
  score_communication: number | null;
  gap_topic: string | null;
  observer: string | null;
  coaching_notes: string | null;
  /** "Diubah lewat tautan ini, 8 Okt 07.55"; null when there is no row this week. */
  changedLabel: string | null;
};

const SCORE_KEYS: AspectField[] = ASPECT_FIELDS.map((a) => a.field);
const INPUT_KEYS = ["touch_point", ...SCORE_KEYS, "gap_topic", "observer", "coaching_notes"];

const rowKey = (r: ScoreGridRow) => r.code;
const rowLabel = (r: ScoreGridRow) => `${r.code}, ${r.name}`;
const SEARCH = { placeholder: "Nama atau ID", text: (r: ScoreGridRow) => `${r.code} ${r.name}` };

function numberOrNull(value: CellValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOrNull(value: CellValue): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

type ScoreGridProps = {
  caption: string;
  rows: ScoreGridRow[];
  week: number;
  settings: Settings;
  /** Show the Unit column (KPS / owner looking at several stations). */
  showStation: boolean;
  accessKey: string;
  saveAction: SaveScoreAction;
  /** Week picker and station filter (server-rendered). */
  toolbar: ReactNode;
  /** "12 dari 27 SDM sudah dinilai". */
  summary: ReactNode;
  emptyState: ReactNode;
  /** The card flow for phones (< 900 px). */
  phone: ReactNode;
};

/**
 * Log Performa Mingguan as a spreadsheet (docs/UX.md §2): Touch Point, the four coaching
 * aspects (0 to 100, decimals allowed), Topik Gap, Observer and Catatan are input cells;
 * Rata-rata, Status and Δ vs Final Result follow the typed scores live (lib/rules). Each
 * row saves itself through share_save_weekly_score; clearing every input of a saved row
 * deletes it after a confirmation. Remount it per week and station (key) so pending
 * edits never cross weeks.
 */
export function ScoreGrid(props: ScoreGridProps) {
  const { caption, rows, week, settings, showStation, accessKey, saveAction } = props;

  const columns = useMemo<GridColumn<ScoreGridRow>[]>(() => {
    const avgOf = (value: (key: string) => CellValue) => coachingAvg(SCORE_KEYS.map((k) => numberOrNull(value(k))));
    const pass = formatDecimal(settings.passGrade, 0, 2);
    const result = "Hasil minggu ini";
    return [
      { key: "code", header: "ID", width: 92, editor: "readonly", frozen: true },
      {
        key: "name",
        header: "Nama",
        width: 196,
        editor: "readonly",
        frozen: true,
        render: (value, row) =>
          row.assignmentStatus && row.assignmentStatus !== "Aktif" ? (
            <span className="flex items-center gap-1.5">
              <span className="truncate">{value}</span>
              <StatusChip label={row.assignmentStatus} />
            </span>
          ) : (
            value
          ),
      },
      ...(showStation
        ? [{ key: "station", header: "Unit", width: 64, editor: "readonly" } satisfies GridColumn<ScoreGridRow>]
        : []),
      {
        key: "touch_point",
        header: "Touch Point",
        width: 156,
        editor: "select",
        options: TOUCH_POINTS.map((value) => ({ value })),
        render: (value, row) =>
          value ? (
            String(value)
          ) : row.defaultTouchPoint ? (
            <span className="text-ink-muted">{row.defaultTouchPoint} (Master)</span>
          ) : null,
      },
      ...ASPECT_FIELDS.map(
        (a): GridColumn<ScoreGridRow> => ({
          key: a.field,
          // "Grooming & Appearance" → "Grooming"; the full name is the spoken label and tooltip.
          header: a.label.replace(/ (& .*|Skill)$/, ""),
          label: a.label,
          group: "Skor coaching (0 sampai 100)",
          width: 132,
          editor: "number",
          min: 0,
          max: 100,
          decimals: 2,
        }),
      ),
      {
        key: "avg",
        header: "Rata-rata",
        group: result,
        width: 84,
        editor: "readonly",
        align: "end",
        derive: (_row, value) => avgOf(value),
        render: (value) => <span className="font-semibold">{formatScore(numberOrNull(value))}</span>,
      },
      {
        key: "status",
        header: `Status ≥${pass}`,
        label: `Status coaching, lulus bila rata-rata ${pass} atau lebih`,
        group: result,
        width: 120,
        editor: "readonly",
        derive: (_row, value) => coachingStatus(avgOf(value), settings),
        render: (value) => {
          const label = textOrNull(value);
          return <StatusChip label={label} emptyLabel="Belum dinilai" />;
        },
      },
      {
        key: "delta",
        header: "Δ Final Result",
        label: "Selisih rata-rata minggu ini dengan Final Result training",
        group: result,
        width: 104,
        editor: "readonly",
        align: "end",
        derive: (row, value) => deltaVsBaseline(avgOf(value), row.finalResult),
        render: (value) => formatSignedScore(numberOrNull(value)),
      },
      {
        key: "gap_topic",
        header: "Topik Gap",
        width: 168,
        editor: "select",
        options: GAP_TOPICS.map((value) => ({ value })),
      },
      { key: "observer", header: "Observer", width: 160, editor: "text", maxLength: 200 },
      { key: "coaching_notes", header: "Catatan", width: 240, editor: "longtext", maxLength: 4000 },
      { key: "changed", header: "Terakhir diubah", width: 232, editor: "readonly", get: (r) => r.changedLabel },
    ];
  }, [settings, showStation]);

  const confirmClear = useMemo(
    () => ({
      fields: INPUT_KEYS,
      message: (r: ScoreGridRow) => `Hapus nilai Minggu ke-${week} untuk ${r.name}?`,
      confirmLabel: "Hapus nilai",
    }),
    [week],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: ScoreGridRow): Promise<SaveRowResult> => {
      const pick = (field: string): CellValue =>
        field in changes ? changes[field] : (row[field as keyof ScoreGridRow] as CellValue);
      const scores = SCORE_KEYS.map((k) => numberOrNull(pick(k)));
      const gapTopic = textOrNull(pick("gap_topic"));
      const observer = textOrNull(pick("observer"));
      const coachingNotes = textOrNull(pick("coaching_notes"));
      const hasContent = scores.some((s) => s !== null) || gapTopic !== null || observer !== null || coachingNotes !== null;
      // A scored row without a touch point takes the one from Master SDM (shown greyed in the cell).
      const touchPoint = textOrNull(pick("touch_point")) ?? (hasContent ? row.defaultTouchPoint : null);
      const result = await saveAction(accessKey, {
        staffCode: row.code,
        week,
        touchPoint,
        scores,
        gapTopic,
        observer,
        coachingNotes,
      });
      if (result.ok) return { ok: true };
      return {
        ok: false,
        message: result.error.message,
        fieldErrors: result.error.field ? { [result.error.field]: result.error.message } : undefined,
      };
    },
    [accessKey, saveAction, week],
  );

  return (
    <DataGrid
      caption={caption}
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      rowLabel={rowLabel}
      onSaveRow={onSaveRow}
      confirmClear={confirmClear}
      search={SEARCH}
      toolbar={props.toolbar}
      summary={props.summary}
      emptyState={props.emptyState}
      phone={props.phone}
    />
  );
}
