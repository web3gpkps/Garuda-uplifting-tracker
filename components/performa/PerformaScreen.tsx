import type { ReactNode } from "react";
import { PROGRAMS, coachingAvg, finalResult, staffRekap, weekEnd, weekOfDate, weekStart, type Program } from "@/lib/rules";
import { formatTanggal, formatTanggalPendek, formatHariTanggal } from "@/lib/dates";
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
import { WeekRail } from "@/components/shell/WeekRail";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";
import { TabNav } from "@/components/ui/TabNav";
import { EmptyState } from "@/components/ui/States";
import { StationSelect } from "@/components/ui/StationSelect";
import { UrlSelect } from "@/components/ui/UrlSelect";
import type { UrlOption } from "@/components/ui/url-options";
import { parseProgram } from "@/components/sdm/rows";
import { WeeklyEntry, type EntryGroup } from "@/components/performa/WeeklyEntry";
import type { EntryStaff } from "@/components/performa/ScoreRow";
import { RekapTable } from "@/components/performa/RekapTable";
import { ScoreGrid, type ScoreGridRow } from "@/components/performa/ScoreGrid";
import { parseWeek } from "@/components/performa/workspace-data";
import { saveWeeklyScore } from "./actions";

const TITLE = "Penilaian Mingguan";

export function PerformaLoading() {
  return <PageLoading title={TITLE} label="Memuat nilai performa" />;
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

/** Workbook sheets "Log Performa Mingguan" (input) and "Rekap Performa" (rekap). */
export function PerformaScreen({ access, ws, searchParams: sp }: ScreenProps) {
  const today = todayInJakarta();
  const settings = ruleSettings(ws.settings);

  const query: Query = {
    tab: sp.tab === "rekap" ? "rekap" : "input",
    week: parseWeek(sp.minggu, settings, today),
    station: parseStation(ws, sp.stasiun),
    program: parseProgram(sp.program),
  };
  const currentWeek = weekOfDate(today, settings);
  const allStaff = sortedStaff(ws);
  const byProgram = query.program ? allStaff.filter((s) => s.program === query.program) : allStaff;
  const inStation = query.station ? allStaff.filter((s) => s.station === query.station) : allStaff;
  const staff = query.station ? byProgram.filter((s) => s.station === query.station) : byProgram;
  const stationName = query.station ? `Unit ${query.station}` : ws.isKps ? "semua unit" : ws.scopeLabel;
  const scopeName = query.program ? `${query.program}, ${stationName}` : stationName;
  const showStation = ws.isKps && query.station === null;

  const assessedCount = (list: WorkspaceStaff[]) => list.filter((s) => isAssessed(ws, s.code, query.week)).length;
  const countLabel = (list: WorkspaceStaff[]) =>
    query.tab === "input" ? `${assessedCount(list)}/${list.length} dinilai` : `${list.length} SDM`;

  const stationOptions: UrlOption[] = ws.isKps
    ? [null, ...stationCodes(ws)].map((code) => {
        const list = code ? byProgram.filter((s) => s.station === code) : byProgram;
        return {
          value: code ?? "semua",
          label: `${code ?? "Semua unit"} (${countLabel(list)})`,
          href: hrefFor(access, { ...query, station: code }),
        };
      })
    : [];
  const programOptions: UrlOption[] = [null, ...PROGRAMS].map((p) => {
    const list = p ? inStation.filter((s) => s.program === p) : inStation;
    return {
      value: p ?? "semua",
      label: `${p ?? "Semua program"} (${countLabel(list)})`,
      href: hrefFor(access, { ...query, program: p }),
    };
  });
  const filters = (
    <div className="flex flex-wrap gap-4">
      <UrlSelect label="Program" options={programOptions} current={query.program ?? "semua"} />
      {stationOptions.length > 0 ? (
        <StationSelect options={stationOptions} current={query.station ?? "semua"} />
      ) : null}
    </div>
  );

  const tabs = [
    { href: hrefFor(access, { ...query, tab: "input" }), label: "Input mingguan" },
    { href: hrefFor(access, { ...query, tab: "rekap" }), label: "Rekap" },
  ];

  const weekRange = `${formatTanggalPendek(weekStart(query.week, settings))} s.d. ${formatTanggal(
    weekEnd(query.week, settings),
  )}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        meta={`${ws.scopeLabel} · ${query.tab === "input" ? `Minggu ke-${query.week}, ${weekRange}` : `Rekap ${settings.weeks} minggu`}`}
      >
        <TabNav
          label="Tampilan performa"
          items={tabs}
          currentHref={query.tab === "rekap" ? tabs[1].href : tabs[0].href}
        />
        {query.tab === "rekap" ? filters : null}
        <RememberView
          scope={rememberScope(access, ws)}
          allowed={{ minggu: oneTo(settings.weeks), ...(ws.isKps ? { stasiun: stationCodes(ws) } : {}) }}
          shown={{ minggu: String(query.week), stasiun: query.station }}
        />
      </PageHeader>

      {query.tab === "input" ? (
        <InputView
          ws={ws}
          access={access}
          query={query}
          staff={staff}
          scopeName={scopeName}
          showStation={showStation}
          today={today}
          currentWeek={currentWeek}
          assessed={assessedCount(staff)}
          filters={filters}
        />
      ) : (
        <RekapView ws={ws} staff={staff} scopeName={scopeName} showStation={showStation} currentWeek={currentWeek} />
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
  today,
  currentWeek,
  assessed,
  filters,
}: {
  ws: Workspace;
  access: WorkspaceAccess;
  query: Query;
  staff: WorkspaceStaff[];
  scopeName: string;
  showStation: boolean;
  today: string;
  currentWeek: number | null;
  assessed: number;
  filters: ReactNode;
}) {
  const settings = ruleSettings(ws.settings);
  const total = staff.length;
  const percent = total === 0 ? 0 : Math.round((assessed / total) * 100);

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
    g.summary = `${g.staff.length} SDM, ${done} sudah dinilai`;
  }

  const weekHref = (w: number) => hrefFor(access, { ...query, week: w });
  const label = `Nilai Minggu ke-${query.week}, ${scopeName}`;
  const emptyState = (
    <EmptyState title={`Belum ada SDM di ${scopeName}`} layout="inline">
      Tambahkan SDM lewat Master SDM (tombol Tambah SDM). Barisnya muncul di sini setelah tersimpan.
    </EmptyState>
  );
  const listKey = `${query.week}-${query.station ?? "semua"}-${query.program ?? "semua"}`;

  return (
    <>
      {/* Phones: the week and filters sit above the cards (on desktop they are in the grid toolbar). */}
      <div className="flex flex-col gap-4 grid:hidden">
        {ws.schedule ? (
          <WeekRail
            settings={ws.schedule}
            today={today}
            selectedWeek={query.week}
            hrefForWeek={weekHref}
            showSummary={false}
            label="Pilih minggu penilaian"
          />
        ) : null}
        {filters}
      </div>

      <Panel
        padding="flush"
        title={label}
      >
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ScoreGrid
            key={listKey}
            caption={label}
            rows={gridRows}
            week={query.week}
            settings={settings}
            showStation={showStation}
            accessKey={access.key}
            saveAction={saveWeeklyScore}
            summary={
              <>
                <span className="font-semibold text-ink tabular-nums">{assessed}</span> dari {total} SDM sudah dinilai
              </>
            }
            toolbar={
              <>
                {ws.schedule ? (
                  <div className="flex flex-col gap-1">
                    <span className="section-label">Minggu</span>
                    <WeekRail
                      variant="compact"
                      settings={ws.schedule}
                      today={today}
                      selectedWeek={query.week}
                      hrefForWeek={weekHref}
                      showSummary={false}
                      label="Pilih minggu penilaian"
                    />
                  </div>
                ) : null}
                {filters}
              </>
            }
            emptyState={emptyState}
            phone={
              <div className="-mx-4 flex flex-col gap-4 sm:-mx-6">
                <div className="flex flex-col gap-2 px-4 sm:px-6">
                  <p className="text-sm text-ink">
                    <span className="text-xl font-semibold tabular-nums">{assessed}</span>{" "}
                    <span className="font-semibold">dari {total} SDM sudah dinilai</span>
                    {query.week === currentWeek ? <span className="text-ink-muted"> minggu ini</span> : null}
                  </p>
                  <div aria-hidden="true" className="h-1.5 w-full max-w-md overflow-hidden rounded-control bg-neutral-tint">
                    <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                {total === 0 ? (
                  <div className="px-4 sm:px-6">{emptyState}</div>
                ) : (
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
                )}
              </div>
            }
          />
        </div>
      </Panel>
    </>
  );
}

function RekapView({
  ws,
  staff,
  scopeName,
  showStation,
  currentWeek,
}: {
  ws: Workspace;
  staff: WorkspaceStaff[];
  scopeName: string;
  showStation: boolean;
  currentWeek: number | null;
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
    <Panel
      padding="flush"
      title={`Rekap performa, ${scopeName}`}
    >
      {!anyScore ? (
        <div className="border-t border-line px-4 sm:px-6">
          <EmptyState title="Belum ada nilai mingguan di lingkup ini" layout="inline">
            Rekap terisi setelah nilai disimpan di tab Input mingguan. Pemantauan Minggu ke-1 mulai{" "}
            {formatHariTanggal(settings.week1Start)}.
          </EmptyState>
        </div>
      ) : null}
      <RekapTable
        caption={`Rekap performa ${scopeName}, Minggu ke-1 sampai ke-${settings.weeks}`}
        rows={rows}
        weeks={settings.weeks}
        currentWeek={currentWeek}
        showStation={showStation}
      />
    </Panel>
  );
}
