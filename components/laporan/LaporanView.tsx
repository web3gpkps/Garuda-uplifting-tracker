import Link from "next/link";
import type { ReactNode } from "react";
import { SEMUA, TOTAL, weeklyReport } from "@/lib/aggregate";
import { formatHariTanggal, formatTanggal } from "@/lib/dates";
import { formatPercent, phaseOf } from "@/lib/dashboard";
import { weekStart } from "@/lib/rules";
import { hrefs, lastChangedLabel, stationCodes, trackerData, type Workspace, type WorkspaceAccess } from "@/lib/workspace";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-info";
import { Logo } from "@/components/shell/Logo";
import { WeekRail } from "@/components/shell/WeekRail";
import { PageHeader } from "@/components/ui/PageHeader";
import { LinkSelect } from "@/components/grid/LinkSelect";
import { EmptyState } from "@/components/ui/States";
import { ActionProgressTable } from "@/components/ringkasan/DashboardTables";
import { saveWeeklyFindings } from "./actions";
import { FindingsEditor, PrintedFindings } from "./FindingsEditor";
import { PrintButton } from "./PrintButton";
import { AspectTable, BmiSlotTable, TrendTable, WeeklyPerformanceTable } from "./ReportTables";
import { TrendChart } from "./TrendChart";

const linkClass = "font-semibold text-brand underline underline-offset-2";

/** Jump links for the screen version (the printed report reads top to bottom). */
const SECTIONS = [
  { id: "bagian-a", letter: "A", label: "Performa" },
  { id: "bagian-a2", letter: "A2", label: "Aspek" },
  { id: "bagian-b", letter: "B", label: "Tindak lanjut" },
  { id: "bagian-c", letter: "C", label: "BMI" },
  { id: "bagian-d", letter: "D", label: "Tren" },
  { id: "bagian-e", letter: "E", label: "Temuan" },
] as const;

export function LaporanView({
  ws,
  access,
  today,
  week,
  station,
}: {
  ws: Workspace;
  access: WorkspaceAccess;
  today: string;
  week: number;
  /** KPS / owner: one station's report (?stasiun=CGK); null = all stations. */
  station: string | null;
}) {
  const links = hrefs(access);
  const data = trackerData(ws, station);
  const s = data.settings;
  const single = !ws.isKps || station !== null;
  /** KPS or the owner looking at one station: that station's findings are read-only here. */
  const kpsStationView = ws.isKps && station !== null;
  const scopeName = station ? `Stasiun ${station}` : single ? ws.scopeLabel : "Semua stasiun";
  const weekHref = (w: number) => links.to("laporan", { minggu: w, stasiun: station });
  const report = weeklyReport(data, week, today);
  const phase = phaseOf(s, today);

  const totalPerf = report.performance.find((r) => r.key === TOTAL);
  const totalBmi = report.bmi.find((r) => r.key === TOTAL);
  const programTrend = report.trend.filter((r) => r.key !== SEMUA);
  const semua = report.trend.find((r) => r.key === SEMUA) ?? null;
  const trendEmpty = report.trend.every((r) => r.weeks.every((v) => v === null));
  const weekNotStarted = weekStart(week, s) > today;
  const noScores = totalPerf !== undefined && totalPerf.assessed === 0;

  const own = ws.weeklyReports.find((r) => r.week === week && r.scope === ws.scope) ?? null;
  const viewed = station ? (ws.weeklyReports.find((r) => r.week === week && r.scope === station) ?? null) : null;
  const stationFindings =
    ws.isKps && !station
      ? stationCodes(ws).map((code) => ({
          code,
          row: ws.weeklyReports.find((r) => r.week === week && r.scope === code) ?? null,
        }))
      : [];
  const filledFindings = stationFindings.filter((f) => f.row?.findings);
  const emptyFindings = stationFindings.filter((f) => !f.row?.findings).map((f) => f.code);

  const notScoredNote = weekNotStarted ? (
    <>Minggu ke-{week} belum berjalan (mulai {formatHariTanggal(weekStart(week, s))}).</>
  ) : noScores ? (
    <>
      Belum ada skor untuk Minggu ke-{week}.{" "}
      <Link href={links.to("performa", { minggu: week, stasiun: station })} className={linkClass} data-print="hide">
        Isi skor Minggu ke-{week}
      </Link>
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <div className="hidden print:flex print:items-center print:gap-4">
        <Logo height={48} />
        <div className="border-l border-line pl-4">
          <p className="text-sm font-semibold text-ink">{APP_NAME}</p>
          <p className="text-xs text-ink-muted">{APP_TAGLINE}</p>
        </div>
      </div>

      <PageHeader
        title={`Laporan Mingguan, Minggu ke-${week}`}
        context={scopeName}
        description="Hasil coaching frontliner, training IULS & RUST, cek BMI dan tindak lanjut People Development."
        actions={<PrintButton label={station ? `Cetak laporan ${station}` : undefined} />}
      >
        {ws.isKps ? (
          <LinkSelect
            label="Laporan untuk stasiun"
            current={station ?? "semua"}
            rememberStation
            options={[null, ...stationCodes(ws)].map((code) => ({
              value: code ?? "semua",
              label: code ?? "Semua stasiun",
              href: links.to("laporan", { minggu: week, stasiun: code }),
            }))}
          />
        ) : null}
        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr] print:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-ink-muted">Periode</dt>
          <dd className="font-semibold text-ink">
            {formatTanggal(report.periodStart)} s.d. {formatTanggal(report.periodEnd)}
          </dd>
          <dt className="text-ink-muted">Slot cek BMI terkait</dt>
          <dd className="text-ink">
            Cek ke-{report.bmiPeriod} (rencana {formatTanggal(report.bmiPlannedDate)})
          </dd>
          <dt className="text-ink-muted">Lingkup</dt>
          <dd className="text-ink">
            {kpsStationView ? `Stasiun ${station} (dicetak KPS)` : single ? ws.scopeLabel : "Semua stasiun (KPS)"}
          </dd>
          <dt className="text-ink-muted">Posisi tindak lanjut per</dt>
          <dd className="text-ink">{formatTanggal(report.asOf)}</dd>
        </dl>
      </PageHeader>

      <section aria-labelledby="pilih-minggu" className="flex flex-col gap-2" data-print="hide">
        <h2 id="pilih-minggu" className="section-label">
          Pilih minggu laporan. Semua bagian di bawah mengikuti minggu yang dipilih, kecuali tindak lanjut (posisi hari
          ini).
        </h2>
        {ws.schedule ? (
          <WeekRail
            settings={ws.schedule}
            today={today}
            selectedWeek={week}
            hrefForWeek={weekHref}
            showSummary={false}
            label="Minggu laporan"
          />
        ) : null}
      </section>

      <nav
        aria-label="Bagian laporan"
        data-print="hide"
        className="flex flex-wrap items-center gap-2 md:sticky md:top-0 md:z-10 md:-mx-2 md:bg-paper md:px-2 md:py-2"
      >
        <span className="section-label mr-1">Lompat ke</span>
        {SECTIONS.map((sec) => (
          <a
            key={sec.id}
            href={`#${sec.id}`}
            className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-3 text-sm text-ink transition-colors duration-150 hover:bg-neutral-tint sm:min-h-9"
          >
            <span className="font-semibold">{sec.letter}</span>
            <span className="ml-1.5">{sec.label}</span>
          </a>
        ))}
      </nav>

      {phase === "before" ? (
        <p className="text-sm text-ink" data-print="hide">
          Program belum mulai: Minggu ke-1 dimulai {formatHariTanggal(s.week1Start)}. Bagian A, A2, C dan D terisi setelah
          skor coaching dan cek BMI pertama dicatat; bagian B sudah berisi posisi tindak lanjut hari ini.
        </p>
      ) : null}

      <article
        aria-label={`Isi laporan Minggu ke-${week}`}
        className="flex flex-col gap-8 rounded-panel border border-line bg-surface p-4 sm:p-6 print:gap-5 print:border-0 print:p-0"
      >
        <Section
          id="bagian-a"
          title="A. Performa coaching minggu ini"
          subtitle={`Rata-rata skor 4 aspek, skala 0 sampai 100. Lulus = rata-rata ≥ ${s.passGrade}.`}
          note={notScoredNote}
          footnote="* Kenaikan vs baseline = rata-rata minggu ini (SDM yang dinilai) dikurangi rata-rata Final Result training semua SDM, sesuai rumus workbook."
        >
          <TableFrame>
            <WeeklyPerformanceTable caption={`Performa coaching Minggu ke-${week}`} rows={report.performance} />
          </TableFrame>
        </Section>

        <Section
          id="bagian-a2"
          title="A2. Rata-rata per aspek terhadap target"
          subtitle={`Target PDF slide 15: Product Knowledge > ${formatPercent(s.targetKnowledge)}, Interactive Communicating > ${formatPercent(s.targetInteractive)} (skor ÷ 100).`}
          note={noScores && !weekNotStarted ? <>Belum ada skor aspek untuk Minggu ke-{week}.</> : null}
        >
          <TableFrame>
            <AspectTable
              caption={`Rata-rata aspek Minggu ke-${week}`}
              rows={report.aspects}
              targetKnowledge={s.targetKnowledge}
              targetInteractive={s.targetInteractive}
            />
          </TableFrame>
        </Section>

        <Section
          id="bagian-b"
          title="B. Progres tindak lanjut"
          subtitle={`15 butir nasional per kelompok, posisi per ${formatTanggal(report.asOf)}; tidak bergantung pada minggu yang dipilih.`}
        >
          <TableFrame>
            <ActionProgressTable
              caption="Progres tindak lanjut per kelompok"
              rows={report.actionProgress}
              hrefFor={(key) => links.to("tindakLanjut", { kelompok: key })}
            />
          </TableFrame>
        </Section>

        <Section
          id="bagian-c"
          title="C. Cek BMI, slot terkait"
          subtitle={`Cek ke-${report.bmiPeriod}, rencana ${formatHariTanggal(report.bmiPlannedDate)}. Target overweight + obesitas < ${formatPercent(s.targetOverweightMax)} dalam ${s.targetOverweightMonths} bulan.`}
          note={
            totalBmi && totalBmi.checked === 0 ? (
              <>
                Belum ada cek BMI slot {report.bmiPeriod} yang tercatat.{" "}
                {report.bmiPlannedDate <= today ? (
                  <Link
                    href={links.to("bmi", { periode: report.bmiPeriod, stasiun: station })}
                    className={linkClass}
                    data-print="hide"
                  >
                    Catat cek BMI slot {report.bmiPeriod}
                  </Link>
                ) : null}
              </>
            ) : null
          }
          footnote="Terlambat cek memakai jadwal tiap SDM: 2 mingguan bila ada catatan BMI, bulanan bila tidak."
        >
          <TableFrame>
            <BmiSlotTable caption={`Cek BMI slot ${report.bmiPeriod}`} rows={report.bmi} />
          </TableFrame>
        </Section>

        <Section
          id="bagian-d"
          title={`D. Tren rata-rata skor coaching, Mg 1 sampai ${s.weeks}`}
          subtitle="Apakah rata-rata skor tiap program naik dari minggu ke minggu?"
        >
          {trendEmpty ? (
            <EmptyState
              title="Belum ada skor mingguan, jadi tren belum bisa digambar"
              layout="inline"
              className="rounded-control bg-neutral-tint px-3 print:bg-transparent print:px-0"
            >
              Grafik dan tabel tren muncul setelah skor coaching Minggu ke-1 diisi di Log Performa
              {phase === "before" ? ` (mulai ${formatHariTanggal(s.week1Start)})` : ""}.
            </EmptyState>
          ) : (
            <>
              <TrendChart rows={programTrend} reference={semua} passGrade={s.passGrade} />
              <TableFrame>
                <TrendTable caption="Rata-rata skor coaching per program per minggu" rows={report.trend} selectedWeek={week} />
              </TableFrame>
            </>
          )}
        </Section>

        <div className="flex flex-col gap-8 print:break-inside-avoid print:gap-6">
          <Section id="bagian-e" title="E. Temuan, kendala dan rencana minggu depan" subtitle="Diisi PIC stasiun atau KPS.">
            {kpsStationView ? (
              <div className="flex flex-col gap-2">
                {viewed?.findings ? (
                  <>
                    <p className="text-sm whitespace-pre-wrap text-ink">{viewed.findings}</p>
                    <p className="text-xs text-ink-muted" data-print="hide">
                      {lastChangedLabel(viewed, ws)}. Hanya baca: temuan ini diisi lewat tautan {station}.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="rounded-control bg-neutral-tint px-3 py-2 text-sm text-ink" data-print="hide">
                      Stasiun {station} belum mengisi temuan Minggu ke-{week}. Temuan diisi lewat tautan {station}; di
                      kertas bagian ini tercetak sebagai baris kosong untuk ditulis tangan.
                    </p>
                    <PrintedFindings text="" />
                  </>
                )}
                <p className="text-xs text-ink-muted" data-print="hide">
                  Temuan KPS diisi di{" "}
                  <Link href={links.to("laporan", { minggu: week })} className={linkClass}>
                    laporan semua stasiun
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <FindingsEditor
                key={week}
                action={saveWeeklyFindings.bind(null, access.key, week)}
                week={week}
                scopeName={single ? ws.scopeLabel : "KPS"}
                printLabel={single ? undefined : "Temuan KPS"}
                initialFindings={own?.findings ?? ""}
                lastChanged={own ? lastChangedLabel(own, ws) : null}
              />
            )}
            {stationFindings.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-ink">Temuan stasiun Minggu ke-{week} (hanya baca)</h3>
                {filledFindings.length > 0 ? (
                  <dl className="flex flex-col divide-y divide-line rounded-control border border-line">
                    {filledFindings.map(({ code, row }) => (
                      <div key={code} className="grid gap-1 px-3 py-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-sm font-semibold text-ink">{code}</dt>
                        <dd className="text-sm">
                          <p className="whitespace-pre-wrap text-ink">{row!.findings}</p>
                          <p className="mt-1 text-xs text-ink-muted" data-print="hide">
                            {lastChangedLabel(row!, ws)}
                          </p>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {emptyFindings.length > 0 ? (
                  <p className="text-sm text-ink-muted">
                    Belum mengisi temuan ({emptyFindings.length} stasiun): {emptyFindings.join(", ")}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Section>

          <SignatureBlock />
        </div>
      </article>
    </div>
  );
}

function Section({
  id,
  title,
  subtitle,
  note,
  footnote,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  note?: ReactNode;
  footnote?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-judul`}
      className="flex min-w-0 scroll-mt-4 flex-col gap-3 md:scroll-mt-20 print:break-inside-avoid"
    >
      <div>
        <h2 id={`${id}-judul`} className="text-lg font-semibold text-ink print:text-base">
          {title}
        </h2>
        {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {note ? (
        <p className="rounded-control bg-neutral-tint px-3 py-2 text-sm text-ink print:bg-transparent print:p-0">{note}</p>
      ) : null}
      {children}
      {footnote ? <p className="text-xs text-ink-muted">{footnote}</p> : null}
    </section>
  );
}

/** Bordered table; on paper the rows tighten so a section fits beside the next one. */
function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-control border border-line print:[&_td]:h-6 print:[&_td]:py-0.5 print:[&_th]:h-6 print:[&_th]:py-0.5">
      {children}
    </div>
  );
}

/** Two signatures with room to sign, as in the workbook. */
function SignatureBlock() {
  return (
    <div className="grid gap-8 pt-2 text-sm text-ink sm:grid-cols-2 print:grid-cols-2 print:break-inside-avoid">
      {[
        { lead: "Disusun oleh,", role: "PIC People Development Stasiun / KPS" },
        { lead: "Mengetahui,", role: "General Manager Cabang" },
      ].map(({ lead, role }) => (
        <div key={role} className="flex flex-col">
          <p>{lead}</p>
          <span aria-hidden="true" className="h-16" />
          <p aria-label="Tanda tangan dan nama">( ........................................ )</p>
          <p className="font-semibold">{role}</p>
        </div>
      ))}
    </div>
  );
}
