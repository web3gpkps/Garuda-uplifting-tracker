import { PROGRAMS, type RemedialStatus } from "@/lib/rules";
import {
  firstParam,
  hrefs,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { StationSelect } from "@/components/ui/StationSelect";
import { TabNav } from "@/components/ui/TabNav";
import { FilterBar } from "@/components/ui/Toolbar";
import { UrlSelect } from "@/components/ui/UrlSelect";
import { ALL_STATIONS } from "@/components/ui/url-options";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { RemedialPageStatus, RemedialPageStatusLine } from "./RemedialDialogs";
import { RemedialList } from "./RemedialList";
import {
  REMEDIAL_STATUSES,
  byStatus,
  filterRemedialRows,
  formatScore1,
  parseRemedialFilter,
  remedialCounts,
  remedialRows,
} from "./rows";

const TITLE = "Remedial";
const ALL_PROGRAMS = "semua";

export function RemedialLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar remedial" />;
}

/**
 * Remedial: the Failed participants, "Belum dijadwalkan" first, one status filter row.
 * Each row has one action: "Jadwalkan", "Isi hasil" or "Ubah" (a dialog).
 */
export function RemedialScreen({ access, ws, searchParams: query }: ScreenProps) {
  const links = hrefs(access);
  const settings = ruleSettings(ws.settings);
  const stations = stationCodes(ws);
  const stationFilter = parseStation(ws, query.stasiun);
  // The program filter is for KPS and the owner; a station link sees every program.
  const filter = parseRemedialFilter(
    ws.isKps ? firstParam(query.program) : undefined,
    firstParam(query.status),
    stationFilter,
    PROGRAMS,
  );

  const all = remedialRows(sortedStaff(ws), ws.remedials, settings);
  // Counts follow program and station, not the status filter (the status row shows them).
  const inScope = filterRemedialRows(all, { ...filter, status: null });
  const rows = byStatus(filterRemedialRows(all, filter));
  const counts = remedialCounts(inScope);

  const href = (next: { program?: string | null; status?: RemedialStatus | null; station?: string | null }) =>
    links.to("remedial", {
      program: next.program !== undefined ? next.program : filter.program,
      status: next.status !== undefined ? next.status : filter.status,
      stasiun: ws.isKps ? ((next.station !== undefined ? next.station : stationFilter) ?? ALL_STATIONS) : null,
    });

  const scopeCode = stationFilter ?? (ws.isKps ? "Semua stasiun" : ws.scopeLabel.replace(/^Stasiun /, ""));
  const scopeName = [
    filter.program,
    stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel,
  ]
    .filter(Boolean)
    .join(", ");
  const meta = `${scopeCode} · ${counts.failed} peserta Failed · ${counts.unscheduled} belum dijadwalkan`;

  const statusItems = [
    { href: href({ status: null }), label: <StatusLabel text="Semua" count={inScope.length} /> },
    ...REMEDIAL_STATUSES.map((s) => ({
      href: href({ status: s }),
      label: <StatusLabel text={s} count={inScope.filter((r) => r.status === s).length} />,
    })),
  ];
  const currentStatusHref = href({});

  const stationCount = (code: string | null) =>
    all.filter((r) => (!code || r.station === code) && (!filter.program || r.program === filter.program)).length;
  const programCount = (program: string | null) =>
    all.filter((r) => (!program || r.program === program) && (!stationFilter || r.station === stationFilter)).length;

  return (
    <RemedialPageStatus>
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} meta={meta} />
        {ws.isKps ? (
          <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: stationFilter }} />
        ) : null}

        {ws.isKps ? (
          <FilterBar label="Filter remedial">
            <StationSelect
              options={[null, ...stations].map((code) => ({
                value: code ?? ALL_STATIONS,
                label: `${code ?? "Semua stasiun"} (${stationCount(code)})`,
                href: href({ station: code }),
              }))}
              current={stationFilter ?? ALL_STATIONS}
            />
            <UrlSelect
              label="Program"
              options={[null, ...PROGRAMS].map((p) => ({
                value: p ?? ALL_PROGRAMS,
                label: `${p ?? "Semua program"} (${programCount(p)})`,
                href: href({ program: p }),
              }))}
              current={filter.program ?? ALL_PROGRAMS}
              width="w-full sm:w-44"
            />
          </FilterBar>
        ) : null}

        <div className="flex flex-col gap-2">
          <TabNav label="Status remedial" items={statusItems} currentHref={currentStatusHref} />
          <RemedialPageStatusLine />
        </div>

        <Panel padding="flush">
          {all.length === 0 ? (
            <div className="px-4">
              <EmptyState
                title={`Belum ada peserta Failed di ${ws.isKps ? "semua stasiun" : ws.scopeLabel}`}
                action={
                  <ButtonLink href={links.sdm} variant="secondary">
                    Buka Data SDM
                  </ButtonLink>
                }
              >
                Peserta dengan Final Result di bawah {formatScore1(settings.passGrade)} masuk ke daftar ini.
              </EmptyState>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4">
              <EmptyState
                title={filter.status ? `Tidak ada peserta ${filter.status}` : "Tidak ada peserta di pilihan ini"}
                action={
                  <ButtonLink href={href({ status: null, program: null })} variant="secondary">
                    Tampilkan semua
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <RemedialList
              caption={`Remedial, ${scopeName}`}
              rows={rows}
              accessKey={access.key}
              settings={settings}
              showStation={ws.isKps && !stationFilter}
            />
          )}
        </Panel>
      </div>
    </RemedialPageStatus>
  );
}

function StatusLabel({ text, count }: { text: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <span className="font-normal text-ink-muted tabular-nums">{count}</span>
    </span>
  );
}
