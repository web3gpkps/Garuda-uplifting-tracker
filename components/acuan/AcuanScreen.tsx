import type { ReactNode } from "react";
import { formatPercent } from "@/lib/dashboard";
import {
  AREA_RESULTS,
  ASPECT_FINDINGS,
  COACHING_SUMMARY,
  DATA_NOTES,
  EVALUATION_FACTORS,
  FAILED_BY_PROVIDER,
  FAILED_BY_STATION,
  PROGRAM_RESULTS,
  REFERENCE_SOURCE,
  ROOT_CAUSE_FINDINGS,
  SERVICE_GAPS,
} from "@/lib/reference";
import type { ScreenProps } from "@/lib/workspace";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { barWidth, failedTotal } from "./bars";

export function AcuanLoading() {
  return <PageLoading title="Acuan PDF" label="Memuat acuan PDF" />;
}

const C = COACHING_SUMMARY;
const pct = (v: number) => formatPercent(v, 2);

/** A horizontal CSS bar; the number next to it carries the value for every reader. */
function Bar({ value, max, label }: { value: number | null; max: number; label: ReactNode }) {
  return (
    <span className="flex min-w-40 items-center gap-2">
      <span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-control bg-neutral-tint">
        <span className="block h-full bg-brand" style={{ width: `${barWidth(value, max)}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right tabular-nums">{label}</span>
    </span>
  );
}

function Dash() {
  return (
    <>
      <span aria-hidden="true" className="text-ink-muted">
        –
      </span>
      <span className="sr-only">tidak ada di grafik</span>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-line bg-surface p-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-xl font-semibold text-ink tabular-nums">{value}</dd>
      {sub ? <dd className="text-xs text-ink-muted">{sub}</dd> : null}
    </div>
  );
}

function Slide({ children }: { children: ReactNode }) {
  return <span className="font-normal text-ink-muted"> · {children}</span>;
}

/**
 * "Acuan PDF": the reference numbers from the People Development Overview PDF (lib/reference),
 * read-only and the same for every link. Shown so the KPI baselines on the Dashboard can be
 * traced to their source; nothing here is synced or edited.
 */
export function AcuanScreen({ ws }: ScreenProps) {
  const maxStation = Math.max(...FAILED_BY_STATION.map(failedTotal));
  const maxProvider = Math.max(...FAILED_BY_PROVIDER.map(failedTotal));
  const maxGap = Math.max(...SERVICE_GAPS.map((g) => g.pct));
  const kinds = [...new Set(EVALUATION_FACTORS.map((f) => f.kind))];

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <PageHeader
        title="Acuan PDF"
        context={ws.scopeLabel}
        description="Angka acuan dari laporan People Development Garuda Indonesia: baseline KPI di Dashboard berasal dari sini. Hanya baca, sama untuk semua tautan, tidak disinkronkan."
      >
        <p className="text-sm text-ink">
          <span className="text-ink-muted">Sumber: </span>
          <cite className="not-italic font-semibold">{REFERENCE_SOURCE}</cite>
        </p>
      </PageHeader>

      <Panel title="Ringkasan Coaching Frontliner All BO" description={`${C.period}, passing grade ≥ ${C.passingGrade}. Slide 3 dan 15.`}>
        <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <Stat label="Peserta coaching" value={C.participants} sub={`${C.stations} stasiun`} />
          <Stat label="Lulus" value={C.passed} sub={`Tidak lulus ${C.failed}`} />
          <Stat label="Pass rate nasional" value={pct(C.passRate)} />
          <Stat
            label="Cakupan coaching"
            value={pct(C.coverage)}
            sub={`${C.participants} dari target ${C.targetCoverage} frontliner`}
          />
          <Stat label="Tidak lulus di CGK" value={C.cgkFailed} sub={`${pct(C.cgkFailedShare)} dari semua yang tidak lulus`} />
          <Stat label="Pass rate CGK" value={pct(C.cgkPassRate)} />
          <Stat
            label="CGK per area"
            value={pct(C.cgkBoardingGatePassRate)}
            sub={`Boarding Gate; Transfer Desk ${pct(C.cgkTransferDeskPassRate)}`}
          />
          <Stat label="Pass rate outstation" value={C.outstationPassRate} />
        </dl>
      </Panel>

      <Panel title="Hasil per area (touch point)" description="Slide 6 dan 7." padding="flush">
        <DataTable caption="Hasil coaching per area" hideCaption stickyHeader={false} minWidth="48rem">
          <thead>
            <tr>
              <Th>Area</Th>
              <Th>Pass rate</Th>
              <Th numeric>Rata-rata skor</Th>
              <Th>Insight</Th>
            </tr>
          </thead>
          <tbody>
            {AREA_RESULTS.map((a) => (
              <Tr key={a.area}>
                <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
                  {a.area}
                </Th>
                <Td>
                  <Bar value={a.passRate} max={1} label={pct(a.passRate)} />
                </Td>
                <Td numeric>{pct(a.avgScore)}</Td>
                <Td className="min-w-72 text-sm whitespace-normal">{a.insight}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel title="Service gap per item" description="Persentase temuan belum sesuai per item. Slide 12." padding="flush">
          <DataTable caption="Service gap per item" hideCaption stickyHeader={false}>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Gap</Th>
                <Th>Aspek</Th>
              </tr>
            </thead>
            <tbody>
              {SERVICE_GAPS.map((g) => (
                <Tr key={g.item}>
                  <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
                    {g.item}
                  </Th>
                  <Td>
                    <Bar value={g.pct} max={maxGap} label={pct(g.pct)} />
                  </Td>
                  <Td className="whitespace-nowrap text-ink-muted">{g.aspect}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>

        <Panel title="Temuan akar masalah" description="Jumlah temuan “Belum Sesuai”. Slide 4 dan 5." padding="flush">
          <DataTable caption="Temuan akar masalah" hideCaption stickyHeader={false}>
            <thead>
              <tr>
                <Th>Kategori</Th>
                <Th>Temuan</Th>
                <Th numeric>Jumlah</Th>
              </tr>
            </thead>
            <tbody>
              {ROOT_CAUSE_FINDINGS.map((f) => (
                <Tr key={f.finding}>
                  <Td className="whitespace-nowrap text-ink-muted">{f.category}</Td>
                  <Th scope="row" className="font-normal whitespace-normal text-ink">
                    {f.finding}
                  </Th>
                  <Td numeric className="font-semibold whitespace-nowrap">
                    {f.count}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      </div>

      <Panel title="Temuan per aspek" description="Fokus, akar masalah dan dampak. Slide 13 dan 14.">
        <ul className="grid gap-4 lg:grid-cols-2">
          {ASPECT_FINDINGS.map((a) => (
            <li key={a.aspect} className="flex flex-col gap-2 rounded-control border border-line p-4">
              <h3 className="text-base font-semibold text-ink">{a.aspect}</h3>
              <dl className="grid gap-2 text-sm">
                {[
                  ["Fokus", a.focus],
                  ["Akar masalah", a.rootCause],
                  ["Dampak", a.impact],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="font-semibold text-ink-muted">{k}</dt>
                    <dd className="text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Hasil training IULS dan RUST"
        description="Training Performance Report April sampai Agustus 2026. Slide 17, 18 dan 20."
        padding="flush"
      >
        <DataTable caption="Hasil training IULS dan RUST" hideCaption stickyHeader={false} minWidth="60rem">
          <thead>
            <tr>
              <Th>Program</Th>
              <Th numeric>Peserta</Th>
              <Th numeric>Passed</Th>
              <Th numeric>Failed</Th>
              <Th>Pass rate</Th>
              <Th numeric>Peserta Gapura</Th>
              <Th numeric>Passed Gapura</Th>
              <Th numeric>Failed Gapura</Th>
              <Th>Pass rate Gapura</Th>
              <Th>Batch terbaik</Th>
              <Th>Batch terendah</Th>
            </tr>
          </thead>
          <tbody>
            {Object.values(PROGRAM_RESULTS).map((p) => (
              <Tr key={p.program}>
                <Th scope="row" className="font-semibold text-ink">
                  {p.program}
                </Th>
                <Td numeric>{p.participants}</Td>
                <Td numeric>{p.passed}</Td>
                <Td numeric>{p.failed}</Td>
                <Td>
                  <Bar value={p.passed / p.participants} max={1} label={pct(p.passed / p.participants)} />
                </Td>
                <Td numeric>{p.gapuraParticipants}</Td>
                <Td numeric>{p.gapuraPassed}</Td>
                <Td numeric>{p.gapuraFailed}</Td>
                <Td>
                  <Bar
                    value={p.gapuraPassed / p.gapuraParticipants}
                    max={1}
                    label={pct(p.gapuraPassed / p.gapuraParticipants)}
                  />
                </Td>
                <Td className="text-sm whitespace-nowrap">
                  {p.best.batch}, {p.best.period}: {p.best.passed}/{p.best.of}
                </Td>
                <Td className="text-sm whitespace-nowrap">
                  {p.worst.batch}, {p.worst.period}: {p.worst.passed}/{p.worst.of}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel
          title="Tidak lulus per stasiun"
          description="Slide 23 dan 24. Grafik PDF tidak memuat semua stasiun; – berarti tidak ada di grafik."
          padding="flush"
        >
          <DataTable caption="Peserta tidak lulus per stasiun" hideCaption maxHeight="min(70dvh, 640px)">
            <thead>
              <tr>
                <Th>Stasiun</Th>
                <Th numeric>IULS</Th>
                <Th numeric>RUST</Th>
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {FAILED_BY_STATION.map((r) => (
                <Tr key={r.station}>
                  <Th scope="row" className="font-semibold text-ink">
                    {r.station}
                  </Th>
                  <Td numeric>{r.iuls ?? <Dash />}</Td>
                  <Td numeric>{r.rust ?? <Dash />}</Td>
                  <Td>
                    <Bar value={failedTotal(r)} max={maxStation} label={failedTotal(r)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>

        <Panel title="Tidak lulus per provider" description="Slide 23 dan 24." padding="flush">
          <DataTable caption="Peserta tidak lulus per provider" hideCaption stickyHeader={false}>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th numeric>IULS</Th>
                <Th numeric>RUST</Th>
                <Th>Total</Th>
              </tr>
            </thead>
            <tbody>
              {FAILED_BY_PROVIDER.map((r) => (
                <Tr key={r.provider}>
                  <Th scope="row" className="font-semibold whitespace-nowrap text-ink">
                    {r.provider}
                  </Th>
                  <Td numeric>{r.iuls ?? <Dash />}</Td>
                  <Td numeric>{r.rust ?? <Dash />}</Td>
                  <Td>
                    <Bar value={failedTotal(r)} max={maxProvider} label={failedTotal(r)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      </div>

      <Panel title="Faktor hasil evaluasi" description="Penyebab ketidaklulusan, keunggulan dan gap. Slide 25 dan 26.">
        <div className="grid gap-6 lg:grid-cols-3">
          {kinds.map((kind) => (
            <section key={kind} aria-labelledby={`faktor-${kind}`} className="flex flex-col gap-2">
              <h3 id={`faktor-${kind}`} className="text-base font-semibold text-ink">
                {kind}
              </h3>
              <dl className="flex flex-col divide-y divide-line">
                {EVALUATION_FACTORS.filter((f) => f.kind === kind).map((f) => (
                  <div key={f.factor} className="py-2 first:pt-0">
                    <dt className="text-sm font-semibold text-ink">{f.factor}</dt>
                    <dd className="text-sm text-ink-muted">{f.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Panel>

      <Panel
        title="Catatan data"
        description="Ketidakcocokan di dalam PDF, ditampilkan apa adanya dan tidak dikoreksi diam-diam."
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-ink marker:text-ink-muted">
          {DATA_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-muted">
          Sumber semua angka di halaman ini: {REFERENCE_SOURCE}.
          <Slide>angka slide tercantum di tiap bagian</Slide>
        </p>
      </Panel>
    </div>
  );
}
