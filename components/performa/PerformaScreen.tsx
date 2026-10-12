import type { ReactNode } from "react";
import { PROGRAMS, coachingAvg, finalResult, staffRekap, weekEnd, weekOfDate, weekStart, type Program } from "@/lib/rules";
import { formatTanggal, formatTanggalPendek } from "@/lib/dates";
import {
  hrefs,
  lastChangedLabel,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type WorkspaceAccess,
  type Workspace,
  type WorkspaceStaff,
} from "@/lib/workspace";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";
import { EmptyState } from "@/components/ui/States";
import { StationSelect } from "@/components/ui/StationSelect";
import { FilterBar } from "@/components/ui/Toolbar";
import { UrlSelect } from "@/components/ui/UrlSelect";
import { WeekSelect } from "@/components/ui/WeekSelect";
import { ALL_STATIONS, numberedOptions, type UrlOption } from "@/components/ui/url-options";
import { parseProgram } from "@/components/sdm/rows";
import { WeeklyEntry, type EntryGroup } from "@/components/performa/WeeklyEntry";
import type { EntryStaff } from "@/components/performa/ScoreRow";
import { RekapTable } from "@/components/performa/RekapTable";
import { ScoreGrid, type ScoreGridRow } from "@/components/performa/ScoreGrid";
import { parseWeek } from "@/components/performa/workspace-data";
import { saveWeeklyScore } from "./actions";

const TITLE = "Penilaian Mingguan";

export function PerformaLoading() {
  return <PageLoading title={TITLE} label="Memuat penilaian" />;
}

type Query = { tab: "input" | "rekap"; week: number; station: string | null; program: Program | null };

function hrefFor(access: WorkspaceAccess, q: Query): string {
  return hrefs(access).to("performa", {
    tab: q.tab === "rekap" ? "rekap" : null,
    minggu: q.week,
    stasiun: q.station,
    program: q.program,
  });
}

function isAssessed(ws: Workspace, code: string, week: number): boolean {
  const row = ws.weeklyScores.find((r) => r.staffCode === code && r.week === week);
  return row ? coachingAvg(row) !== null : false;
}

/**
 * Penilaian Mingguan: week select + score grid (phones: one card per person). Rekap is a
 * secondary view (?tab=rekap) behind one button in the header.
 */
export function PerformaScreen({ access, ws, searchParams: sp }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);

  const query: Query = {
    tab: sp.tab === "rekap" ? "rekap" : "input",
    week: parseWeek(sp.minggu, settings, today),
    station: parseStation(ws, sp.stasiun),
    // The program filter is for KPS and the owner; a station link sees its whole station.
    program: ws.isKps ? parseProgram(sp.program) : null,
  };
  const currentWeek = weekOfDate(today, settings);
  const allStaff = sortedStaff(ws);
  const byProgram = query.program ? allStaff.filter((s) => s.program === query.program) : allStaff;
  const inStation = query.station ? allStaff.filter((s) => s.station === query.station) : allStaff;
  const staff = query.station ? byProgram.filter((s) => s.station === query.station) : byProgram;
  const stationName = query.station ?? (ws.isKps ? "semua stasiun" : ws.scopeLabel);
  const scopeName = query.program ? `${query.program}, ${stationName}` : stationName;
  const showStation = ws.isKps && query.station === null;
  const rekap = query.tab === "rekap";

  const assessedCount = (list: WorkspaceStaff[]) => list.filter((s) => isAssessed(ws, s.code, query.week)).length;
  const countLabel = (list: WorkspaceStaff[]) => (rekap ? `${list.length} SDM` : `${assessedCount(list)}/${list.length}`);

  const stationOptions: UrlOption[] = [null, ...stationCodes(ws)].map((code) => {
    const list = code ? byProgram.filter((s) => s.station === code) : byProgram;
    return {
      value: code ?? ALL_STATIONS,
      label: `${code ?? "Semua stasiun"} (${countLabel(list)})`,
      href: hrefFor(access, { ...query, station: code }),
    };
  });
  const programOptions: UrlOption[] = [null, ...PROGRAMS].map((p) => {
    const list = p ? inStation.filter((s) => s.program === p) : inStation;
    return {
      value: p ?? "semua",
      label: `${p ?? "Semua program"} (${countLabel(list)})`,
      href: hrefFor(access, { ...query, program: p }),
    };
  });
  const weekOptions = numberedOptions(
    settings.weeks,
    (n) => `Minggu ke-${n} · ${formatTanggalPendek(weekStart(n, settings))}`,
    (n) => hrefFor(access, { ...query, week: n }),
  );

  const scopeFilters = ws.isKps ? (
    <>
      <StationSelect options={stationOptions} current={query.station ?? ALL_STATIONS} />
      <UrlSelect label="Program" options={programOptions} current={query.program ?? "semua"} width="w-full sm:w-44" />
    </>
  ) : null;

  const weekRange = `${formatTanggalPendek(weekStart(query.week, settings))} s.d. ${formatTanggal(weekEnd(query.week, settings))}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        meta={rekap ? `${ws.scopeLabel} · Rekap ${settings.weeks} minggu` : `${ws.scopeLabel} · ${weekRange}`}
        actions={
          <ButtonLink href={hrefFor(access, { ...query, tab: rekap ? "input" : "rekap" })} scroll={false}>
            {rekap ? "Isi penilaian" : "Lihat rekap"}
          </ButtonLink>
        }
      >
        <RememberView
          scope={rememberScope(access, ws)}
          allowed={{ minggu: oneTo(settings.weeks), ...(ws.isKps ? { stasiun: stationCodes(ws) } : {}) }}
          shown={{ minggu: String(query.week), stasiun: query.station }}
        />
      </PageHeader>

      {rekap ? (
        <RekapView ws={ws} staff={staff} scopeName={scopeName} showStation={showStation} currentWeek={currentWeek} filters={scopeFilters} />
      ) : (
        <InputView
          ws={ws}
          access={access}
          query={query}
          staff={staff}
          scopeName={scopeName}
          showStation={showStation}
          assessed={assessedCount(staff)}
          filters={
            <>
              <WeekSelect
                label="Minggu"
                options={weekOptions}
                current={String(query.week)}
                nowValue={currentWeek !== null ? String(currentWeek) : undefined}
              />
              {scopeFilters}
            </>
          }
        />
      )}
    </div>
  );
}

function InputView({
  ws,
  access,
  query,
  staff,
  scopeName,
  showStation,
  assessed,
  filters,
}: {
  ws: Workspace;
  access: WorkspaceAccess;
  query: Query;
  staff: WorkspaceStaff[];
  scopeName: string;
  showStation: boolean;
  assessed: number;
  filters: ReactNode;
}) {
  const settings = ruleSettings(ws.settings);
  const total = staff.length;

  const groups: EntryGroup[] = [];
  const gridRows: ScoreGridRow[] = [];
  for (const s of staff) {
    let group = groups.find((g) => g.station === s.station);
    if (!group) {
      group = { station: s.station, summary: "", staff: [] };
      groups.push(group);
    }
    const row = ws.weeklyScores.find((r) => r.staffCode === s.code && r.week === query.week) ?? null;
    const final = finalResult(s.rolePlay, s.postTest, settings);
    const changedLabel = row ? lastChangedLabel(row, ws) : null;
    const entry: EntryStaff = {
      code: s.code,
      name: s.name,
      assignmentStatus: s.assignmentStatus,
      finalResult: final,
      defaultTouchPoint: s.touchPoint,
      saved: row
        ? {
            touchPoint: row.touchPoint,
            scores: [row.scoreGrooming, row.scoreKnowledge, row.scoreAttitude, row.scoreCommunication],
            gapTopic: row.gapTopic,
            observer: row.observer,
            coachingNotes: row.coachingNotes,
          }
        : null,
      changedLabel,
    };
    group.staff.push(entry);
    gridRows.push({
      code: s.code,
      name: s.name,
      station: s.station,
      assignmentStatus: s.assignmentStatus,
      finalResult: final,
      defaultTouchPoint: s.touchPoint,
      touch_point: row?.touchPoint ?? null,
      score_grooming: row?.scoreGrooming ?? null,
      score_knowledge: row?.scoreKnowledge ?? null,
      score_attitude: row?.scoreAttitude ?? null,
      score_communication: row?.scoreCommunication ?? null,
      gap_topic: row?.gapTopic ?? null,
      observer: row?.observer ?? null,
      coaching_notes: row?.coachingNotes ?? null,
      changedLabel,
    });
  }
  for (const g of groups) {
    const done = g.staff.filter((e) => isAssessed(ws, e.code, query.week)).length;
    g.summary = `${done} dari ${g.staff.length} dinilai`;
  }

  const label = `Penilaian Minggu ke-${query.week}, ${scopeName}`;
  const progress = (
    <>
      <span className="font-semibold text-ink tabular-nums">{assessed}</span> dari{" "}
      <span className="tabular-nums">{total}</span> dinilai
    </>
  );
  const emptyState = (
    <EmptyState
      title={`Belum ada SDM di ${scopeName}`}
      layout="inline"
      action={
        <ButtonLink href={hrefs(access).to("sdm", { stasiun: query.station })} size="sm">
          Buka Data SDM
        </ButtonLink>
      }
    >
      SDM ditambahkan di Data SDM.
    </EmptyState>
  );
  const listKey = `${query.week}-${query.station ?? "semua"}-${query.program ?? "semua"}`;

  return (
    <ScoreGrid
      key={listKey}
      caption={label}
      rows={gridRows}
      week={query.week}
      settings={settings}
      showStation={showStation}
      accessKey={access.key}
      saveAction={saveWeeklyScore}
      summary={progress}
      toolbar={filters}
      emptyState={emptyState}
      phone={
        <div className="flex flex-col gap-4">
          <FilterBar label="Filter penilaian" end={<span>{progress}</span>}>
            {filters}
          </FilterBar>
          {total === 0 ? (
            emptyState
          ) : (
            <div className="rounded-panel border border-line bg-surface">
              <WeeklyEntry
                key={listKey}
                accessKey={access.key}
                week={query.week}
                settings={settings}
                groups={groups}
                showStationHeadings={groups.length > 1}
                label={label}
                saveAction={saveWeeklyScore}
              />
            </div>
          )}
        </div>
      }
    />
  );
}

function RekapView({
  ws,
  staff,
  scopeName,
  showStation,
  currentWeek,
  filters,
}: {
  ws: Workspace;
  staff: WorkspaceStaff[];
  scopeName: string;
  showStation: boolean;
  currentWeek: number | null;
  filters: ReactNode;
}) {
  const settings = ruleSettings(ws.settings);
  const rows = staff.map((s) => ({
    code: s.code,
    name: s.name,
    program: s.program,
    station: s.station,
    rekap: staffRekap(s, ws.weeklyScores, settings),
  }));
  const anyScore = rows.some((r) => r.rekap.weeksAssessed > 0);

  return (
    <div className="flex flex-col gap-3">
      <FilterBar label="Filter rekap" end={<span className="tabular-nums">{rows.length} SDM</span>}>
        {filters}
      </FilterBar>
      {rows.length > 0 && !anyScore ? (
        <EmptyState title={`Belum ada nilai mingguan di ${scopeName}`} layout="inline">
          Rekap terisi setelah penilaian disimpan.
        </EmptyState>
      ) : null}
      <Panel padding="flush">
        <RekapTable
          caption={`Rekap penilaian ${scopeName}, Minggu ke-1 sampai ke-${settings.weeks}`}
          rows={rows}
          weeks={settings.weeks}
          currentWeek={currentWeek}
          showStation={showStation}
        />
      </Panel>
    </div>
  );
}
