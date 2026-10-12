import { describe, expect, test } from "bun:test";
import type { WorkspaceActionItem } from "@/lib/workspace";
import { matchesFilters, parseAspect, parseGroup, toActionView } from "./action-view";

const ITEM: WorkspaceActionItem = {
  code: "GA-TL01",
  groupName: "Coaching Frontliner",
  aspect: "Fit & Grooming (BMI)",
  rootCause: "BMI overweight",
  action: "Program kebugaran",
  target: "Overweight < 20 %",
  kind: "Rutin",
  schedule: "Setiap 2 minggu",
  dueDate: null,
  pic: "Dummy A",
  status: "On Progress",
  progress: 20,
  updatedOn: null,
  evidence: null,
  kpsNotes: null,
  source: "Slide 15",
  sortOrder: 1,
  updatedAt: "2026-10-12T00:00:00Z",
  updatedByLink: null,
};
const WS = { linkId: null, linkLabels: {} };

describe("toActionView", () => {
  test("no due date: flag 'Batas waktu belum ditetapkan', no days left, after dated items", () => {
    const view = toActionView(ITEM, "2026-10-12", WS);
    expect(view.flag).toBe("Batas waktu belum ditetapkan");
    expect(view.daysLeft).toBeNull();
    expect(view.dueLabel).toBeNull();
    expect(view.urgency).toBe(3);
    expect(view.source).toBe("Slide 15");
  });
  test("overdue and due-soon items lead", () => {
    expect(toActionView({ ...ITEM, dueDate: "2026-10-01" }, "2026-10-12", WS).urgency).toBe(0);
    expect(toActionView({ ...ITEM, dueDate: "2026-10-15" }, "2026-10-12", WS).urgency).toBe(1);
    expect(toActionView({ ...ITEM, dueDate: "2026-10-15", status: "Selesai" }, "2026-10-12", WS).urgency).toBe(4);
  });
});

describe("filters", () => {
  const view = toActionView(ITEM, "2026-10-12", WS);
  test("aspect, status and flag", () => {
    expect(matchesFilters(view, { status: "", flag: "", aspect: "" })).toBe(true);
    expect(matchesFilters(view, { status: "", flag: "", aspect: "Product Knowledge" })).toBe(false);
    expect(matchesFilters(view, { status: "Selesai", flag: "", aspect: "" })).toBe(false);
    expect(matchesFilters(view, { status: "", flag: "Batas waktu belum ditetapkan", aspect: "" })).toBe(true);
    expect(matchesFilters(view, { status: "", flag: "perlu", aspect: "" })).toBe(false);
  });
  test("URL values outside the vocabulary are ignored", () => {
    expect(parseGroup("Timeline Training")).toBe("Timeline Training");
    expect(parseGroup("SUB")).toBeNull();
    expect(parseAspect("Remedial")).toBe("Remedial");
    expect(parseAspect("x")).toBe("");
  });
});
