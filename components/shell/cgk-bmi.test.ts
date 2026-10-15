import { describe, expect, test } from "bun:test";
import { ACCOUNT_ACCESS, navSections, OWNER_ACCESS } from "@/lib/workspace/access";
import { bmiPeriodView, branchBmiNavigation, cgkBmiNavigation, isBranchBmiView, isCgkBmiShare } from "./cgk-bmi";

describe("Cek BMI period view", () => {
  test("every access opens on all periods and can switch to the chosen one", () => {
    expect(bmiPeriodView(undefined).allSlots).toBe(true);
    expect(bmiPeriodView("1").allSlots).toBe(true);
    expect(bmiPeriodView("0").allSlots).toBe(false);
  });
  test("the label is Cek and the query keeps the default out of the URL", () => {
    expect(bmiPeriodView(undefined).label).toBe("Cek");
    expect(bmiPeriodView(undefined).query(true)).toBeNull();
    expect(bmiPeriodView(undefined).query(false)).toBe(0);
  });
});

describe("CGK BMI navigation", () => {
  test("only a verified CGK station link uses the BMI-only menu", () => {
    const ws = { scope: "CGK", isKps: false, isOwner: false };
    expect(isCgkBmiShare({ kind: "link" }, ws)).toBe(true);
    for (const scope of ["DPS", "KPS", "cgk"]) expect(isCgkBmiShare({ kind: "link" }, { ...ws, scope })).toBe(false);
    expect(isCgkBmiShare(OWNER_ACCESS, ws)).toBe(false);
    expect(isCgkBmiShare({ kind: "link" }, { ...ws, isKps: true })).toBe(false);
    expect(isCgkBmiShare({ kind: "link" }, { ...ws, isOwner: true })).toBe(false);
  });

  test("a signed-in branch account keeps the full menu, even for CGK", () => {
    const ws = { scope: "CGK", isKps: false, isOwner: false };
    expect(isCgkBmiShare({ kind: "account" }, ws)).toBe(false);
  });

  test("filtering keeps BMI and leaves the original navigation available", () => {
    const original = navSections({ kind: "link", basePath: "/fixture" }, false);
    const before = JSON.stringify(original);
    expect(cgkBmiNavigation(original).flatMap((s) => s.items).map((s) => s.key)).toEqual(["bmi"]);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.flatMap((s) => s.items).map((s) => s.key)).toContain("sdm");
    expect(navSections(OWNER_ACCESS, true).flatMap((s) => s.items).map((s) => s.key)).toContain("sinkronisasi");
    expect(navSections({ kind: "link", basePath: "/fixture" }, true).flatMap((s) => s.items).map((s) => s.key)).toContain("tindakLanjut");
  });
});

describe("branch account view", () => {
  const ws = { isKps: false, isOwner: false };

  test("only a single-station account gets it: not KPS, not the owner, not a link", () => {
    expect(isBranchBmiView({ kind: "account" }, ws)).toBe(true);
    expect(isBranchBmiView({ kind: "account" }, { ...ws, isKps: true })).toBe(false);
    expect(isBranchBmiView({ kind: "account" }, { ...ws, isOwner: true })).toBe(false);
    expect(isBranchBmiView({ kind: "owner" }, ws)).toBe(false);
    expect(isBranchBmiView({ kind: "link" }, ws)).toBe(false);
  });

  test("the menu is Cek BMI only, named BMI Monitoring Tracker; the full menu is untouched", () => {
    const original = navSections(ACCOUNT_ACCESS, false);
    const before = JSON.stringify(original);
    const menu = branchBmiNavigation(original).flatMap((s) => s.items);
    expect(menu.map((i) => [i.key, i.label, i.shortLabel, i.href])).toEqual([
      ["bmi", "BMI Monitoring Tracker", "BMI Monitoring Tracker", "/cabang/bmi"],
    ]);
    expect(JSON.stringify(original)).toBe(before);
    expect(original.flatMap((s) => s.items).map((i) => i.key)).toContain("sdm");
    expect(original.flatMap((s) => s.items).find((i) => i.key === "bmi")?.label).toBe("Cek BMI");
  });
});
