import { describe, expect, test } from "bun:test";
import { COMMITMENT_IDEAL, COMMITMENT_MAX, commitmentCell, commitmentDraft, commitmentError, commitmentToSave, needsCommitment } from "./bmi-commitment";

describe("Komitmen/Target", () => {
  test("everything but Normal asks for a commitment", () => {
    expect(needsCommitment("Normal")).toBe(false);
    expect(needsCommitment(null)).toBe(false);
    for (const category of ["Kurus", "Overweight", "Obesitas"] as const) expect(needsCommitment(category)).toBe(true);
  });

  test("a Normal check is saved as Sudah Ideal whatever was typed", () => {
    expect(commitmentToSave("Normal", "Turun 5 kg")).toBe(COMMITMENT_IDEAL);
    expect(commitmentToSave("Normal", null)).toBe(COMMITMENT_IDEAL);
  });

  test("above or below Normal the typed text is kept, trimmed, and empty is none", () => {
    expect(commitmentToSave("Obesitas", "  Turun 5 kg dalam 2 bulan ")).toBe("Turun 5 kg dalam 2 bulan");
    expect(commitmentToSave("Overweight", "   ")).toBeNull();
    expect(commitmentToSave("Kurus", undefined)).toBeNull();
    expect(commitmentToSave(null, "x")).toBeNull();
  });

  test("the cell: Sudah Ideal and read-only when Normal, typed text and editable otherwise, empty without a check", () => {
    expect(commitmentCell("Normal", null)).toEqual({ text: COMMITMENT_IDEAL, editable: false });
    expect(commitmentCell("Obesitas", "Turun 5 kg")).toEqual({ text: "Turun 5 kg", editable: true });
    expect(commitmentCell("Obesitas", null)).toEqual({ text: "", editable: true });
    // A check that just left Normal still carries the old text until the database clears it.
    expect(commitmentCell("Overweight", COMMITMENT_IDEAL)).toEqual({ text: "", editable: true });
    expect(commitmentCell(null, null)).toEqual({ text: "", editable: false });
  });

  test("the input of a stored check starts with its typed text, never with Sudah Ideal", () => {
    expect(commitmentDraft("Obesitas", "Turun 5 kg")).toBe("Turun 5 kg");
    expect(commitmentDraft("Overweight", null)).toBe("");
    expect(commitmentDraft("Normal", COMMITMENT_IDEAL)).toBe("");
    expect(commitmentDraft("Overweight", COMMITMENT_IDEAL)).toBe("");
    expect(commitmentDraft(null, "x")).toBe("");
  });

  test("a commitment is at most 500 characters", () => {
    expect(commitmentError("x".repeat(COMMITMENT_MAX))).toBeNull();
    expect(commitmentError("x".repeat(COMMITMENT_MAX + 1))).not.toBeNull();
  });
});
