import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SETTINGS as S,
  actionFlag,
  bmi,
  bmiCategory,
  bmiCheckDate,
  bmiPeriodForWeek,
  bmiScheduleStatus,
  bmiSummary,
  camelize,
  coachingAvg,
  coachingStatus,
  consistency,
  daysLeft,
  deltaVsBaseline,
  excelRound,
  failureCause,
  finalResult,
  nextBmiCheck,
  overweightTargetDate,
  passStatus,
  remedialResult,
  replacementPass,
  replacementTimeliness,
  staffBaseline,
  staffRekap,
  weekEnd,
  weekOfDate,
  weekStart,
  type WeeklyScoreRow,
} from './rules';
import { addMonths } from './dates';

const score = (staffCode: string, week: number, ...s: Array<number | null>): WeeklyScoreRow => ({
  staffCode,
  week,
  scoreGrooming: s[0] ?? null,
  scoreKnowledge: s[1] ?? null,
  scoreAttitude: s[2] ?? null,
  scoreCommunication: s[3] ?? null,
});

describe('training baseline (Master SDM)', () => {
  test('final result = 40% role play + 60% post-test, matching every row of the PDF', () => {
    // [role play, post-test, final] from PDF slides 19, 21, 22.
    const pdf: Array<[number, number, number]> = [
      [0, 92, 55.2], [78, 88, 84], [0, 84, 50.4], [88, 100, 95.2], [80, 96, 89.6], [88, 92, 90.4],
      [80, 92, 87.2], [82, 84, 83.2], [70, 88, 80.8], [82, 80, 80.8], [80, 80, 80], [72, 72, 72],
      [0, 64, 38.4], [80, 88, 84.8], [80, 84, 82.4], [0, 88, 52.8], [76, 80, 78.4],
    ];
    for (const [rp, pt, f] of pdf) expect(finalResult(rp, pt, S)).toBe(f);
    expect(finalResult(null, 90, S)).toBeNull();
  });

  test('status, consistency and failure cause', () => {
    expect(passStatus(85, S)).toBe('Passed');
    expect(passStatus(84.9, S)).toBe('Failed');
    expect(passStatus(null, S)).toBeNull();
    expect(consistency('failed', 'Failed')).toBe('Sama');
    expect(consistency('Passed', 'Failed')).toBe('Beda – verifikasi');
    expect(consistency(null, 'Failed')).toBeNull();
    expect(failureCause(0, 92, 'Failed', S)).toBe('Kendala operasional & kehadiran (absen role play)');
    expect(failureCause(72, 72, 'Failed', S)).toBe('Role play & post-test belum optimal');
    expect(failureCause(70, 88, 'Failed', S)).toBe('Performa role play belum optimal');
    expect(failureCause(88, 100, 'Passed', S)).toBeNull();
    expect(staffBaseline({ rolePlay: 78, postTest: 88, reportRemark: 'Failed' }, S)).toEqual({
      finalResult: 84,
      status: 'Failed',
      consistency: 'Sama',
      failureCause: 'Performa role play belum optimal',
    });
  });
});

describe('weekly coaching (Log Performa, Rekap)', () => {
  test('average of the four aspects, status against the passing grade, delta', () => {
    expect(coachingAvg(score('A', 1, 90, 80, 88, 86))).toBe(86);
    expect(coachingAvg(score('A', 1, 90, null, 85, null))).toBe(87.5);
    expect(coachingAvg(score('A', 1))).toBeNull();
    expect(coachingStatus(85, S)).toBe('Lulus');
    expect(coachingStatus(84.99, S)).toBe('Belum Lulus');
    expect(deltaVsBaseline(86, 55.2)).toBe(30.8);
  });

  test('rekap takes the latest week and compares it with the final result', () => {
    const rows = [score('A', 1, 86, 86, 86, 86), score('A', 3, 90, 88, 90, 90), score('B', 2, 70, 70, 70, 70)];
    const r = staffRekap({ code: 'A', rolePlay: 0, postTest: 92 }, rows, S);
    expect(r.baseline).toBe(55.2);
    expect(r.weekly.slice(0, 3)).toEqual([86, null, 89.5]);
    expect(r.latest).toBe(89.5);
    expect(r.latestWeek).toBe(3);
    expect(r.gain).toBe(34.3);
    expect(r.weeksAssessed).toBe(2);
    expect(r.currentStatus).toBe('Lulus');
    expect(r.trend).toBe('▲ Naik');
  });

  test('weeks start on 5 Okt 2026', () => {
    expect(weekStart(2, S)).toBe('2026-10-12');
    expect(weekEnd(10, S)).toBe('2026-12-13');
    expect(weekOfDate('2026-10-12', S)).toBe(2);
    expect(weekOfDate('2026-10-04', S)).toBeNull();
  });
});

describe('BMI', () => {
  test('value and Kemenkes category', () => {
    expect(bmi(160, 68)).toBe(26.6);
    expect(bmiCategory(25, S)).toBe('Normal');
    expect(bmiCategory(25.1, S)).toBe('Overweight');
    expect(bmiCategory(27.1, S)).toBe('Obesitas');
    expect(bmiCategory(18.4, S)).toBe('Kurus');
  });

  test('slots every 14 days from 12 Okt; week 1 and 2 map to slot 1', () => {
    expect(bmiCheckDate(1, S)).toBe('2026-10-12');
    expect(bmiCheckDate(6, S)).toBe('2026-12-21');
    expect(bmiPeriodForWeek(1, S)).toBe(1);
    expect(bmiPeriodForWeek(3, S)).toBe(1);
    expect(bmiPeriodForWeek(4, S)).toBe(2);
    expect(bmiPeriodForWeek(10, S)).toBe(5);
  });

  test('next check: 2 weeks with a note, monthly without, first slot before any check', () => {
    expect(nextBmiCheck(null, true, S)).toBe('2026-10-12');
    expect(nextBmiCheck('2026-10-12', true, S)).toBe('2026-10-26');
    expect(nextBmiCheck('2026-10-12', null, S)).toBe('2026-10-26');
    expect(nextBmiCheck('2026-10-12', false, S)).toBe('2026-11-12');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(bmiScheduleStatus('2026-10-11', '2026-10-12')).toBe('Terlambat cek');
    expect(bmiScheduleStatus('2026-10-19', '2026-10-12')).toBe('Cek ≤ 7 hari');
    expect(bmiScheduleStatus('2026-10-20', '2026-10-12')).toBe('Terjadwal');
  });

  test('summary keeps the latest values and the weight change', () => {
    const s = bmiSummary(
      [
        { staffCode: 'A', period: 1, checkDate: '2026-10-12', heightCm: 160, weightKg: 68 },
        { staffCode: 'A', period: 2, checkDate: '2026-10-26', heightCm: 160, weightKg: 66 },
      ],
      true,
      S,
      '2026-10-27',
    );
    expect(s.checks).toBe(2);
    expect(s.latestBmi).toBe(25.8);
    expect(s.latestCategory).toBe('Overweight');
    expect(s.weightDelta).toBe(-2);
    expect(s.nextCheck).toBe('2026-11-09');
    expect(s.scheduleStatus).toBe('Terjadwal');
    expect(bmiSummary([], false, S, '2026-10-13').scheduleStatus).toBe('Terlambat cek');
  });
});

describe('Tindak Lanjut', () => {
  test('flags', () => {
    const today = '2026-10-12';
    expect(actionFlag({ dueDate: null, status: 'On Progress', kind: 'Rutin' }, today)).toBe('Batas waktu belum ditetapkan');
    expect(actionFlag({ dueDate: '2026-10-01', status: 'Selesai', kind: 'Sekali' }, today)).toBe('Selesai');
    expect(actionFlag({ dueDate: '2026-10-11', status: 'On Progress', kind: 'Sekali' }, today)).toBe('OVERDUE');
    expect(actionFlag({ dueDate: '2026-10-19', status: 'Belum Mulai', kind: 'Rutin' }, today)).toBe('Jatuh tempo ≤ 7 hari');
    expect(actionFlag({ dueDate: '2026-10-21', status: 'Belum Mulai', kind: 'Rutin' }, today)).toBe('Rutin – pantau');
    expect(actionFlag({ dueDate: '2026-10-21', status: 'Belum Mulai', kind: 'Sekali' }, today)).toBe('On Track');
    expect(daysLeft('2026-10-21', 'On Progress', today)).toBe(9);
    expect(daysLeft('2026-10-21', 'Selesai', today)).toBeNull();
    expect(overweightTargetDate(S)).toBe('2027-04-05');
  });
});

describe('Remedial and Penggantian', () => {
  test('remedial result', () => {
    expect(remedialResult({ action: null, rolePlay: null, postTest: null }, S)).toEqual({
      finalResult: null,
      status: 'Belum dijadwalkan',
    });
    expect(remedialResult({ action: 'Individual Coaching', rolePlay: null, postTest: null }, S).status).toBe('Menunggu hasil');
    expect(remedialResult({ action: 'Individual Coaching', rolePlay: 86, postTest: 88 }, S)).toEqual({
      finalResult: 87.2,
      status: 'Lulus',
    });
    expect(remedialResult({ action: 'Individual Coaching', rolePlay: 80, postTest: 84 }, S).status).toBe('Belum Lulus');
  });

  test('replacement pass and timeliness', () => {
    expect(replacementPass({ replacementName: null, postTest: 90, finalResult: 90 }, S)).toBeNull();
    expect(replacementPass({ replacementName: 'Dummy B', postTest: null, finalResult: 90 }, S)).toBe(
      'Belum training/dinilai',
    );
    expect(replacementPass({ replacementName: 'Dummy B', postTest: 92, finalResult: 88.8 }, S)).toBe('Lulus');
    expect(replacementPass({ replacementName: 'Dummy B', postTest: 84, finalResult: 88.8 }, S)).toBe('Belum Lulus');
    const r = { replacedName: 'Dummy A', effectiveOn: null };
    expect(replacementTimeliness(r, S, '2026-12-14')).toBe('Menunggu');
    expect(replacementTimeliness(r, S, '2026-12-15')).toBe('OVERDUE');
    expect(replacementTimeliness({ ...r, effectiveOn: '2026-12-20' }, S, '2026-12-15')).toBe('Lewat 14 Des');
  });
});

describe('primitives', () => {
  test('excel rounding and camelize', () => {
    expect(excelRound(18.45, 1)).toBe(18.5);
    expect(excelRound(-2.5)).toBe(-3);
    expect(camelize({ role_play: 1, week1_start: 'x', bmi_has_note: true })).toEqual({
      rolePlay: 1,
      week1Start: 'x',
      bmiHasNote: true,
    });
  });
});
