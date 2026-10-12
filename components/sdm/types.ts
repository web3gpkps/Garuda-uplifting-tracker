import type { Consistency, FailureCause, Remark } from "@/lib/rules";
import type { StaffInput } from "@/components/sdm/staff-input";
import type { StaffSaveResult } from "@/components/sdm/actions";
import type { DeleteStaffResult } from "@/components/sdm/delete-staff";

/** One Master SDM row as the SDM screen shows it (raw fields + lib/rules results). */
export type SdmRow = {
  code: string;
  program: string | null;
  provider: string | null;
  station: string;
  name: string;
  employeeNo: string | null;
  gender: string | null;
  touchPoint: string | null;
  rolePlay: number | null;
  postTest: number | null;
  reportRemark: string | null;
  assignmentStatus: string;
  feedback: string | null;
  notes: string | null;
  /** Master SDM L, N, O, P (lib/rules staffBaseline). */
  finalResult: number | null;
  status: Remark | null;
  consistency: Consistency | null;
  failureCause: FailureCause | null;
  /** "Diubah lewat tautan ini, 8 Okt 14.05". */
  changedLabel: string;
  /** Rows tied to this staff member (for the owner's delete confirmation). */
  weeklyScoreCount: number;
  bmiCheckCount: number;
  remedialCount: number;
  replacementCount: number;
};

export type SaveStaffAction = (accessKey: string, input: StaffInput) => Promise<StaffSaveResult>;
export type DeleteStaffAction = (accessKey: string, code: string) => Promise<DeleteStaffResult>;
