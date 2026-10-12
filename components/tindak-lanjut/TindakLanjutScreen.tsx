import { PageHeader, PageLoading } from "@/components/ui/PageHeader";
import { HowToTip } from "@/components/ui/HowToTip";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { todayInJakarta } from "@/components/shell/programme-calendar";
import { ActionGrid } from "@/components/tindak-lanjut/ActionGrid";
import { AddActionItemButton } from "@/components/tindak-lanjut/AddActionItemButton";
import { GroupFilter } from "@/components/tindak-lanjut/GroupFilter";
import { TindakLanjutBoard, type GroupSummary } from "@/components/tindak-lanjut/TindakLanjutBoard";
import { READ_ONLY_NOTE, parseAspect, parseGroup, toActionView } from "@/components/tindak-lanjut/action-view";
import { actionByGroup, TOTAL } from "@/lib/aggregate";
import { firstParam, hrefs, type ScreenProps } from "@/lib/workspace";

export function TindakLanjutLoading() {
  return <PageLoading title="Tindak Lanjut" label="Memuat tindak lanjut" />;
}

/**
 * Workbook sheet "Tindak Lanjut": 15 national action items (PDF slides 15, 16, 27). A
 * spreadsheet from 900 px, cards with a details dialog on phones. KPS links and the owner
 * update progress and definitions; station links read only. The owner can also add and
 * delete items.
 */
export function TindakLanjutScreen({ access, ws, searchParams }: ScreenProps) {
  const today = todayInJakarta();
  const canEdit = ws.isKps;
  const isOwner = access.kind === "owner" && ws.isOwner;
  const links = hrefs(access);

  const all = ws.actionItems.map((item) => toActionView(item, today, ws));

  // ?kelompok= and ?aspek= (every link: the items are national).
  const groupFilter = parseGroup(firstParam(searchParams.kelompok));
  const aspect = parseAspect(firstParam(searchParams.aspek));
  const items = groupFilter ? all.filter((v) => v.groupName === groupFilter) : all;

  // Dashboard formula (lib/aggregate), so the counts agree with Dashboard and Laporan.
  const progressRows = actionByGroup(ws.actionItems, today);
  const groups: GroupSummary[] = progressRows
    .filter((r) => r.key !== TOTAL)
    .map((r) => ({
      key: r.key,
      total: r.total,
      selesai: r.selesai,
      overdue: r.overdue,
      dueSoon: r.dueSoon,
      avgProgress: r.avgProgress,
    }));
  const shownGroups = groupFilter ? groups.filter((g) => g.key === groupFilter) : groups;
  const shown = groupFilter ? shownGroups[0] : progressRows.find((r) => r.key === TOTAL);

  const scopeName = groupFilter ? `kelompok ${groupFilter}` : "nasional";
  const filterOptions = [null, ...groups.map((g) => g.key)].map((key) => {
    const row = progressRows.find((r) => r.key === (key ?? TOTAL));
    return {
      key,
      label: key ?? "Semua kelompok",
      meta: row ? `${row.selesai}/${row.total}` : "",
      metaLabel: row ? `${row.selesai} dari ${row.total} butir selesai` : "",
      href: links.to("tindakLanjut", { kelompok: key, aspek: aspect || null }),
    };
  });

  const overdue = shown?.overdue ?? 0;
  const dueSoon = shown?.dueSoon ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        context={ws.scopeLabel}
        title="Tindak Lanjut"
        description={
          <>
            {all.length} butir tindak lanjut nasional dari People Development Overview (slide 15, 16, dan 27), dalam
            tiga kelompok: Coaching Frontliner, Timeline Training, dan Evaluasi IULS & RUST.
            {canEdit
              ? " Perbarui Status, % Progres, Tgl update, dan Realisasi / Bukti setiap minggu; Catatan Garuda / KPS dan definisi butir juga diisi di sini."
              : ` ${READ_ONLY_NOTE} Tautan stasiun bisa melihat progres, tetapi tidak mengubahnya.`}
          </>
        }
        actions={
          isOwner ? (
            <AddActionItemButton
              accessKey={access.key}
              existing={all.map((v) => ({ code: v.code, groupName: v.groupName }))}
              defaultGroup={groupFilter}
            />
          ) : undefined
        }
      >
        <GroupFilter options={filterOptions} current={groupFilter} />
        <p className="text-base text-ink">
          {overdue + dueSoon === 0 ? (
            <>Tidak ada butir {scopeName} yang OVERDUE atau jatuh tempo dalam 7 hari.</>
          ) : (
            <>
              Perlu ditangani ({scopeName}): <span className="font-semibold text-critical">{overdue} OVERDUE</span> dan{" "}
              <span className="font-semibold text-warning">{dueSoon} jatuh tempo ≤ 7 hari</span> dari {items.length} butir.
            </>
          )}
        </p>
      </PageHeader>

      {items.length === 0 ? (
        <Panel>
          <EmptyState title={`Belum ada tindak lanjut ${scopeName}`}>
            Butir tindak lanjut nasional berasal dari People Development Overview (15 butir).
            {isOwner
              ? " Tambahkan butir dengan tombol Tambah butir."
              : " Jika daftar ini seharusnya terisi, minta pemilik aplikasi memeriksa data Tindak Lanjut."}
          </EmptyState>
        </Panel>
      ) : (
        <Panel
          padding="flush"
          title={`Tindak Lanjut ${scopeName}`}
          description={
            canEdit ? (
              <HowToTip id="tindak-lanjut">
                pilih Status, ketik % Progres (0 sampai 100) dan bukti yang bisa dicek. Saat progres diubah, Tgl update
                terisi tanggal hari ini kecuali Anda mengetiknya sendiri. Sisa hari dan Flag dihitung otomatis dari Batas
                waktu; butir tanpa batas waktu ditandai &quot;Batas waktu belum ditetapkan&quot;.
              </HowToTip>
            ) : (
              <span className="text-sm text-ink-muted">{READ_ONLY_NOTE} Hanya tampilan baca.</span>
            )
          }
        >
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <ActionGrid
              // A new group filter starts a fresh order (most urgent first).
              key={groupFilter ?? "semua"}
              accessKey={access.key}
              canEdit={canEdit}
              isOwner={isOwner}
              today={today}
              items={items}
              initialAspect={aspect}
              showGroup={!groupFilter}
              caption={`Tindak Lanjut ${scopeName}`}
              phone={
                <div className="-mx-4 sm:-mx-6">
                  <TindakLanjutBoard
                    accessKey={access.key}
                    canEdit={canEdit}
                    isOwner={isOwner}
                    today={today}
                    items={items}
                    initialAspect={aspect}
                    groups={shownGroups}
                  />
                </div>
              }
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
