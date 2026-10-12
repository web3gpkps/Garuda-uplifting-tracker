import { berandaSummary, stationTodo } from "@/lib/dashboard";
import { hrefs, stationCodes, trackerData, type Workspace, type WorkspaceAccess } from "@/lib/workspace";
import { programmeWeekLine } from "@/components/shell/programme-calendar";
import { FilterBar } from "@/components/ui/Toolbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StationSelect } from "@/components/ui/StationSelect";
import { ALL_STATIONS } from "@/components/ui/url-options";
import { StationTable } from "./StationTable";
import { TargetTable } from "./TargetTable";
import { TodoList } from "./TodoList";

type RingkasanViewProps = {
  ws: Workspace;
  access: WorkspaceAccess;
  today: string;
  /** KPS station filter (?stasiun=CGK), already validated; null = all stations. */
  stationFilter: string | null;
};

/**
 * Beranda. A station (a station link, or KPS with one station picked) sees this week's
 * to-do list; KPS and the owner see the station table worst first, then the targets.
 */
export function RingkasanView({ ws, access, today, stationFilter }: RingkasanViewProps) {
  const links = hrefs(access);
  const allStations = stationCodes(ws);
  const station = ws.isKps ? stationFilter : ws.scope;
  const stations = station ? [station] : allStations;

  const data = trackerData(ws, ws.isKps ? stationFilter : null);
  const s = data.settings;
  const summary = berandaSummary(data, today, stations);
  const weekLine = programmeWeekLine(s, today);

  const filter = ws.isKps ? (
    <FilterBar label="Filter beranda">
      <StationSelect
        current={stationFilter ?? ALL_STATIONS}
        options={[
          { value: ALL_STATIONS, label: "Semua stasiun", href: links.to("dashboard") },
          ...allStations.map((code) => ({ value: code, label: code, href: links.to("dashboard", { stasiun: code }) })),
        ]}
      />
    </FilterBar>
  ) : null;

  if (station) {
    const row = summary.stations[0] ?? summary.total;
    const findingsWritten =
      summary.week !== null &&
      ws.weeklyReports.some((r) => r.week === summary.week && r.scope === station && Boolean(r.findings?.trim()));
    const items = stationTodo(summary, row, s, findingsWritten);
    const open = items.filter((i) => i.state === "todo").length;
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Beranda"
          meta={`${station} · ${weekLine} · ${open === 0 ? "semua selesai" : `${open} belum selesai`}`}
        />
        {filter}
        <Panel
          title={summary.week === null ? "Persiapan Minggu ke-1" : `Pekerjaan Minggu ke-${summary.week}`}
          padding="flush"
        >
          <TodoList items={items} links={links} />
        </Panel>
      </div>
    );
  }

  const { total } = summary;
  const assessedMeta = total.assessed === null ? null : `${total.assessed} dari ${total.onDuty} dinilai`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Beranda"
        meta={[`${stations.length} stasiun`, weekLine, assessedMeta].filter(Boolean).join(" · ")}
      />
      {filter}
      <Panel title="Stasiun" padding="flush">
        <StationTable rows={summary.stations} total={total} actionOverdue={summary.actionOverdue} links={links} />
      </Panel>
      <Panel title="Target program" padding="flush">
        <TargetTable rows={summary.targets} />
      </Panel>
    </div>
  );
}
