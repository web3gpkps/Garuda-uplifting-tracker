import { describe, expect, test } from "bun:test";
import { parseTsv } from "@/lib/grid/tsv";
import { ASPECT_FIELDS } from "./format";
import { MORE_INPUT_KEYS, scoreColumnKeys } from "./score-columns";

/** Where DataGrid's onPaste puts each pasted cell: visible column active + j, overflow dropped. */
function pasteTargets(keys: string[], startKey: string, text: string): string[][] {
  const start = keys.indexOf(startKey);
  return parseTsv(text).map((line) => line.flatMap((_, j) => (start + j < keys.length ? [keys[start + j]] : [])));
}

const SCORES = ASPECT_FIELDS.map((a) => a.field);

describe("Penilaian grid column order", () => {
  test("the extra columns come after the core ones, so collapsing never shifts a core column", () => {
    for (const showStation of [false, true]) {
      const collapsed = scoreColumnKeys({ showStation, more: false });
      const expanded = scoreColumnKeys({ showStation, more: true });
      expect(expanded.slice(0, collapsed.length)).toEqual(collapsed);
      expect(collapsed).not.toContain("touch_point");
      for (const key of MORE_INPUT_KEYS) expect(expanded).toContain(key);
    }
  });

  test("core columns: ID, Nama, (Unit), four aspects, Rata-rata, Status", () => {
    expect(scoreColumnKeys({ showStation: false, more: false })).toEqual(["code", "name", ...SCORES, "avg", "status"]);
    expect(scoreColumnKeys({ showStation: true, more: false })).toEqual(["code", "name", "station", ...SCORES, "avg", "status"]);
  });

  test("four scores pasted from Excel at Grooming land in the same cells, collapsed or expanded", () => {
    const block = "90\t87,5\t80\t95\n70\t75\t80\t85\n";
    const collapsed = pasteTargets(scoreColumnKeys({ showStation: false, more: false }), "score_grooming", block);
    const expanded = pasteTargets(scoreColumnKeys({ showStation: false, more: true }), "score_grooming", block);
    expect(collapsed).toEqual([SCORES, SCORES]);
    expect(expanded).toEqual(collapsed);
  });

  test("a wider block only reaches the extra columns while they are shown", () => {
    const block = "90\t87\t80\t95\tx\ty\tBoarding Gate";
    expect(pasteTargets(scoreColumnKeys({ showStation: false, more: false }), "score_grooming", block)[0]).toEqual([
      ...SCORES,
      "avg",
      "status",
    ]);
    expect(pasteTargets(scoreColumnKeys({ showStation: false, more: true }), "score_grooming", block)[0]).toEqual([
      ...SCORES,
      "avg",
      "status",
      "touch_point",
    ]);
  });
});
