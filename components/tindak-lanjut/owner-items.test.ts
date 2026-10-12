import { describe, expect, test } from "bun:test";
import {
  OWNER_ONLY_MESSAGE,
  addActionItem,
  nextActionCode,
  removeActionItem,
  validateNewItem,
  type ActionItemsPort,
  type ExistingItem,
  type NewItemInput,
  type NewItemRow,
} from "./owner-items";

const EXISTING: ExistingItem[] = [
  { code: "GA-TL01", groupName: "Coaching Frontliner", sortOrder: 1 },
  { code: "GA-TL05", groupName: "Coaching Frontliner", sortOrder: 5 },
  { code: "GA-TL09", groupName: "Timeline Training", sortOrder: 9 },
  { code: "GA-TL15", groupName: "Evaluasi IULS & RUST", sortOrder: 15 },
];

const INPUT: NewItemInput = {
  groupName: "Timeline Training",
  aspect: "Product Knowledge",
  code: "GA-TL16",
  rootCause: " Materi belum merata ",
  action: "Refresher product knowledge",
  target: "",
  kind: "Sekali",
  schedule: "",
  dueDate: "2026-12-18",
  pic: "Dummy A",
  source: "Slide 27",
};

function mockPort(overrides: Partial<ActionItemsPort> = {}) {
  const calls = { inserted: [] as NewItemRow[], removed: [] as string[], listed: 0 };
  const port: ActionItemsPort = {
    list: async () => {
      calls.listed += 1;
      return { data: EXISTING, error: null };
    },
    insert: async (row) => {
      calls.inserted.push(row);
      return { error: null };
    },
    remove: async (code) => {
      calls.removed.push(code);
      return { deleted: 1, error: null };
    },
    ...overrides,
  };
  return { port, calls };
}

describe("nextActionCode", () => {
  test("continues the national GA-TL numbering, padded to two digits", () => {
    expect(nextActionCode(EXISTING)).toBe("GA-TL16");
    expect(nextActionCode([{ code: "GA-TL03" }])).toBe("GA-TL04");
  });
  test("an empty list starts at GA-TL01; foreign codes are ignored", () => {
    expect(nextActionCode([])).toBe("GA-TL01");
    expect(nextActionCode([{ code: "SUB-TL13" }])).toBe("GA-TL01");
  });
});

describe("validateNewItem", () => {
  test("cleans text, defaults status/progress, places the row after its group", () => {
    const { row, fieldErrors } = validateNewItem(INPUT, EXISTING);
    expect(fieldErrors).toEqual({});
    expect(row).toEqual({
      code: "GA-TL16",
      group_name: "Timeline Training",
      aspect: "Product Knowledge",
      root_cause: "Materi belum merata",
      action: "Refresher product knowledge",
      target: null,
      kind: "Sekali",
      schedule: null,
      due_date: "2026-12-18",
      pic: "Dummy A",
      source: "Slide 27",
      status: "Belum Mulai",
      progress: 0,
      sort_order: 9,
    });
  });
  test("a missing due date is allowed (flag: Batas waktu belum ditetapkan)", () => {
    const { row } = validateNewItem({ ...INPUT, dueDate: "" }, EXISTING);
    expect(row?.due_date).toBeNull();
  });
  test("requires kelompok, aspek, code and tindakan; refuses a taken code and bad enums", () => {
    const { row, fieldErrors } = validateNewItem(
      { ...INPUT, groupName: "SUB", aspect: "Lainnya", code: "ga-tl05", action: "", kind: "Kadang", dueDate: "2026-13-01" },
      EXISTING,
    );
    expect(row).toBeNull();
    expect(Object.keys(fieldErrors).sort()).toEqual(["action", "aspect", "code", "dueDate", "groupName", "kind"]);
  });
});

describe("addActionItem", () => {
  test("refuses anyone but the owner without touching the table", async () => {
    const { port, calls } = mockPort();
    expect(await addActionItem(false, port, INPUT)).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(await addActionItem(true, null, INPUT)).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(calls.listed).toBe(0);
    expect(calls.inserted).toHaveLength(0);
  });
  test("owner: inserts the validated row", async () => {
    const { port, calls } = mockPort();
    expect(await addActionItem(true, port, INPUT)).toEqual({ ok: true, code: "GA-TL16" });
    expect(calls.inserted).toHaveLength(1);
    expect(calls.inserted[0].group_name).toBe("Timeline Training");
  });
  test("owner: invalid input never reaches insert", async () => {
    const { port, calls } = mockPort();
    const result = await addActionItem(true, port, { ...INPUT, action: "" });
    expect(result.ok).toBe(false);
    expect(calls.inserted).toHaveLength(0);
  });
  test("maps a duplicate key (23505) to the code field", async () => {
    const { port } = mockPort({ insert: async () => ({ error: { code: "23505", message: "duplicate key" } }) });
    const result = await addActionItem(true, port, INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.code).toContain("sudah dipakai");
  });
});

describe("removeActionItem", () => {
  test("refuses anyone but the owner", async () => {
    const { port, calls } = mockPort();
    expect(await removeActionItem(false, port, "GA-TL15")).toEqual({ ok: false, message: OWNER_ONLY_MESSAGE });
    expect(calls.removed).toHaveLength(0);
  });
  test("owner: deletes by code, reports a missing row", async () => {
    const { port, calls } = mockPort();
    expect(await removeActionItem(true, port, " GA-TL15 ")).toEqual({ ok: true, code: "GA-TL15" });
    expect(calls.removed).toEqual(["GA-TL15"]);
    const gone = mockPort({ remove: async () => ({ deleted: 0, error: null }) });
    const result = await removeActionItem(true, gone.port, "GA-TL99");
    expect(result.ok).toBe(false);
  });
});
