import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@/lib/rules";
import { bmiCsv, bmiCsvHeaders, bmiCsvRecords, csvDocument, csvField, csvFilename } from "./csv";
import { summarizeRow, type BmiRowView, type BmiTrackerRow } from "./tracker-model";

describe("csvField", () => {
  test("quotes every field and doubles inner quotes", () => {
    expect(csvField("abc")).toBe('"abc"');
    expect(csvField('Item "Sesuai" : 29')).toBe('"Item ""Sesuai"" : 29"');
    expect(csvField(12.5)).toBe('"12.5"');
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  test("keeps line breaks inside the quotes", () => {
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  test("a leading = + @ - tab or return is neutralised against CSV injection", () => {
    expect(csvField("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvField("+1")).toBe('"\'+1"');
    expect(csvField("@cmd")).toBe('"\'@cmd"');
    expect(csvField("-2")).toBe('"\'-2"');
    expect(csvField("\tx")).toBe('"\'\tx"');
    expect(csvField("a=b")).toBe('"a=b"');
  });
});

describe("csvDocument", () => {
  test("starts with a BOM and separates records with CRLF", () => {
    const text = csvDocument(["A", "B"], [[1, "x"], [2, "y"]]);
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text.slice(1)).toBe('"A","B"\r\n"1","x"\r\n"2","y"');
  });
});

describe("csvFilename", () => {
  test("names the scope and the date", () => {
    expect(csvFilename("SUB", "2026-10-14")).toBe("CGK_BMI_SUB_2026-10-14.csv");
    expect(csvFilename("KPS", "2026-10-14")).toBe("CGK_BMI_KPS_2026-10-14.csv");
  });
  test("an odd scope becomes file-safe", () => {
    expect(csvFilename("Semua stasiun", "2026-10-14")).toBe("CGK_BMI_Semua-stasiun_2026-10-14.csv");
    expect(csvFilename("../x", "2026-10-14")).toBe("CGK_BMI_x_2026-10-14.csv");
    expect(csvFilename("", "2026-10-14")).toBe("CGK_BMI_semua_2026-10-14.csv");
  });
});

describe("BMI rows as CSV", () => {
  const settings = { ...DEFAULT_SETTINGS, bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: 2 };
  const row: BmiTrackerRow = {
    code: "T-01",
    name: "Petugas uji",
    station: "AAA",
    touchPoint: "Boarding Gate",
    gender: "P",
    feedback: "Penilaian Coaching :\nScore : 87",
    remarks: "=1+1",
    hasNote: true,
    fitnessNote: null,
    assignmentStatus: "Aktif",
    changed: null,
    checks: [{ date: "2026-10-12", heightCm: 170, weightKg: 60, commitment: null }, null],
  };
  const views: BmiRowView[] = [{ row, summary: summarizeRow(row, settings, "2026-10-20") }];

  test("one header per column, six per period, headed by the full check label", () => {
    const headers = bmiCsvHeaders(settings);
    expect(headers).toHaveLength(9 + 6 * 2 + 8);
    expect(headers[4]).toBe("Touch Point");
    expect(headers).not.toContain("Program");
    expect(headers[9]).toBe("BMI Cek ke-1 (Periode 12-25 Oct 2026): Tgl Cek");
    expect(headers[13]).toBe("BMI Cek ke-1 (Periode 12-25 Oct 2026): Kategori");
    expect(headers[14]).toBe("BMI Cek ke-1 (Periode 12-25 Oct 2026): Komitmen/Target");
    expect(headers[15]).toBe("BMI Cek ke-2 (Periode 26 Oct-8 Nov 2026): Tgl Cek");
    expect(headers[19]).toBe("BMI Cek ke-2 (Periode 26 Oct-8 Nov 2026): Kategori");
    expect(headers[20]).toBe("BMI Cek ke-2 (Periode 26 Oct-8 Nov 2026): Komitmen/Target");
  });

  test("records line up with the headers", () => {
    const [record] = bmiCsvRecords(views, 2);
    expect(record).toHaveLength(bmiCsvHeaders(settings).length);
    expect(record.slice(0, 9)).toEqual([1, "T-01", "Petugas uji", "AAA", "Boarding Gate", "P", row.feedback, "=1+1", "Ya"]);
    expect(record.slice(9, 15)).toEqual(["2026-10-12", 170, 60, 20.8, "Normal", "Sudah Ideal"]);
    expect(record.slice(15, 21)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(record[21]).toBe(1);
  });

  test("a touch point typed by the owner is exported as it is, and made safe when it looks like a formula", () => {
    const free = { ...row, touchPoint: "Lounge Utama" };
    const risky = { ...row, touchPoint: "=HYPERLINK(1)" };
    const text = bmiCsv(
      [free, risky].map((r) => ({ row: r, summary: summarizeRow(r, settings, "2026-10-20") })),
      settings,
    );
    expect(text).toContain('"Lounge Utama"');
    expect(text).toContain('"\'=HYPERLINK(1)"');
  });

  test("the file neutralises formulas and keeps the long text whole", () => {
    const text = bmiCsv(views, settings);
    expect(text).toContain('"\'=1+1"');
    expect(text).toContain('"Penilaian Coaching :\nScore : 87"');
    expect(text.split("\r\n")).toHaveLength(2);
  });
});

describe("the id column of a branch account's export", () => {
  const settings = { ...DEFAULT_SETTINGS, bmiPeriods: 6 };
  const base: BmiTrackerRow = {
    code: "X-01", displayId: "198001", name: "Petugas", station: "AAA", touchPoint: null, gender: null, feedback: null,
    remarks: null, hasNote: null, fitnessNote: null, assignmentStatus: null, changed: null, checks: Array.from({ length: 6 }, () => null),
  };
  const view = (row: BmiTrackerRow): BmiRowView => ({ row, summary: summarizeRow(row, settings, "2026-10-20") });

  test("headed No Pegawai and filled with the employee number", () => {
    expect(bmiCsvHeaders(settings, "No Pegawai")[1]).toBe("No Pegawai");
    expect(bmiCsvHeaders(settings)[1]).toBe("ID SDM");
    expect(bmiCsvRecords([view(base)], 6)[0].slice(0, 3)).toEqual([1, "198001", "Petugas"]);
    expect(bmiCsvRecords([view({ ...base, displayId: undefined })], 6)[0][1]).toBe("X-01");
    expect(bmiCsv([view(base)], settings, "No Pegawai").split("\r\n")[0]).toContain('"No Pegawai"');
  });
});

describe("a programme with another number of checks", () => {
  // 1 and 52 are the limits of Parameter; 8 and 26 sit in between. Nothing is fixed at six.
  for (const periods of [1, 8, 26, 52]) {
    test(`${periods} checks: headers, records and the file keep the same width`, () => {
      const s = { ...DEFAULT_SETTINGS, bmiFirstCheck: "2026-10-12", bmiIntervalDays: 14, bmiPeriods: periods };
      const checks: BmiTrackerRow["checks"] = Array.from({ length: periods }, () => null);
      checks[periods - 1] = { date: "2027-01-01", heightCm: 165, weightKg: 70, commitment: null };
      const r: BmiTrackerRow = {
        code: "T-09",
        name: "Petugas lain",
        station: "BBB",
        touchPoint: null,
        gender: "L",
        feedback: null,
        remarks: null,
        hasNote: null,
        fitnessNote: null,
        assignmentStatus: "Aktif",
        changed: null,
        checks,
      };
      const view: BmiRowView = { row: r, summary: summarizeRow(r, s, "2026-10-20") };
      const headers = bmiCsvHeaders(s);
      const [record] = bmiCsvRecords([view], periods);
      expect(headers).toHaveLength(9 + 6 * periods + 8);
      expect(record).toHaveLength(headers.length);
      // The last check sits under the last check's own five headers.
      const last = 9 + 6 * (periods - 1);
      expect(headers[last].startsWith(`BMI Cek ke-${periods} (Periode `)).toBe(true);
      expect(record.slice(last, last + 6)).toEqual(["2027-01-01", 165, 70, 25.7, "Overweight", ""]);
      expect(new Set(headers).size).toBe(headers.length);
      const lines = bmiCsv([view], s).split("\r\n");
      expect(lines).toHaveLength(2);
      expect(lines[0].split('","')).toHaveLength(headers.length);
    });
  }
});
