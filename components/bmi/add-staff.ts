import { checkProfile, type StaffInput } from "@/components/sdm/staff-input";
import type { StaffSaveResult } from "@/components/sdm/actions";
import type { BmiActionResult, BmiCheckInput, BmiProfileInput } from "./actions";
import type { LinkError } from "@/lib/workspace/errors";
import { TOUCH_POINTS } from "@/lib/rules";
import { COMMITMENT_MAX } from "@/lib/bmi-commitment";
import { bmiCheckName, isCoachingCheck } from "@/lib/bmi-periods";
import { isPlausibleDate } from "./format";
import { COACHING_LOCKED_HINT } from "./labels";

/** The select option that reveals the free-text field. It is never saved itself. */
export const OTHER_TOUCH_POINT = "Other";
/** Longest touch point text the database accepts (staff_touch_point_check, share_save_staff). */
export const TOUCH_POINT_MAX = 60;

/**
 * What the Tambah SDM form holds for Touch Point: the chosen option ("" for none, one of the
 * five standard values, or "Other") and the text typed when it is "Other". The server resolves it
 * again with resolveTouchPoint, so a request that skips the form is held to the same rules.
 */
export type TouchPointEntry = { choice: string; other: string };

export type AddBmiStaffInput = {
  name: string;
  employeeNo: string;
  /** Left out or null when no touch point is chosen (saved as empty). */
  touchPoint?: TouchPointEntry | null;
  gender: "L" | "P";
  bmiHasNote: boolean | null;
  bmiNote: string;
  /**
   * Only read for an owner or KPS access, which must pick one station. A single-station access
   * (link or account) always adds to its own verified station and ignores this.
   */
  station?: string | null;
  firstCheck: { period: number; checkDate: string; heightCm: number; weightKg: number; commitment?: string | null } | null;
  savedCode: string | null;
};

export type AddBmiStaffResult =
  | { ok: true; code: string }
  | { ok: false; error: LinkError; code?: string; uncertain?: boolean };

/** What the action knows about the verified access, loaded on the server (never from the form). */
export type AddBmiStaffWorkspace = {
  kind: "link" | "account" | "owner";
  scope: string;
  isKps: boolean;
  isOwner: boolean;
  /** Station codes of the workspace: the choices of an owner or KPS access. */
  stations: string[];
  /** Number of BMI periods in Parameter. */
  periods: number;
  staff: Array<{ code: string; name: string | null; employeeNo: string | null; station: string | null }>;
};

export type AddBmiStaffPorts = {
  load: () => Promise<AddBmiStaffWorkspace | null>;
  saveStaff: (input: StaffInput) => Promise<StaffSaveResult>;
  saveProfile: (input: BmiProfileInput) => Promise<BmiActionResult>;
  saveCheck: (input: BmiCheckInput) => Promise<BmiActionResult>;
};

function invalid(field: string, message: string): LinkError {
  return { code: "invalid_input", field, message };
}

/** True when the text has a line break, tab or other control code, which a one-line cell cannot show. */
function hasControlCode(text: string): boolean {
  return [...text].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

/** The text a touch point is saved as: free text of 1 to 60 characters, one line. null when fine. */
export function checkTouchPointText(text: string): LinkError | null {
  const value = text.trim();
  if (value === "") return invalid("touch_point_other", "Tulis touch point lainnya.");
  if (value.length > TOUCH_POINT_MAX) {
    return invalid("touch_point_other", `Touch point paling panjang ${TOUCH_POINT_MAX} karakter.`);
  }
  if (hasControlCode(value)) return invalid("touch_point_other", "Touch point ditulis dalam satu baris.");
  if (value.toLowerCase() === OTHER_TOUCH_POINT.toLowerCase()) {
    return invalid("touch_point_other", "Tulis nama touch point yang sebenarnya, bukan kata Other.");
  }
  return null;
}

/**
 * The touch point to save, from what the form holds. No choice is allowed (saved as null); a
 * standard value is saved as it is; "Other" needs the typed text, which is what gets saved
 * (trimmed, never the word "Other").
 */
export function resolveTouchPoint(
  entry: TouchPointEntry | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: LinkError } {
  if (entry === null || entry === undefined) return { ok: true, value: null };
  if (typeof entry !== "object" || typeof entry.choice !== "string" || (entry.other != null && typeof entry.other !== "string")) {
    return { ok: false, error: invalid("touch_point", "Pilih touch point dari daftar.") };
  }
  if (entry.choice === "") return { ok: true, value: null };
  if ((TOUCH_POINTS as readonly string[]).includes(entry.choice)) return { ok: true, value: entry.choice };
  if (entry.choice !== OTHER_TOUCH_POINT) {
    return { ok: false, error: invalid("touch_point", "Pilih touch point dari daftar.") };
  }
  const text = entry.other ?? "";
  const problem = checkTouchPointText(text);
  return problem ? { ok: false, error: problem } : { ok: true, value: text.trim() };
}

/**
 * The profile check for a staff member added from Cek BMI. Same as Master SDM's, except that the
 * touch point may be free text up to 60 characters (the database accepts it since the BMI periods
 * migration); components/sdm/staff-input.ts still holds Data SDM to its list.
 */
export function checkBmiStaffProfile(profile: StaffInput): LinkError | null {
  const touchPoint = typeof profile.touchPoint === "string" ? profile.touchPoint.trim() : "";
  if (touchPoint.length > TOUCH_POINT_MAX || hasControlCode(touchPoint)) {
    return invalid("touch_point", `Touch point paling panjang ${TOUCH_POINT_MAX} karakter, dalam satu baris.`);
  }
  return checkProfile({ ...profile, touchPoint: null });
}

/**
 * The station a new SDM goes to. A single-station access (link or account) gets its own
 * verified scope; an owner or KPS access must name one of the workspace's stations.
 */
export function resolveStation(
  workspace: Pick<AddBmiStaffWorkspace, "scope" | "isKps" | "isOwner" | "stations">,
  requested: string | null | undefined,
): { ok: true; station: string } | { ok: false; error: LinkError } {
  if (!workspace.isKps && !workspace.isOwner) return { ok: true, station: workspace.scope };
  const code = typeof requested === "string" ? requested.trim() : "";
  if (code && workspace.stations.includes(code)) return { ok: true, station: code };
  return { ok: false, error: invalid("station", "Pilih stasiun untuk SDM ini.") };
}

/** `periods` is the number of checks in Parameter (settings.bmiPeriods). */
export function checkAddBmiStaff(input: AddBmiStaffInput, periods: number): LinkError | null {
  if (!input || typeof input !== "object" || typeof input.name !== "string") {
    return invalid("name", "Isian tidak lengkap.");
  }
  if (typeof input.employeeNo !== "string" || input.employeeNo.trim().length > 50) {
    return invalid("employee_no", "Nomor pegawai paling panjang 50 karakter.");
  }
  const touchPoint = resolveTouchPoint(input.touchPoint);
  if (!touchPoint.ok) return touchPoint.error;
  if (input.gender !== "L" && input.gender !== "P") return invalid("gender", "Pilih L atau P.");
  if (typeof input.bmiHasNote !== "boolean") return invalid("bmi_has_note", "Pilih Ya atau Tidak.");
  if (typeof input.bmiNote !== "string" || input.bmiNote.length > 2000) {
    return invalid("bmi_note", "Catatan paling panjang 2000 karakter.");
  }
  if (input.savedCode !== null && (typeof input.savedCode !== "string" || !input.savedCode.trim())) {
    return invalid("staff_code", "ID SDM tidak valid.");
  }
  const problem = checkBmiStaffProfile(staffInput(input, ""));
  if (problem) return problem;
  if (input.firstCheck !== null) {
    const check = input.firstCheck;
    if (check && isCoachingCheck(check.period)) return invalid("period", COACHING_LOCKED_HINT);
    if (!check || !Number.isInteger(check.period) || check.period < 2 || check.period > periods) {
      return invalid("period", `Pilih ${bmiCheckName(2)} sampai ${bmiCheckName(periods)}.`);
    }
    if (!check || typeof check.checkDate !== "string" || !isPlausibleDate(check.checkDate)) {
      return invalid("check_date", "Tanggal cek tidak valid.");
    }
    if (!Number.isFinite(check.heightCm) || check.heightCm < 120 || check.heightCm > 210) {
      return invalid("height_cm", "Tinggi 120 sampai 210 cm.");
    }
    if (!Number.isFinite(check.weightKg) || check.weightKg < 30 || check.weightKg > 200) {
      return invalid("weight_kg", "Berat 30 sampai 200 kg.");
    }
    if (Math.round(check.heightCm * 10) / 10 !== check.heightCm) {
      return invalid("height_cm", "Cukup satu angka di belakang koma.");
    }
    if (Math.round(check.weightKg * 10) / 10 !== check.weightKg) {
      return invalid("weight_kg", "Cukup satu angka di belakang koma.");
    }
    const commitment = check.commitment ?? null;
    if (commitment !== null && (typeof commitment !== "string" || commitment.trim().length > COMMITMENT_MAX)) {
      return invalid("commitment", `Komitmen/Target paling panjang ${COMMITMENT_MAX} karakter.`);
    }
  }
  return null;
}

function staffInput(input: AddBmiStaffInput, station: string): StaffInput {
  const touchPoint = resolveTouchPoint(input.touchPoint);
  return {
    code: null,
    name: input.name.trim(),
    program: null,
    gender: input.gender,
    station,
    provider: null,
    employeeNo: input.employeeNo.trim() || null,
    touchPoint: touchPoint.ok ? touchPoint.value : null,
    assignmentStatus: "Aktif",
    notes: null,
    baseline: null,
  };
}

export async function addBmiStaff(input: AddBmiStaffInput, ports: AddBmiStaffPorts): Promise<AddBmiStaffResult> {
  const workspace = await ports.load();
  if (!workspace) {
    return {
      ok: false,
      error: { code: "unauthorized", message: "Akses ini tidak bisa diperiksa. Muat ulang halaman, lalu coba lagi." },
    };
  }
  const problem = checkAddBmiStaff(input, workspace.periods);
  if (problem) return { ok: false, error: problem };
  const target = resolveStation(workspace, input.station);
  if (!target.ok) return { ok: false, error: target.error };
  const station = target.station;

  let code = input.savedCode ?? undefined;
  if (code) {
    const saved = workspace.staff.find((staff) => staff.code === code && staff.station === station);
    if (!saved || saved.name !== input.name.trim() || (saved.employeeNo ?? "") !== input.employeeNo.trim()) {
      return { ok: false, error: { code: "out_of_scope", message: "Data SDM tidak sesuai. Muat ulang halaman." } };
    }
  }
  try {
    if (!code) {
      const staff = await ports.saveStaff(staffInput(input, station));
      if (!staff.ok) return { ok: false, error: staff.error };
      code = staff.code;
      if (!code) throw new Error("missing saved code");
    }
    const profile = await ports.saveProfile({
      staffCode: code,
      gender: input.gender,
      bmiHasNote: input.bmiHasNote,
      bmiNote: input.bmiNote.trim() || null,
    });
    if (!profile.ok) return { ok: false, error: profile.error, code };
    if (input.firstCheck) {
      const check = await ports.saveCheck({ staffCode: code, ...input.firstCheck });
      if (!check.ok) return { ok: false, error: check.error, code };
    }
    return { ok: true, code };
  } catch {
    return {
      ok: false,
      code,
      uncertain: !code,
      error: { code: "unknown", message: "Koneksi terputus. Hasil penyimpanan belum bisa dipastikan." },
    };
  }
}
