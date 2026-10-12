/**
 * Column order of the Penilaian Mingguan grid (pure, unit-tested).
 *
 * Paste from Excel fills the grid's visible columns from the active cell to the right
 * (lib/grid, DataGrid onPaste). So the extra columns ("Kolom lainnya") always come after
 * the core ones: collapsing or expanding them never shifts the core columns, and a block
 * of four scores pasted at Grooming lands in the same four cells either way. A block that
 * runs past Status only reaches the extra columns while they are shown; otherwise the
 * overflow is dropped, never written into another column.
 */
import { ASPECT_FIELDS } from "./format";

/** Input fields behind "Kolom lainnya", in display order. */
export const MORE_INPUT_KEYS = ["touch_point", "gap_topic", "observer", "coaching_notes"] as const;

/** Read-only extras shown with them. */
export const MORE_READONLY_KEYS = ["delta", "changed"] as const;

/** Every input field of a weekly score row (the set that, all blank, deletes the row). */
export const SCORE_INPUT_KEYS: string[] = [...ASPECT_FIELDS.map((a) => a.field), ...MORE_INPUT_KEYS];

/** Visible column keys, left to right. */
export function scoreColumnKeys({ showStation, more }: { showStation: boolean; more: boolean }): string[] {
  const core = [
    "code",
    "name",
    ...(showStation ? ["station"] : []),
    ...ASPECT_FIELDS.map((a) => a.field),
    "avg",
    "status",
  ];
  return more ? [...core, ...MORE_INPUT_KEYS, ...MORE_READONLY_KEYS] : core;
}
