import { PROGRAMS } from "@/lib/rules";
import {
  changedVia,
  firstParam,
  hrefs,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  shortDateTime,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { RemedialCard } from "./RemedialCard";
import { RemedialPageStatus, RemedialPageStatusLine } from "./RemedialDialogs";
import { RemedialFilters } from "./RemedialFilters";
import { RemedialGrid, type RemedialGridRow } from "./RemedialGrid";
import {
  REMEDIAL_STATUSES,
  filterRemedialRows,
  formatScore1,
  parseRemedialFilter,
  remedialCounts,
  remedialRows,
  type RemedialCounts,
  type RemedialListRow,
} from "./rows";

const TITLE = "Remedial";

export function RemedialLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar peserta Failed dan hasil remedial" />;
}

/** "tautan ini, 8 Okt 07.55" (the grid column header already says "Terakhir diubah lewat"). */
function changedWhen(row: RemedialListRow, ws: Workspace): string | null {
  if (!row.remedial) return null;
  const when = shortDateTime(row.remedial.updatedAt);
  return `${changedVia(row.remedial, ws)}${when ? `, ${when}` : ""}`;
}

/** Workbook sheet "Remedial" (PDF slide 27, Fase Remidiasi). */
export function RemedialScreen({ access, ws, searchParams: query }: ScreenProps) {
  const links = hrefs(access);
  const settings = ruleSettings(ws.settings);
  const stations = stationCodes(ws);
  const stationFilter = parseStation(ws, query.stasiun);
  const filter = parseRemedialFilter(firstParam(query.program), firstParam(query.status), stationFilter, PROGRAMS);

  const all = remedialRows(sortedStaff(ws), ws.remedials, settings);
  // The summary follows program and station, not the status filter (it counts the statuses).
  const inScope = filterRemedialRows(all, { ...filter, status: null });
  const rows = filterRemedialRows(all, filter);
  const counts = remedialCounts(inScope);

  const scopeName = [
    filter.program ? `peserta ${filter.program}` : null,
    stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel,
  ]
    .filter(Boolean)
    .join(", ");
  const showStation = ws.isKps && !stationFilter;
  const filtered = filter.program !== null || filter.status !== null || stationFilter !== null;

  const statusCount = (status: string) => inScope.filter((r) => r.status === status).length;
  const programCount = (program: string) =>
    all.filter((r) => r.program === program && (!stationFilter || r.station === stationFilter)).length;
  const stationCount = (code: string) =>
    all.filter((r) => r.station === code && (!filter.program || r.program === filter.program)).length;

  const gridRows: RemedialGridRow[] = rows.map((r) => ({ ...r, changed: changedWhen(r, ws) }));
  const pass = formatScore1(settings.passGrade);

  return (
    <RemedialPageStatus>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={TITLE}
          meta={ws.scopeLabel}
        >
          {ws.isKps ? (
            <RememberView
              scope={rememberScope(access, ws)}
              allowed={{ stasiun: stations }}
              shown={{ stasiun: stationFilter }}
            />
          ) : null}
          <RemedialFilters
            path={links.remedial}
            current={{
              program: filter.program,
              status: filter.status,
              stasiun: stationFilter ?? (ws.isKps ? "semua" : null),
            }}
            programs={PROGRAMS.map((p) => ({ value: p, label: `${p} (${programCount(p)})` }))}
            statuses={REMEDIAL_STATUSES.map((s) => ({ value: s, label: `${s} (${statusCount(s)})` }))}
            stations={ws.isKps ? stations.map((code) => ({ value: code, label: `${code} (${stationCount(code)})` })) : null}
          />
        </PageHeader>

        <RemedialSummary counts={counts} scopeName={scopeName} />

        <Panel
          padding="flush"
          title={`Daftar remedial, ${scopeName}`}
        >
          {all.length === 0 ? (
            <div className="px-4 sm:px-6">
              <EmptyState
                title={`Belum ada peserta Failed di ${ws.isKps ? "semua stasiun" : ws.scopeLabel}`}
                action={
                  <ButtonLink href={links.sdm} variant="secondary">
                    Buka Master SDM
                  </ButtonLink>
                }
              >
                Daftar ini terisi otomatis dari Master SDM: peserta dengan Final Result di bawah {pass} masuk ke sini.
                Isi role play dan post-test training di Master SDM bila belum ada.
              </EmptyState>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 sm:px-6">
              <EmptyState
                title="Tidak ada peserta yang cocok dengan filter"
                action={
                  filtered ? (
                    <ButtonLink href={links.to("remedial", { stasiun: ws.isKps ? "semua" : null })} variant="secondary">
                      Tampilkan semua
                    </ButtonLink>
                  ) : undefined
                }
              >
                Ubah program, status, atau stasiun di atas untuk melihat peserta lain.
              </EmptyState>
            </div>
          ) : (
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
              <RemedialGrid
                caption={`Remedial, ${scopeName}`}
                rows={gridRows}
                accessKey={access.key}
                settings={settings}
                showStation={showStation}
                summary={`${rows.length} peserta · ${rows.filter((r) => r.status === "Lulus").length} lulus remedial`}
                emptyState={<p className="text-sm text-ink-muted">Tidak ada peserta yang cocok dengan pencarian.</p>}
                phone={
                  <ol className="-mx-4 flex flex-col gap-4 sm:-mx-6" aria-label={`Daftar remedial ${scopeName}`}>
                    {rows.map((row) => (
                      <li key={`${row.code}-${row.remedial?.updatedAt ?? "baru"}`}>
                        <RemedialCard
                          accessKey={access.key}
                          row={row}
                          settings={settings}
                          showStation={showStation}
                          changedLabel={row.remedial ? lastChangedLabel(row.remedial, ws) : null}
                        />
                      </li>
                    ))}
                  </ol>
                }
              />
            </div>
          )}
        </Panel>
      </div>
    </RemedialPageStatus>
  );
}

function RemedialSummary({ counts, scopeName }: { counts: RemedialCounts; scopeName: string }) {
  const tiles: Array<{ label: string; value: string; note: string; tone?: string }> = [
    { label: "Peserta Failed", value: String(counts.failed), note: "hasil training awal" },
    {
      label: "Sudah dijadwalkan",
      value: `${counts.scheduled}/${counts.failed}`,
      note: counts.failed > counts.scheduled ? `${counts.failed - counts.scheduled} belum dijadwalkan` : "tidak ada yang tertinggal",
    },
    { label: "Lulus remedial", value: String(counts.passed), note: `${counts.waiting} menunggu hasil`, tone: "text-good" },
    {
      label: "Belum lulus",
      value: String(counts.notPassed),
      note: "perlu tindak lanjut",
      tone: counts.notPassed > 0 ? "text-critical" : undefined,
    },
    { label: "Absen role play", value: String(counts.absentRolePlay), note: "penyebab gagal: kehadiran" },
  ];
  return (
    <section aria-label={`Ringkasan remedial, ${scopeName}`} className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label} className="flex flex-col gap-0.5 rounded-panel border border-line bg-surface px-4 py-3">
            <span className="section-label">{t.label}</span>
            <span className={`text-2xl font-semibold tabular-nums ${t.tone ?? "text-ink"}`}>{t.value}</span>
            <span className="text-xs text-ink-muted">{t.note}</span>
          </li>
        ))}
      </ul>
      <RemedialPageStatusLine />
    </section>
  );
}
