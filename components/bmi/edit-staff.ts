import { blankToNull, type StaffInput } from "@/components/sdm/staff-input";
import type { StaffSaveResult } from "@/components/sdm/actions";
import type { LinkError } from "@/lib/workspace/errors";
import { checkBmiStaffProfile, resolveTouchPoint, type TouchPointEntry } from "./add-staff";

/** What the "Ubah profil" dialog sends: the four things a person's profile lets you correct. */
export type EditBmiStaffInput = {
  /** ID SDM of the person being edited. It is the key and never changes. */
  code: string;
  name: string;
  employeeNo: string;
  touchPoint: TouchPointEntry;
  /** null leaves the L/P column empty. */
  gender: "L" | "P" | null;
};

/** The values as stored, so the screen can show them at once. */
export type EditBmiStaffResult =
  | { ok: true; name: string; employeeNo: string | null; touchPoint: string | null; gender: "L" | "P" | null }
  | { ok: false; error: LinkError };

/** The stored staff row the save starts from: everything the form does not touch is sent back as it is. */
export type EditableStaff = {
  code: string;
  program: string | null;
  provider: string | null;
  station: string | null;
  name: string | null;
  employeeNo: string | null;
  gender: string | null;
  touchPoint: string | null;
  assignmentStatus: string | null;
  notes: string | null;
};

export type EditBmiStaffPorts = {
  /** The staff the verified access may see, loaded on the server (never from the form). */
  load: () => Promise<EditableStaff[] | null>;
  saveStaff: (input: StaffInput) => Promise<StaffSaveResult>;
};

function invalid(field: string, message: string): LinkError {
  return { code: "invalid_input", field, message };
}

/** Name, employee number, touch point and L/P. null when fine. */
export function checkEditBmiStaff(input: EditBmiStaffInput): LinkError | null {
  if (!input || typeof input !== "object" || typeof input.code !== "string" || input.code.trim() === "") {
    return invalid("staff_code", "Data SDM tidak lengkap. Muat ulang halaman lalu coba lagi.");
  }
  if (typeof input.name !== "string" || input.name.trim() === "") return invalid("name", "Nama wajib diisi.");
  if (input.name.trim().length > 200) return invalid("name", "Nama paling panjang 200 karakter.");
  if (typeof input.employeeNo !== "string" || input.employeeNo.trim().length > 50) {
    return invalid("employee_no", "Nomor pegawai paling panjang 50 karakter.");
  }
  if (input.gender !== null && input.gender !== "L" && input.gender !== "P") return invalid("gender", "Pilih L, P, atau kosongkan.");
  const touchPoint = resolveTouchPoint(input.touchPoint);
  if (!touchPoint.ok) return touchPoint.error;
  return null;
}

/**
 * Saves a corrected profile. The person must be one the access can see; the station, the
 * assignment status, the program, the provider and the Result/Remarks text are read from the
 * stored row and sent back unchanged, because share_save_staff writes every field it is given.
 */
export async function editBmiStaff(input: EditBmiStaffInput, ports: EditBmiStaffPorts): Promise<EditBmiStaffResult> {
  const problem = checkEditBmiStaff(input);
  if (problem) return { ok: false, error: problem };
  const staff = await ports.load();
  if (!staff) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "Akses ini tidak bisa diperiksa. Muat ulang halaman, lalu coba lagi." },
    };
  }
  const current = staff.find((s) => s.code === input.code);
  if (!current) {
    return { ok: false, error: { code: "out_of_scope", message: "SDM ini tidak ada lagi. Muat ulang halaman." } };
  }
  const touchPoint = resolveTouchPoint(input.touchPoint);
  if (!touchPoint.ok) return { ok: false, error: touchPoint.error };

  const profile: StaffInput = {
    code: current.code,
    program: current.program,
    provider: current.provider,
    station: current.station,
    name: input.name.trim(),
    employeeNo: blankToNull(input.employeeNo),
    gender: input.gender,
    touchPoint: touchPoint.value,
    assignmentStatus: current.assignmentStatus ?? "Aktif",
    notes: current.notes,
    baseline: null,
  };
  const stored = checkBmiStaffProfile(profile);
  if (stored) return { ok: false, error: stored };

  try {
    const saved = await ports.saveStaff(profile);
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, name: profile.name, employeeNo: profile.employeeNo, touchPoint: profile.touchPoint, gender: input.gender };
  } catch {
    return { ok: false, error: { code: "unknown", message: "Koneksi terputus. Hasil penyimpanan belum bisa dipastikan." } };
  }
}
