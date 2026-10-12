/** Shapes shared by the Tindak Lanjut Server Actions and the client forms. */

export type ProgressField = "status" | "progress" | "updatedOn" | "evidence";

export type ProgressInput = {
  code: string;
  status: string;
  /** Integer 0..100 (DB units, same as action_items.progress). */
  progress: number;
  /** 'YYYY-MM-DD' or "" for none. */
  updatedOn: string;
  evidence: string;
};

export type DefinitionField =
  | "groupName"
  | "aspect"
  | "rootCause"
  | "action"
  | "target"
  | "kind"
  | "schedule"
  | "dueDate"
  | "pic"
  | "kpsNotes"
  | "source";

/** Every field is sent; "" clears it (NULL in the database). An empty Kelompok keeps the stored one. */
export type DefinitionInput = {
  code: string;
  groupName: string;
  aspect: string;
  rootCause: string;
  action: string;
  target: string;
  kind: string;
  schedule: string;
  dueDate: string;
  pic: string;
  kpsNotes: string;
  source: string;
};

export type ActionSaveResult<F extends string> =
  | { ok: true; savedAt: string }
  | { ok: false; message: string; fieldErrors?: Partial<Record<F, string>> };

/** Workbook column names, for messages that point at a field. */
export const FIELD_LABEL: Record<ProgressField | DefinitionField, string> = {
  status: "Status",
  progress: "% Progres",
  updatedOn: "Tgl update",
  evidence: "Realisasi / Bukti",
  groupName: "Kelompok",
  aspect: "Aspek",
  rootCause: "Akar masalah",
  action: "Tindakan",
  target: "Target (KPI)",
  kind: "Jenis",
  schedule: "Jadwal",
  dueDate: "Batas waktu",
  pic: "PIC",
  kpsNotes: "Catatan Garuda / KPS",
  source: "Sumber",
};
