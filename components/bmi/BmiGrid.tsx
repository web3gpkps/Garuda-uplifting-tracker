"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  DataGrid,
  type CellValue,
  type ConfirmClear,
  type GridColumn,
  type SaveRowResult,
} from "@/components/grid/DataGrid";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { formatTanggalPendek } from "@/lib/dates";
import { formatDecimal, formatSignedKg } from "@/lib/format";
import type { BmiCategory, BmiScheduleStatus, Settings } from "@/lib/rules";
import { saveBmiCheck, saveBmiProfile, type BmiActionResult } from "./actions";
import {
  BmiPersonSheet,
  CLOSED_SHEET,
  closeSheet,
  openSheet,
  profileIncomplete,
  type BmiPerson,
} from "./BmiPersonSheet";
import { isPlausibleDate } from "./format";
import { useStableOrder } from "./stable-order";
import { hasNoteLabel, parseHasNote } from "./summary";

export type BmiGridCheck = {
  date: string | null;
  tb: number;
  bb: number;
  bmi: number | null;
  category: BmiCategory | null;
};

export type BmiGridRow = {
  code: string;
  name: string;
  station: string | null;
  gender: string | null;
  /** "Ada catatan BMI": Ya (cek tiap 14 hari) / Tidak (bulanan) / null (belum diisi, dianggap 14 hari). */
  bmiHasNote: boolean | null;
  /** "Catatan program kebugaran". */
  bmiNote: string | null;
  /** index 0 = period 1; null when that period has no check. */
  checks: Array<BmiGridCheck | null>;
  weightDelta: number | null;
  /** Periods with a weight, so Δ berat is shown only from the second weighing. */
  weighings: number;
  nextCheck: string;
  scheduleStatus: BmiScheduleStatus;
  /** "Belum dicek · terlambat 3 hari" for the chosen slot. */
  slotStatus: { text: string; tone: StatusTone };
  /** "tautan ini, 8 Okt 07.55" for the latest change to this staff member's checks. */
  changed: string | null;
  /** Profile and history for the per-person sheet. */
  person: BmiPerson;
};

type BmiGridProps = {
  caption: string;
  rows: BmiGridRow[];
  accessKey: string;
  plannedDates: string[];
  /** The chosen slot. */
  period: number;
  /** false: only the chosen slot. true: every slot, the profile and the schedule columns. */
  allSlots: boolean;
  showStation: boolean;
  settings: Settings;
  emptyState: ReactNode;
  phone: ReactNode;
};

const STATUS_TEXT: Record<StatusTone, string> = {
  good: "text-good",
  neutral: "text-ink-muted",
  warning: "text-warning",
  critical: "text-critical",
  progress: "text-progress",
};

export function periodGroup(period: number, plannedDate: string): string {
  return `Cek ke-${period} · ${formatTanggalPendek(plannedDate)}`;
}

const rowKey = (r: BmiGridRow) => r.code;
const rowLabel = (r: BmiGridRow) => `${r.code}, ${r.name}`;
const SEARCH = {
  placeholder: "Nama atau ID",
  text: (r: BmiGridRow) => `${r.code} ${r.name}`,
};

const FIELD_OF_ERROR: Record<string, string> = {
  height_cm: "tb",
  weight_kg: "bb",
  check_date: "tgl",
};

function chip(value: CellValue) {
  return value ? <StatusChip label={String(value)} /> : null;
}

/** Tgl / TB / BB (input) and BMI / Kategori (computed) of one slot. */
function slotColumns(p: number, planned: string, group: string | undefined): GridColumn<BmiGridRow>[] {
  const i = p - 1;
  const check = (r: BmiGridRow) => r.checks[i];
  return [
    {
      key: `tgl_${p}`,
      header: "Tgl",
      label: `Tanggal cek ke-${p}, kosong berarti ${formatTanggalPendek(planned)}`,
      group,
      width: 108,
      editor: "date",
      get: (r) => check(r)?.date ?? null,
      validate: (value) => (typeof value === "string" && !isPlausibleDate(value) ? "Tanggal tidak valid." : null),
    },
    {
      key: `tb_${p}`,
      header: "TB",
      label: `Tinggi badan cek ke-${p} (cm)`,
      group,
      width: 76,
      editor: "number",
      min: 120,
      max: 210,
      decimals: 1,
      get: (r) => check(r)?.tb ?? null,
    },
    {
      key: `bb_${p}`,
      header: "BB",
      label: `Berat badan cek ke-${p} (kg)`,
      group,
      width: 76,
      editor: "number",
      min: 30,
      max: 200,
      decimals: 1,
      get: (r) => check(r)?.bb ?? null,
    },
    {
      key: `bmi_${p}`,
      header: "BMI",
      label: `BMI cek ke-${p}`,
      group,
      width: 64,
      editor: "readonly",
      align: "end",
      get: (r) => check(r)?.bmi ?? null,
      render: (value) => (typeof value === "number" ? formatDecimal(value, 1) : null),
    },
    {
      key: `kat_${p}`,
      header: "Kategori",
      label: `Kategori BMI cek ke-${p}`,
      group,
      width: 112,
      editor: "readonly",
      get: (r) => check(r)?.category ?? null,
      render: chip,
    },
  ];
}

/**
 * Cek BMI grid. By default only the chosen slot: Tgl, TB, BB (input), BMI, Kategori and the
 * person's status line (computed), due and late rows first. "Tampilkan semua cek" adds every
 * slot, L/P, Ada catatan BMI, the fitness note and the schedule. Each row saves itself: one
 * share_save_check per changed slot, one share_save_profile when the profile changed.
 * Clearing TB and BB of a stored slot asks first. Profile and history open in a sheet from
 * the "Profil" button. Client component.
 */
export function BmiGrid({
  caption,
  rows,
  accessKey,
  plannedDates,
  period,
  allSlots,
  showStation,
  settings,
  emptyState,
  phone,
}: BmiGridProps) {
  // A refresh sends a new array with the same dates: key the memo on the text so the
  // columns (and the grid's scroll position) stay put after every save.
  const datesKey = plannedDates.join(",");
  const ordered = useStableOrder(rows, rowKey);
  // The sheet lives outside the grid, so the grid never takes its keys or paste.
  const [sheet, setSheet] = useState(CLOSED_SHEET);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const sheetPerson = sheetCode ? (rows.find((r) => r.code === sheetCode)?.person ?? null) : null;

  const columns = useMemo<GridColumn<BmiGridRow>[]>(() => {
    const dates = datesKey.split(",");
    const out: GridColumn<BmiGridRow>[] = [
      {
        key: "code",
        header: "ID",
        width: 84,
        editor: "readonly",
        frozen: true,
      },
      {
        key: "name",
        header: "Nama",
        width: 188,
        editor: "readonly",
        frozen: true,
      },
    ];
    if (showStation)
      out.push({
        key: "station",
        header: "Stasiun",
        width: 72,
        editor: "readonly",
      });
    if (!allSlots) {
      out.push(...slotColumns(period, dates[period - 1], undefined), {
        key: "slot_status",
        header: "Status jadwal",
        width: 280,
        editor: "readonly",
        get: (r) => r.slotStatus.text,
        render: (_value, r) => (
          <span className={cx("text-sm", STATUS_TEXT[r.slotStatus.tone])}>{r.slotStatus.text}</span>
        ),
      });
      return out;
    }
    dates.forEach((planned, i) => out.push(...slotColumns(i + 1, planned, periodGroup(i + 1, planned))));
    out.push(
      {
        key: "gender",
        header: "L/P",
        group: "Profil",
        width: 64,
        editor: "select",
        options: [{ value: "L" }, { value: "P" }],
        get: (r) => (r.gender === "L" || r.gender === "P" ? r.gender : null),
      },
      {
        key: "bmi_has_note",
        header: "Ada catatan BMI",
        label: "Ada catatan BMI (Ya: cek tiap 2 minggu, Tidak: cek bulanan)",
        group: "Profil",
        width: 120,
        editor: "select",
        options: [{ value: "Ya" }, { value: "Tidak" }],
        get: (r) => hasNoteLabel(r.bmiHasNote),
      },
      {
        key: "bmi_note",
        header: "Catatan program kebugaran",
        group: "Profil",
        width: 240,
        editor: "longtext",
        maxLength: 2000,
        get: (r) => r.bmiNote,
      },
      {
        key: "delta",
        header: "Δ berat",
        label: "Perubahan berat sejak cek pertama",
        group: "Jadwal",
        width: 88,
        editor: "readonly",
        align: "end",
        get: (r) => (r.weighings >= 2 ? r.weightDelta : null),
        render: (value) => (typeof value === "number" ? formatSignedKg(value) : null),
      },
      {
        key: "next_check",
        header: "Cek berikutnya",
        group: "Jadwal",
        width: 116,
        editor: "readonly",
        get: (r) => r.nextCheck,
        render: (value) =>
          typeof value === "string" ? (
            <time dateTime={value} className="tabular-nums">
              {formatTanggalPendek(value)}
            </time>
          ) : null,
      },
      {
        key: "schedule_status",
        header: "Status jadwal",
        group: "Jadwal",
        width: 128,
        editor: "readonly",
        get: (r) => r.scheduleStatus,
        render: chip,
      },
      {
        key: "changed",
        header: "Terakhir diubah lewat",
        width: 220,
        editor: "readonly",
        render: (_value, r) => (r.changed ? <span className="text-xs text-ink-muted">{r.changed}</span> : null),
      },
    );
    return out;
  }, [datesKey, showStation, allSlots, period]);

  const rowActions = useMemo(
    () => ({
      header: "Profil",
      width: 112,
      render: (row: BmiGridRow) => {
        const open = () => {
          setSheetCode(row.code);
          setSheet(openSheet);
        };
        return profileIncomplete(row.person) ? (
          <Button size="sm" variant="secondary" tabIndex={-1} onClick={open}>
            Isi profil
            <span className="sr-only"> {row.name}, Ada catatan BMI belum diisi</span>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" tabIndex={-1} onClick={open}>
            Profil<span className="sr-only"> {row.name}</span>
          </Button>
        );
      },
    }),
    [],
  );

  const confirmClear = useMemo<ConfirmClear<BmiGridRow>>(
    () => ({
      groups: datesKey.split(",").map((_, i) => ({
        fields: [`tb_${i + 1}`, `bb_${i + 1}`],
        label: `ke-${i + 1}`,
      })),
      message: (row, labels) => `Hapus cek BMI ${labels.join(" dan ")} untuk ${row.name}?`,
      description: "TB dan BB cek itu dikosongkan, jadi cek tersebut dihapus. Cek lain tidak berubah.",
      confirmLabel: (labels) => `Hapus cek ${labels.join(" dan ")}`,
    }),
    [datesKey],
  );

  const onSaveRow = useCallback(
    async (_key: string, changes: Record<string, CellValue>, row: BmiGridRow): Promise<SaveRowResult> => {
      const has = (field: string) => field in changes;
      const fieldErrors: Record<string, string> = {};
      const writes: Array<{
        period: number;
        checkDate: string | null;
        heightCm: number | null;
        weightKg: number | null;
      }> = [];

      datesKey.split(",").forEach((planned, i) => {
        const p = i + 1;
        if (!has(`tgl_${p}`) && !has(`tb_${p}`) && !has(`bb_${p}`)) return;
        const stored = row.checks[i];
        const tb = has(`tb_${p}`) ? (changes[`tb_${p}`] as number | null) : (stored?.tb ?? null);
        const bb = has(`bb_${p}`) ? (changes[`bb_${p}`] as number | null) : (stored?.bb ?? null);
        const date = has(`tgl_${p}`) ? (changes[`tgl_${p}`] as string | null) : (stored?.date ?? null);
        if (tb === null && bb === null) {
          // Only reached for a stored check after the grid's delete confirmation.
          if (stored)
            writes.push({
              period: p,
              checkDate: null,
              heightCm: null,
              weightKg: null,
            });
          else fieldErrors[`tb_${p}`] = "Isi TB dan BB untuk menyimpan cek ini.";
          return;
        }
        if (tb === null) {
          fieldErrors[`tb_${p}`] = stored
            ? "Isi TB juga, atau kosongkan TB dan BB untuk menghapus cek."
            : "Isi TB juga.";
          return;
        }
        if (bb === null) {
          fieldErrors[`bb_${p}`] = stored
            ? "Isi BB juga, atau kosongkan TB dan BB untuk menghapus cek."
            : "Isi BB juga.";
          return;
        }
        // A new check without a typed date takes the planned date of its period.
        writes.push({
          period: p,
          checkDate: date ?? planned,
          heightCm: tb,
          weightKg: bb,
        });
      });

      const outcome: { failure: string | null } = { failure: null };
      const run = async (call: () => Promise<BmiActionResult>, fieldFor: (serverField?: string) => string | null) => {
        let result: BmiActionResult;
        try {
          result = await call();
        } catch {
          outcome.failure = "Koneksi ke server terputus. Isian tetap ada; coba simpan lagi.";
          return;
        }
        if (result.ok) return;
        outcome.failure = result.error.message;
        const field = fieldFor(result.error.field);
        if (field) fieldErrors[field] = result.error.message;
      };

      for (const w of writes) {
        await run(
          () => saveBmiCheck(accessKey, { staffCode: row.code, ...w }),
          (serverField) =>
            serverField && FIELD_OF_ERROR[serverField] ? `${FIELD_OF_ERROR[serverField]}_${w.period}` : null,
        );
      }
      if (has("gender") || has("bmi_has_note") || has("bmi_note")) {
        const gender = has("gender") ? changes.gender : row.gender;
        const hasNote = has("bmi_has_note") ? parseHasNote(changes.bmi_has_note) : row.bmiHasNote;
        const note = has("bmi_note") ? changes.bmi_note : row.bmiNote;
        await run(
          () =>
            saveBmiProfile(accessKey, {
              staffCode: row.code,
              gender: gender === "L" || gender === "P" ? gender : null,
              bmiHasNote: hasNote,
              bmiNote: typeof note === "string" && note.trim() !== "" ? note : null,
            }),
          (serverField) =>
            serverField === "gender" || serverField === "bmi_has_note" || serverField === "bmi_note"
              ? serverField
              : null,
        );
      }

      if (!outcome.failure && Object.keys(fieldErrors).length === 0) return { ok: true };
      return {
        ok: false,
        message: outcome.failure ?? "Periksa sel yang ditandai.",
        fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
      };
    },
    [accessKey, datesKey],
  );

  return (
    <>
      <DataGrid
        caption={caption}
        rows={ordered}
        columns={columns}
        rowKey={rowKey}
        rowLabel={rowLabel}
        onSaveRow={onSaveRow}
        search={SEARCH}
        confirmClear={confirmClear}
        rowActions={rowActions}
        highlightGroup={allSlots ? periodGroup(period, plannedDates[period - 1]) : undefined}
        highlightNote={allSlots ? "cek yang dipilih" : undefined}
        emptyState={emptyState}
        phone={phone}
      />
      {sheetPerson ? (
        <BmiPersonSheet
          key={sheet.n}
          open={sheet.open}
          onClose={() => setSheet(closeSheet)}
          accessKey={accessKey}
          person={sheetPerson}
          plannedDates={plannedDates}
          period={period}
          settings={settings}
        />
      ) : null}
    </>
  );
}
