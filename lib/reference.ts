/**
 * Reference numbers from the PDF "People Development Overview – Garuda Indonesia, September 2026"
 * (sheets "Data Coaching" and "Data Training" of the workbook). Static content: never synced,
 * never edited in the app. Ratios are fractions 0..1. `slide` is the PDF slide number.
 */

export const REFERENCE_SOURCE = 'People Development Overview – PT Garuda Indonesia (Persero) Tbk, September 2026';

export const COACHING_SUMMARY = {
  participants: 795,
  stations: 32,
  period: '15 Juni 2026 – 31 Agustus 2026',
  passed: 617,
  failed: 178,
  passRate: 617 / 795,
  cgkFailed: 163,
  cgkFailedShare: 163 / 178,
  cgkPassRate: 0.533,
  cgkBoardingGatePassRate: 0.3846,
  cgkTransferDeskPassRate: 0.4865,
  outstationPassRate: '83,33% – 100%',
  targetCoverage: 812,
  coverage: 795 / 812,
  passingGrade: 85,
} as const;

export interface AreaRow {
  area: string;
  passRate: number;
  avgScore: number;
  insight: string;
}

/** Slide 6–7: pass rate and average score per touch point. */
export const AREA_RESULTS: readonly AreaRow[] = [
  { area: 'Customer Service', passRate: 0.9342, avgScore: 0.9518,
    insight: 'Readiness terbaik; pemahaman produk & standar grooming staf CS relatif matang dan konsisten.' },
  { area: 'Check-in Counter', passRate: 0.8526, avgScore: 0.9352,
    insight: 'Volume pemeriksaan terbesar (346 sesi); kelulusan di atas ambang 85%.' },
  { area: 'Baggage Service', passRate: 0.7451, avgScore: 0.9018,
    insight: 'Ketidaklulusan 25,49%: gap product knowledge Customer Care, alur ticketing dasar, GarudaMiles.' },
  { area: 'Boarding Gate', passRate: 0.6623, avgScore: 0.8852,
    insight: 'Penyumbang tidak lulus terbesar (77 sesi): aturan bagasi WTP/gate sweeping & GarudaMiles.' },
  { area: 'Transfer Desk', passRate: 0.5581, avgScore: 0.8807,
    insight: '19 dari 43 personel belum lulus (44,19%): refund/rebooking, GarudaMiles, bagasi WTP.' },
];

export interface GapRow {
  item: string;
  pct: number;
  aspect: string;
}

/** Slide 12: service gap per item. */
export const SERVICE_GAPS: readonly GapRow[] = [
  { item: 'BMI', pct: 0.3732, aspect: 'A. Standar BMI' },
  { item: 'GA Miles', pct: 0.1839, aspect: 'B. Product Knowledge' },
  { item: 'Refund/Rebook', pct: 0.1801, aspect: 'B. Product Knowledge' },
  { item: 'Piece Concept', pct: 0.1635, aspect: 'B. Product Knowledge' },
  { item: 'Penanganan Irregularity', pct: 0.143, aspect: 'B. Product Knowledge' },
  { item: 'Aksesoris', pct: 0.1364, aspect: 'C. Grooming & Aksesori' },
  { item: 'Kuku', pct: 0.1326, aspect: 'C. Grooming & Aksesori' },
  { item: 'Seragam', pct: 0.1274, aspect: 'C. Grooming & Aksesori' },
  { item: 'Senyum', pct: 0.1211, aspect: 'D. Standar Komunikasi' },
  { item: 'Salam', pct: 0.1171, aspect: 'D. Standar Komunikasi' },
  { item: 'Bahasa', pct: 0.1118, aspect: 'D. Standar Komunikasi' },
];

/** Slide 4–5: number of "Belum Sesuai" findings. */
export const ROOT_CAUSE_FINDINGS: ReadonlyArray<{ category: string; finding: string; count: string }> = [
  { category: 'Grooming & Appearance', finding: 'BMI Standard', count: '286' },
  { category: 'Grooming & Appearance', finding: 'Aksesori, kuku & kerapian seragam', count: '> 300' },
  { category: 'Product Knowledge', finding: 'Prosedur Refund, Rebooking & Customer Care Channels', count: '138' },
  { category: 'Product Knowledge', finding: 'Pengetahuan GarudaMiles (Tier, Benefit, Penukaran Poin)', count: '136' },
  { category: 'Product Knowledge', finding: 'Kebijakan Bagasi WTP (Weight-to-Piece)', count: '124' },
  { category: 'Product Knowledge', finding: 'Prosedur Irregularity (Delay/Cancellation Management)', count: '102' },
];

/** Slide 13–14 per aspect. */
export const ASPECT_FINDINGS: ReadonlyArray<{ aspect: string; focus: string; rootCause: string; impact: string }> = [
  { aspect: 'A. Standar BMI & Ketidaksesuaian Fisik',
    focus: 'Deviasi didominasi overweight; beberapa deviasi berat badan cukup jauh dari standar; perlu monitoring rutin.',
    rootCause: 'Belum optimalnya pemantauan kondisi fisik berkala melalui regular health tracking oleh manajemen lokal BO.',
    impact: 'Ketahanan fisik di area bermobilitas tinggi (Check-in & Boarding Gate) dan service presence frontliner.' },
  { aspect: 'B. Product Knowledge',
    focus: 'Refund/rebooking & Customer Care, GarudaMiles, flight irregularity, piece concept, kelas & lounge.',
    rootCause: 'Sosialisasi top-down & statis, acuan materi terbatas, kurang refreshment saat regulasi berubah.',
    impact: 'Frontliner ragu bertindak, durasi layanan lebih panjang, risiko misinformation yang memicu komplain.' },
  { aspect: 'C. Grooming & Aksesori',
    focus: 'Kebersihan & kuku, perhiasan & make-up, sepatu & kaos kaki, kondisi seragam, rambut/hijab & name tag.',
    rootCause: 'Self-inspection sebelum shift perlu diperkuat; visual checklist di area briefing belum optimal.',
    impact: 'Menurunkan keseragaman visual dan konsistensi brand image profesional.' },
  { aspect: 'D. Standar Komunikasi',
    focus: 'Bahasa & istilah sopan, sikap & tempo bicara, penyampaian terstruktur, konfirmasi & penutupan.',
    rootCause: 'Intensitas pelayanan saat peak hours membuat interaksi transaksional & kaku.',
    impact: 'Komunikasi kurang hangat & personal, berdampak langsung pada skor CSAT.' },
];

export interface ProgramResult {
  program: 'IULS' | 'RUST';
  participants: number;
  passed: number;
  failed: number;
  gapuraParticipants: number;
  gapuraPassed: number;
  gapuraFailed: number;
  best: { batch: string; period: string; passed: number; of: number };
  worst: { batch: string; period: string; passed: number; of: number };
}

/** Slide 17, 18, 20: Training Performance Report April – Agustus 2026. */
export const PROGRAM_RESULTS: Readonly<Record<'IULS' | 'RUST', ProgramResult>> = {
  IULS: {
    program: 'IULS', participants: 159, passed: 134, failed: 25,
    gapuraParticipants: 116, gapuraPassed: 97, gapuraFailed: 19,
    best: { batch: 'Batch 6', period: '21–22 Juli 2026', passed: 21, of: 21 },
    worst: { batch: 'Batch 3', period: '9–10 Juni 2026', passed: 8, of: 17 },
  },
  RUST: {
    program: 'RUST', participants: 199, passed: 95, failed: 104,
    gapuraParticipants: 155, gapuraPassed: 71, gapuraFailed: 84,
    best: { batch: 'Batch 5', period: '18 Juni 2026', passed: 22, of: 22 },
    worst: { batch: 'Batch 6', period: '4 Juni 2026', passed: 1, of: 18 },
  },
};

/** Slide 23–24: participants who did not pass, per station (the charts do not list every station). */
export const FAILED_BY_STATION: ReadonlyArray<{ station: string; iuls: number | null; rust: number | null }> = [
  { station: 'CGK', iuls: 2, rust: 19 }, { station: 'DPS', iuls: 1, rust: 10 }, { station: 'BTH', iuls: null, rust: 7 },
  { station: 'BDJ', iuls: 2, rust: 4 }, { station: 'DJJ', iuls: 1, rust: 4 }, { station: 'KNO', iuls: 2, rust: 2 },
  { station: 'BTJ', iuls: null, rust: 4 }, { station: 'PNK', iuls: null, rust: 4 }, { station: 'SRG', iuls: null, rust: 4 },
  { station: 'AAP', iuls: 3, rust: null }, { station: 'DJB', iuls: null, rust: 3 }, { station: 'LBJ', iuls: null, rust: 3 },
  { station: 'PLM', iuls: 2, rust: 1 }, { station: 'UPG', iuls: 1, rust: 1 }, { station: 'SUB', iuls: null, rust: 2 },
  { station: 'MKQ', iuls: null, rust: 2 }, { station: 'LOP', iuls: null, rust: 2 }, { station: 'PDG', iuls: null, rust: 2 },
  { station: 'BPN', iuls: 1, rust: null }, { station: 'MDC', iuls: 1, rust: null }, { station: 'SOC', iuls: null, rust: 1 },
];

/** Slide 23–24: participants who did not pass, per provider. */
export const FAILED_BY_PROVIDER: ReadonlyArray<{ provider: string; iuls: number | null; rust: number | null }> = [
  { provider: 'Gapura', iuls: 19, rust: 85 }, { provider: 'ACS', iuls: 3, rust: null },
  { provider: 'DPP', iuls: 2, rust: 3 }, { provider: 'ATS', iuls: 1, rust: null },
  { provider: 'GSA', iuls: null, rust: 7 }, { provider: 'Angkasa', iuls: null, rust: 5 },
  { provider: 'Arkana', iuls: null, rust: 2 }, { provider: 'Aero Globe', iuls: null, rust: 1 },
  { provider: 'Aerofood', iuls: null, rust: 1 },
];

/** Slide 25–26: what decided the evaluation results. */
export const EVALUATION_FACTORS: ReadonlyArray<{ kind: string; factor: string; detail: string }> = [
  { kind: 'Penyebab ketidaklulusan', factor: 'Kendala operasional & kehadiran',
    detail: 'Mayoritas staf Failed masih bertugas saat jadwal training, sehingga absen di sesi role play / post-test.' },
  { kind: 'Penyebab ketidaklulusan', factor: 'Performa role play belum optimal',
    detail: 'Seluruh tahapan diikuti, tetapi skor role play belum memenuhi passing grade.' },
  { kind: 'Keunggulan', factor: 'Pengendalian emosi & ketenangan',
    detail: 'Calm under pressure, sabar dan terampil mengendalikan emosi saat menangani keluhan.' },
  { kind: 'Keunggulan', factor: 'Sikap dasar & etika layanan',
    detail: 'Vocal ramah, eye contact & eye levelling, gestur lima jari.' },
  { kind: 'Keunggulan', factor: 'Pendekatan solutif & inisiatif',
    detail: 'Mendengar proaktif, konfirmasi opsi solusi, bantuan khusus (pengawalan CS & kursi roda).' },
  { kind: 'Gap', factor: 'Kemampuan bahasa',
    detail: 'Hindari "OK/Udah" → "Baik/Sudah/Berkenan/Berikan"; gunakan "Kami" saat mewakili perusahaan.' },
  { kind: 'Gap', factor: 'Kelengkapan layanan',
    detail: 'Nama & Salam Garuda belum konsisten; magic words dan closing belum seragam.' },
  { kind: 'Gap', factor: 'Istilah internal',
    detail: 'Jargon (BHS, Recon, GFF, On Schedule) membingungkan penumpang; utamakan istilah publik.' },
  { kind: 'Gap', factor: 'Penanganan keluhan',
    detail: 'Permohonan maaf belum tegas dan belum mencantumkan identitas resmi; tunjukkan ownership.' },
];

/** Known inconsistencies inside the PDF, shown next to the numbers instead of silently fixed. */
export const DATA_NOTES: readonly string[] = [
  'PDF hanya mencantumkan sebagian daftar peserta: IULS 6 dari 116 peserta Gapura (slide 19) dan RUST 18 dari 155 (slide 21–22).',
  'Final Result = 40% Role Play + 60% Post-Test, disimpulkan dari 24 baris peserta (semuanya cocok); tidak tertulis eksplisit di PDF.',
  'RUST: teks ringkasan slide 17 menyebut 48,2%, angka besar 47,7% (95/199).',
  'RUST peserta Gapura tidak lulus: 84 (slide 20) vs 85 (grafik provider slide 24).',
  'Grafik per station (16 IULS, 75 RUST) lebih kecil dari total per provider (25, 104): tidak semua station ditampilkan.',
  'Slide 12: gap Kuku 13,26% di grafik, 12,26% di teks.',
];
