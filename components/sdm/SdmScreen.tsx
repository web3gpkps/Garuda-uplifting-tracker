import { PROGRAMS, type Program } from "@/lib/rules";
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
import { RememberView } from "@/components/ui/RememberView";
import { rememberScope } from "@/components/ui/remember";
import { StationSelect } from "@/components/ui/StationSelect";
import { UrlSelect } from "@/components/ui/UrlSelect";
import { ALL_STATIONS, type UrlOption } from "@/components/ui/url-options";
import { StaffGrid } from "@/components/sdm/StaffGrid";
import { AddStaffButton } from "@/components/sdm/AddStaffButton";
import { MATCHES, REASONS, REASON_LABELS, parseCheck, parseProgram, toRows, type Check } from "@/components/sdm/rows";
import { deleteStaff, saveStaff } from "./actions";

const TITLE = "Data SDM";

export function SdmLoading() {
  return <PageLoading title={TITLE} label="Memuat daftar SDM" />;
}

type Query = { station: string | null; program: Program | null; check: Check | null };

function hrefFor(access: WorkspaceAccess, q: Query): string {
  return hrefs(access).to("sdm", { stasiun: q.station, program: q.program, cek: q.check });
}

/** Data SDM: peserta IULS & RUST, hasil training dan baris yang perlu diperiksa. */
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
  const stationName = query.station ?? (ws.isKps ? "semua stasiun" : ws.scopeLabel);
  const scopeName = query.program ? `${query.program}, ${stationName}` : stationName;
  const stations = stationCodes(ws);
  const ownStation = ws.isKps ? null : ws.scope;

  const count = (check: Check) => scopeRows.filter(MATCHES[check]).length;
  const flagged = count("perlu");
  const checkOptions: UrlOption[] = [
    { value: "semua", label: "Semua SDM", href: hrefFor(access, { ...query, check: null }) },
    { value: "perlu", label: `Semua yang perlu diperiksa (${flagged})`, href: hrefFor(access, { ...query, check: "perlu" }) },
    ...REASONS.map((reason) => ({
      value: reason,
      label: `${REASON_LABELS[reason]} (${count(reason)})`,
      href: hrefFor(access, { ...query, check: reason }),
    })),
  ];

  const programOptions: UrlOption[] = [null, ...PROGRAMS].map((p) => ({
    value: p ?? "semua",
    label: `${p ?? "Semua program"} (${p ? inStation.filter((s) => s.program === p).length : inStation.length})`,
    href: hrefFor(access, { ...query, program: p }),
  }));
  const byProgram = query.program ? allStaff.filter((s) => s.program === query.program) : allStaff;
  const stationOptions: UrlOption[] = [null, ...stations].map((code) => ({
    value: code ?? ALL_STATIONS,
    label: `${code ?? "Semua stasiun"} (${code ? byProgram.filter((s) => s.station === code).length : byProgram.length})`,
    href: hrefFor(access, { ...query, station: code }),
  }));

  const filters = (
    <>
      {ws.isKps ? <StationSelect options={stationOptions} current={query.station ?? ALL_STATIONS} /> : null}
      <UrlSelect label="Program" options={programOptions} current={query.program ?? "semua"} width="w-full sm:w-44" />
      <UrlSelect label={`Perlu diperiksa (${flagged})`} options={checkOptions} current={query.check ?? "semua"} />
    </>
  );

  const checkName = query.check === "perlu" ? "yang perlu diperiksa" : query.check ? `dengan ${REASON_LABELS[query.check]}` : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={TITLE}
        meta={`${ws.scopeLabel} · ${scopeRows.length} SDM`}
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
        {ws.isKps ? (
          <RememberView scope={rememberScope(access, ws)} allowed={{ stasiun: stations }} shown={{ stasiun: query.station }} />
        ) : null}
      </PageHeader>

      <StaffGrid
        caption={`Data SDM ${scopeName}`}
        rows={rows}
        toolbar={filters}
        emptyTitle={checkName ? `Tidak ada SDM ${checkName} di ${scopeName}` : `Belum ada SDM di ${scopeName}`}
        emptyHint={checkName ? "Pilih Semua SDM untuk melihat seluruh daftar." : "Tambahkan lewat Tambah SDM."}
        accessKey={access.key}
        isKps={ws.isKps}
        ownStation={ownStation}
        stations={stations}
        settings={settings}
        saveAction={saveStaff}
        canDelete={access.kind === "owner"}
        deleteAction={deleteStaff}
      />
    </div>
  );
}
