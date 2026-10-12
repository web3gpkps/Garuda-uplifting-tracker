import { formatTanggal, diffDays } from "@/lib/dates";
import { replacementPass, replacementTimeliness, type Settings } from "@/lib/rules";
import {
  changedVia,
  hrefs,
  parseStation,
  ruleSettings,
  settingsComplete,
  shortDateTime,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StationSelect } from "@/components/ui/StationSelect";
import { FilterBar } from "@/components/ui/Toolbar";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { StatusChip } from "@/components/ui/StatusChip";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import {
  AddReplacementButton,
  ReplacementPageStatus,
  ReplacementRowActions,
  type ReplacementContext,
  type ReplacementFormRow,
} from "./ReplacementDialogs";
import { ReplacementGrid, type ReplacementGridRow } from "./ReplacementGrid";

const TITLE = "Penggantian SDM";

/** "n hari lagi", "besok", "hari ini" or "lewat n hari", counted to the replacement deadline. */
function countdown(deadline: string, today: string): string {
  const days = diffDays(deadline, today);
  if (days > 1) return `${days} hari lagi`;
  if (days === 1) return "besok";
  if (days === 0) return "hari ini";
  return `lewat ${-days} hari`;
}

/** "tautan ini, 8 Okt 07.55" (the grid header already says "Terakhir diubah lewat"). */
function changedWhen(row: { updatedByLink?: string | null; updatedAt?: string | null }, ws: Workspace): string {
  const when = shortDateTime(row.updatedAt);
  return `${changedVia(row, ws)}${when ? `, ${when}` : ""}`;
}

function toFormRow(row: Workspace["replacements"][number]): ReplacementFormRow {
  return {
    id: row.id,
    program: row.program,
    station: row.station,
    staffCode: row.staffCode,
    replacedName: row.replacedName,
    reason: row.reason,
    withdrawnOn: row.withdrawnOn,
    replacementName: row.replacementName,
    effectiveOn: row.effectiveOn,
    trainingOn: row.trainingOn,
    postTest: row.postTest === null ? null : Number(row.postTest),
    finalResult: row.finalResult === null ? null : Number(row.finalResult),
    reported: row.reported,
    notes: row.notes,
  };
}

export function PenggantianLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar penggantian SDM" />;
}

/** Penggantian SDM: one line on the deadline, then the grid (cards on phones). */
export function PenggantianScreen({ access, ws, searchParams: query }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);

  if (!settingsComplete(ws.settings)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} meta={ws.scopeLabel} />
        <Panel>
          <ErrorState
            title="Batas penggantian belum terbaca"
            cause="Parameter penggantian tidak terkirim lewat tautan ini."
            action="Minta pengelola aplikasi memeriksa Parameter, lalu muat ulang halaman."
          />
        </Panel>
      </div>
    );
  }

  const stations = stationCodes(ws);
  const stationFilter = parseStation(ws, query.stasiun);
  const scopeName = stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;
  const rows = ws.replacements.filter((r) => !stationFilter || r.station === stationFilter);
  const notEffective = rows.filter((r) => !r.effectiveOn || r.effectiveOn > today).length;

  const href = (station: string | null) => hrefs(access).to("penggantian", { stasiun: station });

  const ctx: ReplacementContext = {
    accessKey: access.key,
    fixedStation: ws.isKps ? null : ws.scope,
    stations,
    staff: sortedStaff(ws).map((st) => ({
      code: st.code,
      name: st.name ?? st.code,
      station: st.station,
      program: st.program,
    })),
    settings,
    today,
    defaultStation: stationFilter,
  };

  const gridRows: ReplacementGridRow[] = rows.map((row) => ({
    ...toFormRow(row),
    pass: replacementPass(row, settings),
    timeliness: replacementTimeliness(row, settings, today),
    changed: changedWhen(row, ws),
  }));

  const meta = [
    `Batas ${formatTanggal(settings.replacementDeadline)}`,
    countdown(settings.replacementDeadline, today),
    `${notEffective} dari ${rows.length} belum efektif`,
  ].join(" · ");

  return (
    <ReplacementPageStatus>
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} meta={meta} actions={<AddReplacementButton ctx={ctx} />}>
          {ws.isKps ? (
            <>
              <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: stationFilter }} />
              <FilterBar label="Filter penggantian">
                <StationSelect
                  current={stationFilter ?? "semua"}
                  options={[null, ...stations].map((code) => {
                    const count = code ? ws.replacements.filter((r) => r.station === code).length : ws.replacements.length;
                    return {
                      value: code ?? "semua",
                      label: `${code ?? "Semua stasiun"} (${count})`,
                      href: href(code),
                    };
                  })}
                />
              </FilterBar>
            </>
          ) : null}
        </PageHeader>

        {rows.length === 0 ? (
          <Panel>
            <EmptyState
              title={`Belum ada penggantian SDM di ${scopeName}`}
              action={
                stationFilter ? (
                  <ButtonLink href={href(null)} variant="secondary">
                    Lihat semua stasiun
                  </ButtonLink>
                ) : undefined
              }
            />
          </Panel>
        ) : (
          <Panel padding="flush">
            <div className="px-4 py-4">
              <ReplacementGrid
                caption={`Penggantian SDM, ${scopeName}`}
                rows={gridRows}
                ctx={ctx}
                summary={`${rows.length} penggantian`}
                phone={
                  <ol className="-mx-4 flex flex-col divide-y divide-line border-t border-line" aria-label={`Penggantian SDM, ${scopeName}`}>
                    {rows.map((row) => (
                      <li key={row.id}>
                        <ReplacementCard row={row} ctx={ctx} settings={settings} today={today} />
                      </li>
                    ))}
                  </ol>
                }
              />
            </div>
          </Panel>
        )}
      </div>
    </ReplacementPageStatus>
  );
}

/** Phone card: name, then four fields; everything else sits behind "Detail". */
function ReplacementCard({
  row,
  ctx,
  settings,
  today,
}: {
  row: Workspace["replacements"][number];
  ctx: ReplacementContext;
  settings: Settings;
  today: string;
}) {
  const meta = [row.station, row.program].filter(Boolean).join(" · ");
  return (
    <article aria-labelledby={`penggantian-${row.id}`} className="flex flex-col gap-3 px-4 py-4">
      <div className="min-w-0">
        <h2 id={`penggantian-${row.id}`} className="text-base font-semibold text-ink [overflow-wrap:anywhere]">
          {row.replacedName}
        </h2>
        {meta ? <p className="station-code text-xs text-ink-muted">{meta}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-ink-muted">Pengganti</dt>
          <dd className="[overflow-wrap:anywhere]">{row.replacementName ?? <span className="text-ink-muted">–</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Tgl efektif</dt>
          <dd className="tabular">{row.effectiveOn ? formatTanggal(row.effectiveOn) : <span className="text-ink-muted">–</span>}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Ketepatan waktu</dt>
          <dd>
            <StatusChip label={replacementTimeliness(row, settings, today)} emptyLabel="–" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Kelulusan</dt>
          <dd>
            <StatusChip label={replacementPass(row, settings)} emptyLabel="–" />
          </dd>
        </div>
      </dl>
      <ReplacementRowActions ctx={ctx} row={toFormRow(row)} />
    </article>
  );
}
