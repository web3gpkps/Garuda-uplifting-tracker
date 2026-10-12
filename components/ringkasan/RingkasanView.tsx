import Link from "next/link";
import type { ReactNode } from "react";
import { ACTION_GROUPS, ASPECTS, PROGRAMS } from "@/lib/rules";
import { formatHariTanggal } from "@/lib/dates";
import { dashboardSummary, sortComparison, type ComparisonSort } from "@/lib/dashboard";
import { hrefs, stationCodes, trackerData, type Workspace, type WorkspaceAccess } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { LinkSelect } from "@/components/grid/LinkSelect";
import { KpiStrip } from "@/components/dashboard/KpiTile";
import { ComparisonSortNav, StationComparison } from "@/components/dashboard/StationComparison";
import { AttentionPanel } from "./AttentionPanel";
import { ProgrammePosition } from "./ProgrammePosition";
import { StationCards } from "./StationCards";
import {
  ActionProgressTable,
  KpiTable,
  ProgramResultsTable,
  ReplacementOverviewTable,
  UnitTable,
} from "./DashboardTables";
import { buildAttention } from "./attention";

type RingkasanViewProps = {
  ws: Workspace;
  access: WorkspaceAccess;
  today: string;
  /** KPS station filter (?stasiun=CGK), already validated; null = all stations. */
  stationFilter: string | null;
  /** Station comparison order (?urut=). */
  sort: ComparisonSort;
};

const linkClass = "font-semibold text-brand underline underline-offset-2";

export function RingkasanView({ ws, access, today, stationFilter, sort }: RingkasanViewProps) {
  const links = hrefs(access);
  const allStations = stationCodes(ws);
  const station = ws.isKps ? stationFilter : ws.scope;
  const single = station !== null;
  const stations = station ? [station] : allStations;

  const data = trackerData(ws, ws.isKps ? stationFilter : null);
  const s = data.settings;
  const summary = dashboardSummary(data, today, stations);
  const { dash } = summary;
  const attention = buildAttention(data, summary.derived, stations, today, summary.week);
  const rows = sortComparison(summary.comparison, sort);
  const asOf = formatHariTanggal(today);
  const programRows = dash.programs.filter((r) => r.participants > 0 || !(PROGRAMS as readonly string[]).includes(r.key));

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Dashboard"
        context={ws.scopeLabel}
        description={`Posisi per ${asOf}: posisi program, KPI terhadap target, yang perlu ditangani, lalu perbandingan stasiun.`}
      >
        {ws.isKps ? (
          <LinkSelect
            label="Stasiun"
            current={stationFilter ?? "semua"}
            rememberStation
            options={[null, ...allStations].map((code) => ({
              value: code ?? "semua",
              label: code ?? "Semua stasiun",
              href: links.to("dashboard", { stasiun: code, urut: sort === "stasiun" ? null : sort }),
            }))}
          />
        ) : null}
      </PageHeader>

      <ProgrammePosition
        ws={ws}
        settings={s}
        today={today}
        links={links}
        firstSteps={{
          dueBeforeStart:
            summary.phase === "before"
              ? attention.dueItems.filter((d) => d.dueDate < s.week1Start).length
              : 0,
          failedNoRemedial: attention.failedNoRemedial.total,
          bmiNoteMissing: summary.derived.filter((d) => d.staff.name && d.staff.bmiHasNote == null).length,
        }}
      />

      <section aria-labelledby="target-kpi" className="flex flex-col gap-3">
        <div>
          <h2 id="target-kpi" className="text-lg font-semibold text-ink">
            KPI terhadap target{single ? ` · ${station}` : ""}
          </h2>
          <p className="text-sm text-ink-muted">
            Target dari PDF slide 15, dibanding baseline PDF. Angka nyata hari ini; pilih angka untuk membuka sheet-nya.
            Cakupan coaching dan baseline bersifat nasional.
          </p>
        </div>
        <KpiStrip tiles={summary.targets} links={links} label="KPI terhadap target" />
      </section>

      <section aria-labelledby="pekerjaan" className="flex flex-col gap-3">
        <div>
          <h2 id="pekerjaan" className="text-lg font-semibold text-ink">
            Pekerjaan berjalan
          </h2>
          <p className="text-sm text-ink-muted">
            {summary.phase === "before"
              ? "Program belum mulai, jadi skor mingguan belum dihitung. Tindak lanjut, remedial dan jadwal BMI sudah berjalan."
              : "Tindak lanjut, penilaian minggu ini, jadwal cek BMI dan remedial."}
          </p>
        </div>
        <KpiStrip tiles={summary.work} links={links} label="Pekerjaan berjalan" />
      </section>

      <AttentionPanel attention={attention} links={links} multiStation={!single} />

      <section aria-labelledby="hasil-program" className="flex flex-col gap-4">
        <div>
          <h2 id="hasil-program" className="text-lg font-semibold text-ink">
            Hasil training dan progres tindak lanjut
          </h2>
          <p className="text-sm text-ink-muted">
            Kelulusan IULS dan RUST sebelum dan sesudah remedial{single ? ` untuk ${station}` : ""}, lalu 15 butir tindak
            lanjut nasional per kelompok dan per aspek.
          </p>
        </div>
        <Panel
          headingLevel={3}
          title="Hasil per program"
          description="Baseline PDF = tingkat kelulusan peserta Gapura di laporan training (slide 18 dan 20)."
          padding="flush"
        >
          <ProgramResultsTable caption="Hasil training per program" rows={programRows} />
        </Panel>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Panel headingLevel={3} title="Tindak lanjut per kelompok" padding="flush">
            <ActionProgressTable
              caption="Progres tindak lanjut per kelompok"
              hrefFor={(key) => links.to("tindakLanjut", { kelompok: key })}
              rows={dash.actionByGroup.filter((r) => r.total > 0 || !(ACTION_GROUPS as readonly string[]).includes(r.key))}
            />
          </Panel>
          <Panel headingLevel={3} title="Tindak lanjut per aspek" padding="flush">
            <ActionProgressTable
              caption="Progres tindak lanjut per aspek"
              keyLabel="Aspek"
              hrefFor={(key) => links.to("tindakLanjut", { aspek: key })}
              rows={dash.actionByAspect.filter((r) => r.total > 0 || !(ASPECTS as readonly string[]).includes(r.key))}
            />
          </Panel>
        </div>
      </section>

      <section aria-labelledby="perbandingan" className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <div>
            <h2 id="perbandingan" className="text-lg font-semibold text-ink">
              {single ? `Stasiun ${station}` : `Perbandingan ${stations.length} stasiun`}
            </h2>
            <p className="text-sm text-ink-muted">
              {single
                ? "Posisi stasiun ini. Pilih angka untuk membuka sheet yang sudah disaring ke stasiun ini."
                : "Satu baris per stasiun, baris terakhir semua stasiun. Pilih kode stasiun untuk dashboard stasiun itu, atau angka untuk sheet yang sudah disaring."}
            </p>
          </div>
          {single ? null : (
            <ComparisonSortNav
              current={sort}
              hrefFor={(key) => links.to("dashboard", { urut: key === "stasiun" ? null : key }, "perbandingan")}
            />
          )}
        </div>
        <div className="hidden md:block">
          <div className="rounded-panel border border-line bg-surface">
            <StationComparison summary={summary} rows={rows} links={links} stationLinks={ws.isKps && !single} />
          </div>
        </div>
        <div className="md:hidden">
          <StationCards summary={summary} rows={rows} links={links} />
        </div>
      </section>

      <details className="group rounded-panel border border-line bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-panel px-4 py-3 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-lg font-semibold text-ink">Detail per bagian</span>
            <span className="block text-sm text-ink-muted">
              Bagian 1, 5 dan 6 dari sheet Dashboard di workbook, dengan rumus yang sama.
              {single ? ` Hanya ${station}.` : " Baris TOTAL menjumlahkan semua stasiun."}
            </span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-brand">
            <span className="group-open:hidden">Tampilkan</span>
            <span className="hidden group-open:inline">Sembunyikan</span>
          </span>
        </summary>

        <div className="flex flex-col gap-4 border-t border-line bg-paper p-3 sm:p-4">
          <Panel headingLevel={3} title="1. KPI slide 15: baseline, target dan aktual" padding="flush">
            <KpiTable caption="KPI slide 15" rows={dash.kpis} />
            <Footnotes>
              <p>
                Pass rate coaching tidak punya target eksplisit di PDF, jadi dibanding baseline nasional. Angka acuan
                lengkap ada di{" "}
                <Link href={links.acuan} className={linkClass}>
                  Acuan PDF
                </Link>
                .
              </p>
            </Footnotes>
          </Panel>

          <Panel headingLevel={3} title="5. Per stasiun" padding="flush">
            <UnitTable caption="Ringkasan per stasiun" rows={single ? dash.units.filter((u) => u.key === station) : dash.units} />
            <Footnotes>
              <p>
                Kenaikan = rata-rata skor terkini SDM yang sudah dinilai dikurangi rata-rata Final Result training (rumus
                workbook). Overweight + obesitas memakai cek BMI terakhir tiap SDM.
              </p>
            </Footnotes>
          </Panel>

          <Panel
            headingLevel={3}
            title={`6. Penggantian SDM (batas ${formatHariTanggal(s.replacementDeadline)})`}
            padding="flush"
            className="max-w-xl"
          >
            <ReplacementOverviewTable caption="Penggantian SDM" overview={dash.replacements} />
          </Panel>
        </div>
      </details>
    </div>
  );
}

function Footnotes({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-line px-4 py-3 text-xs text-ink-muted sm:px-6">{children}</div>
  );
}
