import { diffDays, formatHariTanggal, formatTanggal } from "@/lib/dates";
import { bmiCheckDate, bmiSummary, type BmiCheckRow, type BmiSummary } from "@/lib/rules";
import {
  firstParam,
  hrefs,
  changedVia,
  lastChangedLabel,
  shortDateTime,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type Workspace,
} from "@/lib/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { DataTable, Td, Th, Tr } from "@/components/ui/DataTable";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StationFilter } from "@/components/ui/StationFilter";
import { HowToTip } from "@/components/ui/HowToTip";
import { RememberView } from "@/components/ui/RememberView";
import { oneTo, rememberScope } from "@/components/ui/remember";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { BmiStaffRow } from "./BmiStaffRow";
import { BmiGrid, type BmiGridRow } from "./BmiGrid";
import { formatRatio } from "@/lib/format";
import { PeriodRail, type RailPeriod } from "./PeriodRail";
import { defaultPeriod, scheduleTone, slotCounts, type BmiSlotCounts } from "./summary";

const TITLE = "Cek BMI 2 mingguan";
const DESCRIPTION =
  "Ukur tinggi dan berat tiap SDM pada tanggal cek, lalu simpan per baris. BMI, kategori, dan jadwal cek berikutnya dihitung otomatis: SDM dengan catatan BMI dicek tiap 2 minggu, tanpa catatan tiap bulan.";

const CATEGORY_TONES: Record<string, StatusTone> = {
  Normal: "good",
  Kurus: "warning",
  Overweight: "warning",
  Obesitas: "critical",
};

/** "tautan ini, 8 Okt 07.55" (the grid column header already says "Terakhir diubah lewat"). */
function changedWhen(row: { updatedByLink?: string | null; updatedAt?: string | null }, ws: Workspace): string {
  const when = shortDateTime(row.updatedAt);
  return `${changedVia(row, ws)}${when ? `, ${when}` : ""}`;
}

function relativeDay(date: string, today: string): string {
  const days = diffDays(date, today);
  if (days === 0) return "hari ini";
  if (days === 1) return "besok";
  if (days > 1) return `${days} hari lagi`;
  if (days === -1) return "kemarin";
  return `${-days} hari lalu`;
}

export function BmiLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar SDM dan hasil cek BMI" />;
}

/** Workbook sheet "Cek BMI 2 Mingguan". */
export function BmiScreen({ access, ws, searchParams: query }: ScreenProps) {
  const links = hrefs(access);
  const today = todayInJakarta();
  // Without the schedule the BMI slots cannot be placed on dates.
  const settings = ws.schedule ? ruleSettings(ws.settings) : null;

  if (!settings) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={TITLE} context={ws.scopeLabel} description={DESCRIPTION} />
        <Panel>
          <ErrorState
            title="Jadwal cek BMI belum terbaca"
            cause="Tanggal cek pertama, jarak antar cek, atau jumlah periode belum ada di Parameter."
            action="Minta pemilik aplikasi melengkapi Parameter, lalu muat ulang halaman ini."
          />
        </Panel>
      </div>
    );
  }

  const stationFilter = parseStation(ws, query.stasiun);
  const stations = stationCodes(ws);

  const requestedPeriod = Number(firstParam(query.periode));
  const period =
    Number.isInteger(requestedPeriod) && requestedPeriod >= 1 && requestedPeriod <= settings.bmiPeriods
      ? requestedPeriod
      : defaultPeriod(settings, today);
  const currentPeriod = bmiCheckDate(1, settings) <= today ? defaultPeriod(settings, today) : null;
  const plannedDates = Array.from({ length: settings.bmiPeriods }, (_, i) => bmiCheckDate(i + 1, settings));
  const plannedDate = plannedDates[period - 1];

  const href = (p: number, station: string | null) => links.to("bmi", { periode: p, stasiun: station });

  const checksByStaff = new Map<string, Workspace["bmiChecks"]>();
  for (const c of ws.bmiChecks) {
    const list = checksByStaff.get(c.staffCode);
    if (list) list.push(c);
    else checksByStaff.set(c.staffCode, [c]);
  }

  // Every staff member's summary once; station views and the per-station table reuse it.
  const allStaff = sortedStaff(ws);
  const summaries = new Map<string, BmiSummary>(
    allStaff.map((st) => [
      st.code,
      bmiSummary((checksByStaff.get(st.code) ?? []) as BmiCheckRow[], st.bmiHasNote, settings, today),
    ]),
  );
  const summariesOf = (station: string | null) =>
    allStaff.filter((st) => !station || st.station === station).map((st) => summaries.get(st.code)!);

  const staffInView = allStaff.filter((st) => !stationFilter || st.station === stationFilter);
  const inView = summariesOf(stationFilter);
  const view = slotCounts(inView, period);

  const railPeriods: RailPeriod[] = plannedDates.map((date, i) => {
    const counts = slotCounts(inView, i + 1);
    return {
      period: i + 1,
      date,
      checked: counts.checked,
      staffCount: counts.staffCount,
      phase: currentPeriod === i + 1 ? "current" : date < today ? "past" : "future",
    };
  });

  const gridRows: BmiGridRow[] = staffInView.map((st) => {
    const checks = checksByStaff.get(st.code) ?? [];
    const summary = summaries.get(st.code)!;
    const latest = checks.reduce<(typeof checks)[number] | null>(
      (a, c) => (!a || (c.updatedAt ?? "") > (a.updatedAt ?? "") ? c : a),
      null,
    );
    return {
      code: st.code,
      name: st.name ?? st.code,
      station: st.station,
      gender: st.gender,
      bmiHasNote: st.bmiHasNote ?? null,
      bmiNote: st.bmiNote,
      checks: summary.periods.map((p) =>
        p && p.heightCm !== null && p.weightKg !== null
          ? { date: p.checkDate, tb: p.heightCm, bb: p.weightKg, bmi: p.bmi, category: p.category }
          : null,
      ),
      weightDelta: summary.weightDelta,
      weighings: summary.periods.filter((p) => p?.weightKg !== null && p?.weightKg !== undefined).length,
      nextCheck: summary.nextCheck,
      scheduleStatus: summary.scheduleStatus,
      changed: latest ? changedWhen(latest, ws) : null,
    };
  });

  const missingHasNote = staffInView.filter((st) => st.bmiHasNote === null || st.bmiHasNote === undefined).length;
  const overweightTarget = settings.targetOverweightMax;

  const scopeName = stationFilter ? `Stasiun ${stationFilter}` : ws.isKps ? "semua stasiun" : ws.scopeLabel;
  const stationOptions = ws.isKps
    ? [null, ...stations].map((code) => {
        const counts = slotCounts(summariesOf(code), period);
        return {
          code,
          label: code ?? "Semua stasiun",
          meta: `${counts.checked}/${counts.staffCount}`,
          metaLabel: `${counts.checked} dari ${counts.staffCount} SDM sudah dicek`,
          href: href(period, code),
        };
      })
    : null;

  const stationRows: Array<{ key: string; counts: BmiSlotCounts }> = ws.isKps && !stationFilter
    ? [
        ...stations.map((code) => ({ key: code, counts: slotCounts(summariesOf(code), period) })),
        { key: "Total", counts: view },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={TITLE} context={ws.scopeLabel} description={DESCRIPTION}>
        {stationOptions ? <StationFilter options={stationOptions} current={stationFilter} /> : null}
        <RememberView
          scope={rememberScope(access, ws)}
          allowed={{ periode: oneTo(settings.bmiPeriods), ...(ws.isKps ? { stasiun: stations } : {}) }}
          shown={{ periode: String(period), stasiun: stationFilter }}
        />
        <div className="flex flex-col gap-3">
          <PeriodRail periods={railPeriods} selected={period} hrefForPeriod={(p) => href(p, stationFilter)} />
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink">
              <span className="font-semibold">Cek ke-{period}</span>, dijadwalkan{" "}
              <time dateTime={plannedDate}>{formatHariTanggal(plannedDate)}</time> ({relativeDay(plannedDate, today)}).
            </p>
            <p className="text-sm text-ink">
              <span className="font-semibold tabular-nums">
                {view.checked} dari {view.staffCount} SDM
              </span>{" "}
              sudah dicek pada cek ke-{period}{ws.isKps ? ` (${scopeName})` : ""}.
              {view.pctOverweight !== null ? (
                <>
                  {" "}
                  Overweight + obesitas{" "}
                  <span className="font-semibold tabular-nums">{formatRatio(view.pctOverweight)}</span> (target di
                  bawah {formatRatio(overweightTarget)}).
                </>
              ) : null}
            </p>
            {view.checked > 0 ? (
              <ul aria-label={`Kategori BMI cek ke-${period}`} className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ["Normal", view.normal],
                    ["Kurus", view.kurus],
                    ["Overweight", view.overweight],
                    ["Obesitas", view.obesitas],
                  ] as const
                ).map(([label, n]) => (
                  <li key={label}>
                    <StatusChip label={`${label}: ${n}`} tone={CATEGORY_TONES[label]} />
                  </li>
                ))}
              </ul>
            ) : null}
            {view.staffCount > 0 ? (
              <ul aria-label="Status jadwal cek per SDM" className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ["Terlambat cek", view.late],
                    ["Cek ≤ 7 hari", view.dueSoon],
                    ["Terjadwal", view.scheduled],
                  ] as const
                ).map(([label, n]) => (
                  <li key={label}>
                    <StatusChip label={`${label}: ${n}`} tone={n === 0 ? "neutral" : scheduleTone(label)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </PageHeader>

      <Panel
        padding="flush"
        title={`Cek BMI ${scopeName}`}
        description={
          <HowToTip id="bmi">
            isi TB dan BB (desimal pakai koma, 165,5). Tanggal kosong memakai tanggal cek terjadwal. Isi &ldquo;Ada
            catatan BMI&rdquo; Ya atau Tidak untuk menentukan jadwal cek. Kosongkan TB dan BB suatu cek untuk
            menghapusnya.
          </HowToTip>
        }
      >
        {staffInView.length === 0 ? (
          <div className="px-4 sm:px-6">
            <EmptyState
              title={`Belum ada SDM di ${scopeName}`}
              action={
                <ButtonLink href={links.sdm} variant="secondary">
                  Buka Master SDM
                </ButtonLink>
              }
            >
              Cek BMI dicatat per SDM. Tambahkan SDM stasiun ini di Master SDM, lalu kembali ke sini.
            </EmptyState>
          </div>
        ) : (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <BmiGrid
              caption={`Cek BMI 2 mingguan, ${scopeName}`}
              rows={gridRows}
              accessKey={access.key}
              plannedDates={plannedDates}
              period={period}
              periodNote={period === currentPeriod ? "periode berjalan" : "periode yang dipilih"}
              showStation={ws.isKps && !stationFilter}
              summary={`${staffInView.length} SDM · ${view.checked} sudah dicek pada cek ke-${period} · ${view.late} terlambat cek`}
              emptyState={<p className="text-sm text-ink-muted">Tidak ada SDM yang cocok dengan pencarian.</p>}
              phone={
                <ol className="-mx-4 flex flex-col divide-y divide-line border-t border-line sm:-mx-6">
                  {staffInView.map((st) => {
                    const checks = checksByStaff.get(st.code) ?? [];
                    const current = checks.find((c) => c.period === period);
                    return (
                      <BmiStaffRow
                        key={`${st.code}-${period}`}
                        accessKey={access.key}
                        period={period}
                        plannedDate={plannedDate}
                        plannedDates={plannedDates}
                        settings={settings}
                        showStation={ws.isKps && !stationFilter}
                        staff={{
                          code: st.code,
                          name: st.name ?? st.code,
                          station: st.station,
                          gender: st.gender,
                          bmiHasNote: st.bmiHasNote ?? null,
                          bmiNote: st.bmiNote,
                          assignmentStatus: st.assignmentStatus,
                        }}
                        saved={
                          current && current.heightCm !== null && current.weightKg !== null
                            ? {
                                checkDate: current.checkDate,
                                heightCm: Number(current.heightCm),
                                weightKg: Number(current.weightKg),
                                changedLabel: lastChangedLabel(current, ws),
                              }
                            : null
                        }
                        summary={summaries.get(st.code)!}
                      />
                    );
                  })}
                </ol>
              }
            />
          </div>
        )}
      </Panel>

      {missingHasNote > 0 ? (
        <section
          aria-label="Catatan jadwal cek BMI"
          className="rounded-panel border border-line bg-surface px-4 py-3 text-sm sm:px-6"
        >
          <p className="font-semibold text-ink">Ada catatan BMI belum diisi</p>
          <p className="mt-1 text-ink">
            {missingHasNote} dari {staffInView.length} SDM belum punya isian &ldquo;Ada catatan BMI&rdquo;. Sampai
            diisi, jadwalnya dihitung tiap {settings.bmiIntervalDays} hari. Isi Ya atau Tidak di kolom itu (di HP:
            bagian &ldquo;Profil, catatan, dan riwayat&rdquo; tiap SDM).
          </p>
        </section>
      ) : null}

      {stationRows.length > 0 ? (
        <Panel
          padding="flush"
          title={`Kategori BMI cek ke-${period} per stasiun`}
          description={`Dihitung dari hasil cek ke-${period}, seperti bagian C Laporan Mingguan. Target overweight + obesitas di bawah ${formatRatio(overweightTarget)} dalam ${settings.targetOverweightMonths} bulan.`}
        >
          <DataTable
            caption={`Kategori BMI cek ke-${period} per stasiun`}
            hideCaption
            minWidth="52rem"
            maxHeight="min(70dvh, 720px)"
          >
            <thead>
              <tr>
                <Th>Stasiun</Th>
                <Th numeric>Jumlah SDM</Th>
                <Th numeric>Sudah dicek</Th>
                <Th numeric>Belum dicek</Th>
                <Th numeric>Normal</Th>
                <Th numeric>Kurus</Th>
                <Th numeric>Overweight</Th>
                <Th numeric>Obesitas</Th>
                <Th numeric>% Overweight + obesitas</Th>
                <Th numeric>Terlambat cek</Th>
              </tr>
            </thead>
            <tbody>
              {stationRows.map(({ key, counts }) => {
                const isTotal = key === "Total";
                const over = counts.pctOverweight !== null && counts.pctOverweight >= overweightTarget;
                return (
                  <Tr key={key}>
                    <Th scope="row" className={isTotal ? "font-semibold" : "font-normal"}>
                      {isTotal ? "Total" : key}
                    </Th>
                    <Td numeric>{counts.staffCount}</Td>
                    <Td numeric>{counts.checked}</Td>
                    <Td numeric>{counts.staffCount - counts.checked}</Td>
                    <Td numeric>{counts.normal}</Td>
                    <Td numeric>{counts.kurus}</Td>
                    <Td numeric>{counts.overweight}</Td>
                    <Td numeric>{counts.obesitas}</Td>
                    <Td numeric>
                      {counts.pctOverweight === null ? (
                        <span className="text-ink-muted">Belum ada data</span>
                      ) : (
                        <span className={over ? "font-semibold text-critical" : undefined}>
                          {formatRatio(counts.pctOverweight)}
                          {over ? <span className="sr-only">, di atas target</span> : null}
                        </span>
                      )}
                    </Td>
                    <Td numeric>
                      <span className={counts.late > 0 ? "font-semibold text-critical" : undefined}>{counts.late}</span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          {view.checked === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted sm:px-6">
              Belum ada hasil cek ke-{period}. Jumlah per kategori muncul setelah stasiun menyimpan cek BMI. Cek ke-1
              dijadwalkan {formatTanggal(plannedDates[0])}.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
