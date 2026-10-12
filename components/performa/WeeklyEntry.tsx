"use client";

import { useSyncExternalStore } from "react";
import type { Settings } from "@/lib/rules";
import { Field, Input } from "@/components/ui/Field";
import { ScoreRow, type EntryStaff, type SaveScoreAction } from "./ScoreRow";

export type EntryGroup = {
  /** Station code; the heading is shown only when the list holds more than one station. */
  station: string;
  /** "26 SDM, 3 sudah dinilai". */
  summary: string;
  staff: EntryStaff[];
};

type WeeklyEntryProps = {
  accessKey: string;
  week: number;
  settings: Settings;
  groups: EntryGroup[];
  showStationHeadings: boolean;
  /** Accessible name of the list, e.g. "Nilai Minggu ke-1, Unit CGK". */
  label: string;
  saveAction: SaveScoreAction;
};

/*
 * The default observer is a per-browser convenience (the supervisor usually scores the
 * whole station), kept in localStorage. Every access is guarded: private windows and
 * blocked storage fall back to memory, so the field always stays editable.
 */
const OBSERVER_KEY = "garuda.performa.observer";
let observerMemory = "";
const observerListeners = new Set<() => void>();

function subscribeObserver(callback: () => void) {
  observerListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    observerListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readObserver(): string {
  try {
    return window.localStorage.getItem(OBSERVER_KEY) ?? observerMemory;
  } catch {
    return observerMemory;
  }
}

function writeObserver(value: string) {
  observerMemory = value;
  try {
    if (value === "") window.localStorage.removeItem(OBSERVER_KEY);
    else window.localStorage.setItem(OBSERVER_KEY, value);
  } catch {
    // Storage unavailable: the in-memory value still works for this page.
  }
  for (const listener of observerListeners) listener();
}

/**
 * Weekly entry on phones (Log Performa Mingguan): one card per staff member in scope.
 * Client component; each card saves on its own through `saveAction`.
 */
export function WeeklyEntry({ accessKey, week, settings, groups, showStationHeadings, label, saveAction }: WeeklyEntryProps) {
  const defaultObserver = useSyncExternalStore(subscribeObserver, readObserver, () => "");

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-line px-4 pb-4 sm:px-6">
        <Field
          label="Observer untuk SDM yang Anda nilai"
          help="Terisi sendiri di kolom Observer saat Anda mulai menilai SDM yang observernya masih kosong. Diingat di peramban ini."
          className="max-w-md"
        >
          <Input
            value={defaultObserver}
            onChange={(event) => writeObserver(event.target.value)}
            maxLength={200}
            autoComplete="name"
            placeholder="Nama Anda"
          />
        </Field>
        <p className="max-w-md text-xs text-ink-muted">
          Isi skor 0 sampai 100 (boleh desimal, contoh 87,5). Touch point terisi dari Master SDM saat Anda mulai
          menilai. Kosongkan semua isian kartu yang sudah tersimpan untuk menghapusnya.
        </p>
      </div>

      <ul aria-label={label}>
        {groups.map((group) => (
          <GroupRows
            key={group.station}
            group={group}
            showHeading={showStationHeadings}
            accessKey={accessKey}
            week={week}
            settings={settings}
            defaultObserver={defaultObserver}
            saveAction={saveAction}
          />
        ))}
      </ul>
    </div>
  );
}

function GroupRows({
  group,
  showHeading,
  ...rowProps
}: {
  group: EntryGroup;
  showHeading: boolean;
  accessKey: string;
  week: number;
  settings: Settings;
  defaultObserver: string;
  saveAction: SaveScoreAction;
}) {
  return (
    <>
      {showHeading ? (
        <li className="border-b border-line bg-paper px-4 py-2 sm:px-6">
          <h3 className="text-sm font-semibold text-ink">
            Unit {group.station}
            <span className="ml-2 text-xs font-normal text-ink-muted">{group.summary}</span>
          </h3>
        </li>
      ) : null}
      {group.staff.map((staff) => (
        <ScoreRow key={staff.code} staff={staff} {...rowProps} />
      ))}
    </>
  );
}
