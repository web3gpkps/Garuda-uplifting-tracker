"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { Settings } from "@/lib/rules";
import { Field, Input } from "@/components/ui/Field";
import { ScoreRow, type EntryStaff, type SaveScoreAction } from "./ScoreRow";

export type EntryGroup = {
  /** Station code; the heading is shown only when the list holds more than one station. */
  station: string;
  /** "3 dari 26 dinilai". */
  summary: string;
  staff: EntryStaff[];
};

type WeeklyEntryProps = {
  accessKey: string;
  week: number;
  settings: Settings;
  groups: EntryGroup[];
  showStationHeadings: boolean;
  /** Accessible name of the list, e.g. "Penilaian Minggu ke-1, CGK". */
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
 * Penilaian on phones: one card per person in scope. Each card saves on its own; after a
 * save, focus moves to the first score of the next card without a score (wrapping to the
 * top), so a supervisor can score a whole station in one pass. Client component.
 */
export function WeeklyEntry({ accessKey, week, settings, groups, showStationHeadings, label, saveAction }: WeeklyEntryProps) {
  const defaultObserver = useSyncExternalStore(subscribeObserver, readObserver, () => "");
  const listRef = useRef<HTMLUListElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const goToNext = useCallback((code: string) => {
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-entry-card]") ?? [])];
    const index = cards.findIndex((c) => c.dataset.code === code);
    const ordered = [...cards.slice(index + 1), ...cards.slice(0, Math.max(index, 0))];
    const next = ordered.find((c) => c.dataset.scored === "false");
    if (!next) {
      setAnnouncement("Semua SDM di daftar ini sudah dinilai.");
      return;
    }
    setAnnouncement("");
    next.scrollIntoView({ block: "start" });
    next.querySelector<HTMLElement>("[data-score-input]")?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex flex-col">
      <div className="border-b border-line px-4 py-3">
        <Field label="Nama observer" help="Terisi di kartu yang mulai dinilai." className="max-w-md">
          <Input
            value={defaultObserver}
            onChange={(event) => writeObserver(event.target.value)}
            maxLength={200}
            autoComplete="name"
          />
        </Field>
      </div>

      <p role="status" aria-live="polite" className="empty:hidden px-4 pt-3 text-sm font-semibold text-good">
        {announcement}
      </p>

      <ul ref={listRef} aria-label={label}>
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
            onSaved={goToNext}
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
  onSaved: (code: string) => void;
}) {
  return (
    <>
      {showHeading ? (
        <li className="flex items-baseline justify-between gap-3 border-b border-line bg-surface-sunken px-4 py-2">
          <h3 className="station-code text-sm text-ink">{group.station}</h3>
          <span className="text-xs text-ink-muted tabular-nums">{group.summary}</span>
        </li>
      ) : null}
      {group.staff.map((staff) => (
        <ScoreRow key={staff.code} staff={staff} {...rowProps} />
      ))}
    </>
  );
}
