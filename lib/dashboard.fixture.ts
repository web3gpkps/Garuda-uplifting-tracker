/*
 * A small Garuda workspace for dashboard tests: two stations, four dummy staff (no real
 * names), three action items. "Today" in the tests is Tue 20 Okt 2026 (week 3, BMI slot 1).
 */
import type { TrackerData } from './aggregate';
import { DEFAULT_SETTINGS } from './rules';

export const TODAY = '2026-10-20';

export function dashboardFixture(): TrackerData {
  const staff = (
    code: string,
    program: string,
    station: string,
    rolePlay: number,
    postTest: number,
    reportRemark: string,
    extra: Record<string, unknown> = {},
  ) => ({
    code,
    program,
    station,
    name: `SDM Uji ${code}`,
    gender: null,
    rolePlay,
    postTest,
    reportRemark,
    assignmentStatus: 'Aktif',
    bmiHasNote: true,
    ...extra,
  });
  return {
    settings: { ...DEFAULT_SETTINGS },
    stations: [
      { code: 'CGK', sort: 1 },
      { code: 'DPS', sort: 2 },
    ],
    staff: [
      staff('IULS-01', 'IULS', 'CGK', 90, 90, 'Passed'),
      // Absent from role play, but the report says Passed: Failed, "Beda – verifikasi", no remedial.
      staff('IULS-02', 'IULS', 'CGK', 0, 80, 'Passed'),
      staff('RUST-01', 'RUST', 'DPS', 80, 70, 'Failed', { bmiHasNote: false }),
      staff('RUST-02', 'RUST', 'DPS', 90, 90, 'Passed', { assignmentStatus: 'Ditarik dari layanan' }),
    ],
    weeklyScores: [
      { staffCode: 'IULS-01', week: 3, scoreGrooming: 90, scoreKnowledge: 95, scoreAttitude: 90, scoreCommunication: 93 },
      { staffCode: 'RUST-01', week: 3, scoreGrooming: 80, scoreKnowledge: 85, scoreAttitude: 80, scoreCommunication: 80 },
    ],
    bmiChecks: [
      // BMI 27,7: Obesitas.
      { staffCode: 'IULS-01', period: 1, checkDate: '2026-10-12', heightCm: 170, weightKg: 80 },
      // BMI 22,0: Normal; no BMI note, so the next check is a month later.
      { staffCode: 'RUST-01', period: 1, checkDate: '2026-10-12', heightCm: 165, weightKg: 60 },
    ],
    actionItems: [
      { code: 'GA-TL01', groupName: 'Coaching Frontliner', aspect: 'Product Knowledge', kind: 'Sekali',
        dueDate: '2026-10-15', status: 'On Progress', progress: 50 },
      { code: 'GA-TL02', groupName: 'Timeline Training', aspect: 'Remedial', kind: 'Sekali',
        dueDate: '2026-10-10', status: 'Selesai', progress: 100 },
      { code: 'GA-TL03', groupName: 'Evaluasi IULS & RUST', aspect: 'Remedial', kind: 'Sekali',
        dueDate: '2026-10-25', status: 'Belum Mulai', progress: 0 },
    ],
    remedials: [{ staffCode: 'RUST-01', action: 'Individual Coaching', rolePlay: 90, postTest: 90 }],
    replacements: [],
  };
}
