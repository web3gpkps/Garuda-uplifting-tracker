import { PROGRAMS, type Program } from "@/lib/rules";
import { formatDecimal } from "@/lib/format";
import {
  hrefs,
  parseStation,
  ruleSettings,
  sortedStaff,
  stationCodes,
  type ScreenProps,
  type WorkspaceAccess,
} from "@/lib/workspace";
import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ButtonLink } from "@/components/ui/Button";
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { StationSelect } from "@/components/ui/StationSelect";
import { UrlSelect } from "@/components/ui/UrlSelect";
import { FlagSummary, type FlagItem } from "@/components/sdm/FlagSummary";
import { StaffGrid } from "@/components/sdm/StaffGrid";
import { AddStaffButton } from "@/components/sdm/AddStaffButton";
import { MATCHES, parseCheck, parseProgram, toRows, type Check } from "@/components/sdm/rows";
import { deleteStaff, saveStaff } from "./actions";

const TITLE = "Data SDM";

export function SdmLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar SDM" />;
}

type Query = { station: string | null; program: Program | null; check: Check | null };

function hrefFor(access: WorkspaceAccess, q: Query): string {
  return hrefs(access).to("sdm", { stasiun: q.station, program: q.program, cek: q.check });
}

/** Workbook sheet "Master SDM": peserta IULS & RUST, hasil training dan cek konsistensi. */
export function SdmScreen({ access, ws, searchParams: sp }: ScreenProps) {
  const settings = ruleSettings(ws.settings);
  const query: Query = {
    station: parseStation(ws, sp.stasiun),
    program: parseProgram(sp.program),
    check: parseCheck(sp.cek),
  };

  const allStaff = sortedStaff(ws);
  const inStation = query.station ? allStaff.filter((s) => s.station === query.station) : allStaff;
  const scopeStaff = query.program ? inStation.filter((s) => s.program === query.program) : inStation;
  const scopeRows = toRows(ws, scopeStaff, settings);
  const rows = query.check ? scopeRows.filter(MATCHES[query.check]) : scopeRows;
  const stationName = query.station ? `Unit ${query.station}` : ws.isKps ? "semua unit" : ws.scopeLabel;
  const scopeName = query.program ? `${query.program}, ${stationName}` : stationName;
  const stations = stationCodes(ws);
  const ownStation = ws.isKps ? null : ws.scope;
  const pass = formatDecimal(settings.passGrade, 0, 2);

  const count = (check: Check) => scopeRows.filter(MATCHES[check]).length;
  const filterLink = (check: Check, label: string) => ({
    href: hrefFor(access, { ...query, check: query.check === check ? null : check }),
    label: query.check === check ? "Tampilkan semua SDM" : label,
  });

  const flags: FlagItem[] = [
    {
      key: "beda",
      count: count("beda"),
      title: "Beda – verifikasi",
      detail: `Remark di laporan training tidak sama dengan status menurut passing grade ${pass}. Cocokkan dengan laporan.`,
      links: [filterLink("beda", "Tampilkan")],
      active: query.check === "beda",
    },
    {
      key: "failed",
      count: count("failed"),
      title: "Failed",
      detail: `Final Result di bawah ${pass}. Peserta ini perlu remedial atau individual coaching.`,
      links: [filterLink("failed", "Tampilkan")],
      active: query.check === "failed",
    },
    {
      key: "absen",
      count: count("absen"),
      title: "Absen role play",
      detail: "Role play bernilai 0: kendala operasional & kehadiran. Jadwalkan role play ulang.",
      links: [filterLink("absen", "Tampilkan")],
      active: query.check === "absen",
    },
  ];
  const activeFlag = flags.find((f) => f.active);

  const programOptions = [null, ...PROGRAMS].map((p) => ({
    value: p ?? "semua",
    label: p
      ? `${p} (${inStation.filter((s) => s.program === p).length} SDM)`
      : `Semua program (${inStation.length} SDM)`,
    href: hrefFor(access, { ...query, program: p }),
  }));
  const byProgram = query.program ? allStaff.filter((s) => s.program === query.program) : allStaff;
  const stationOptions = ws.isKps
    ? [null, ...stations].map((code) => ({
        value: code ?? "semua",
        label: `${code ?? "Semua unit"} (${code ? byProgram.filter((s) => s.station === code).length : byProgram.length} SDM)`,
        href: hrefFor(access, { ...query, station: code }),
      }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        meta={ws.scopeLabel}
        actions={
          <AddStaffButton
            accessKey={access.key}
            isKps={ws.isKps}
            ownStation={ownStation}
            stations={stations}
            settings={settings}
            saveAction={saveStaff}
          />
        }
      >
        <div className="flex flex-wrap gap-4">
          <UrlSelect label="Program" options={programOptions} current={query.program ?? "semua"} />
          {ws.isKps ? (
            <StationSelect
              options={stationOptions}
              current={query.station ?? "semua"}
            />
          ) : null}
        </div>
        {ws.isKps ? (
          <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: query.station }} />
        ) : null}
      </PageHeader>

      <FlagSummary items={flags} />

      <Panel
        padding="flush"
        title={`Master SDM, ${scopeName}`}
        actions={
          activeFlag ? (
            <ButtonLink size="sm" href={hrefFor(access, { ...query, check: null })}>
              Tampilkan semua SDM
            </ButtonLink>
          ) : null
        }
      >
        <StaffGrid
          caption={`Master SDM ${scopeName}`}
          rows={rows}
          emptyTitle={
            activeFlag ? `Tidak ada SDM dengan ${activeFlag.title} di ${scopeName}` : `Belum ada SDM di ${scopeName}`
          }
          emptyHint={
            activeFlag ? "Pilih Tampilkan semua SDM untuk melihat seluruh daftar." : "Tambahkan lewat tombol Tambah SDM."
          }
          accessKey={access.key}
          isKps={ws.isKps}
          ownStation={ownStation}
          stations={stations}
          settings={settings}
          saveAction={saveStaff}
          canDelete={access.kind === "owner"}
          deleteAction={deleteStaff}
        />
      </Panel>
    </div>
  );
}
