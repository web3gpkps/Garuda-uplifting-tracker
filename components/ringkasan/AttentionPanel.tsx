import Link from "next/link";
import type { ReactNode } from "react";
import { formatHariTanggal } from "@/lib/dates";
import { relativeDays } from "@/lib/format";
import type { SheetLinks } from "@/lib/workspace/access";
import { ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/States";
import { StatusChip } from "@/components/ui/StatusChip";
import { isQuiet, type Attention, type StaffGroup } from "./attention";
import { Tanggal } from "./format";

type AttentionPanelProps = {
  attention: Attention;
  /** hrefs(access): every sheet path for this access. */
  links: SheetLinks;
  /** More than one station on screen: show per-station lines. */
  multiStation: boolean;
};

/** The most urgent items stay visible; the rest open on request, so the list stays scannable. */
const SHOWN = 5;
/** Names are listed while a station has only a few; beyond that a count is easier to read. */
const NAMED_MAX = 6;

/**
 * The lead of the Dashboard: exceptions only, most urgent first, each group linking to the
 * screen where it is fixed.
 */
export function AttentionPanel({ attention: a, links, multiStation }: AttentionPanelProps) {
  const groups: ReactNode[] = [];

  if (a.dueItems.length > 0) {
    const overdue = a.dueItems.filter((d) => d.flag === "OVERDUE").length;
    groups.push(
      <Group
        key="tl"
        title="Tindak lanjut lewat atau dekat batas waktu"
        summary={
          overdue > 0
            ? `${overdue} OVERDUE, ${a.dueItems.length - overdue} jatuh tempo dalam 7 hari. Butir nasional, diperbarui KPS.`
            : `${a.dueItems.length} butir jatuh tempo dalam 7 hari. Butir nasional, diperbarui KPS.`
        }
        action={
          <ButtonLink href={links.tindakLanjut} size="sm">
            Buka Tindak Lanjut
          </ButtonLink>
        }
      >
        <DueList items={a.dueItems.slice(0, SHOWN)} links={links} />
        {a.dueItems.length > SHOWN ? (
          <More count={a.dueItems.length - SHOWN} noun="butir">
            <DueList items={a.dueItems.slice(SHOWN)} links={links} />
          </More>
        ) : null}
      </Group>,
    );
  }

  if (a.lateBmi.total > 0) {
    groups.push(
      <Group
        key="bmi"
        title="Terlambat cek BMI"
        summary={`${a.lateBmi.total} dari ${a.lateBmi.of} SDM aktif sudah lewat jadwal cek berikutnya.`}
        action={
          <ButtonLink href={links.bmi} size="sm">
            Catat cek BMI
          </ButtonLink>
        }
      >
        <StaffList group={a.lateBmi} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.notScored && a.notScored.total > 0) {
    const { week } = a.notScored;
    groups.push(
      <Group
        key="nilai"
        title={`Skor coaching Minggu ke-${week} belum diisi`}
        summary={`${a.notScored.total} dari ${a.notScored.of} SDM aktif belum dinilai.`}
        action={
          <ButtonLink href={links.to("performa", { minggu: week })} size="sm">
            Isi skor Minggu ke-{week}
          </ButtonLink>
        }
      >
        <StaffList group={a.notScored} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.failedNoRemedial.total > 0) {
    groups.push(
      <Group
        key="remedial"
        title="Failed tanpa remedial"
        summary={`${a.failedNoRemedial.total} dari ${a.failedNoRemedial.of} peserta Failed belum punya tindakan remedial. Setiap peserta yang belum lulus wajib remedial.`}
        action={
          <ButtonLink href={links.remedial} size="sm">
            Jadwalkan remedial
          </ButtonLink>
        }
      >
        <StaffList group={a.failedNoRemedial} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.beda.total > 0) {
    groups.push(
      <Group
        key="beda"
        title="Beda – verifikasi"
        summary={`${a.beda.total} SDM: Remark di laporan training berbeda dari hasil hitung (Final Result terhadap passing grade). Periksa dan perbaiki yang salah; tidak ada yang diubah otomatis.`}
        action={
          <ButtonLink href={links.sdm} size="sm" variant="secondary">
            Periksa di Master SDM
          </ButtonLink>
        }
      >
        <StaffList group={a.beda} multiStation={multiStation} />
      </Group>,
    );
  }

  if (a.replacements.length > 0) {
    const days = a.daysToReplacementDeadline;
    groups.push(
      <Group
        key="ganti"
        title="Penggantian SDM belum efektif"
        summary={
          days >= 0
            ? `Batas penggantian ${formatHariTanggal(a.replacementDeadline)} (${relativeDays(days)}).`
            : `Batas penggantian ${formatHariTanggal(a.replacementDeadline)} sudah lewat ${-days} hari.`
        }
        action={
          <ButtonLink href={links.penggantian} size="sm">
            Buka Penggantian SDM
          </ButtonLink>
        }
      >
        <ul className="flex flex-col divide-y divide-line">
          {a.replacements.map((r, i) => (
            <li key={r.id ?? `${r.replacedName}-${i}`} className="grid gap-1 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
              <div>
                <StatusChip label={r.timeliness} tone={r.timeliness === "Menunggu" ? "warning" : "critical"} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {r.replacedName}
                  {multiStation && r.station ? <span className="font-normal text-ink-muted"> · {r.station}</span> : null}
                </p>
                {r.reason ? <p className="text-sm text-ink-muted">{r.reason}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </Group>,
    );
  }

  return (
    <Panel
      id="perlu-ditangani"
      title="Perlu ditangani"
      description="Diurutkan dari yang paling mendesak. Tiap bagian membuka sheet tempat datanya diisi."
    >
      {isQuiet(a) ? (
        <EmptyState title="Tidak ada yang mendesak saat ini" layout="inline">
          Tidak ada tindak lanjut lewat atau jatuh tempo dalam 7 hari, tidak ada yang terlambat cek BMI, semua SDM aktif
          sudah dinilai minggu ini, setiap peserta Failed sudah punya remedial, dan Remark training cocok dengan hasil
          hitung.
        </EmptyState>
      ) : (
        <div className="-my-4 flex flex-col divide-y divide-line">{groups}</div>
      )}
    </Panel>
  );
}

function More({ count, noun, children }: { count: number; noun: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-brand underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">
          Tampilkan {count} {noun} lainnya
        </span>
        <span className="hidden group-open:inline">
          Sembunyikan {count} {noun} lainnya
        </span>
      </summary>
      {children}
    </details>
  );
}

function DueList({ items, links }: { items: Attention["dueItems"]; links: SheetLinks }) {
  return (
    <ul className="flex flex-col divide-y divide-line border-y border-line">
      {items.map((d) => (
        <li key={d.code} className="grid gap-1 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={d.flag} tone={d.flag === "OVERDUE" ? "critical" : "warning"} />
            <span className="text-xs font-semibold text-ink sm:hidden">
              {relativeDays(d.daysLeft)}, batas <Tanggal date={d.dueDate} />
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm">
              <Link
                href={links.to("tindakLanjut", undefined, `tl-${d.code}`)}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2 sm:min-h-0"
              >
                {d.code}
              </Link>
              {d.aspect ? <span className="text-ink-muted"> · {d.aspect}</span> : null}
            </p>
            {d.action ? (
              <p className="line-clamp-2 text-sm text-ink sm:line-clamp-1" title={d.action}>
                {d.action}
              </p>
            ) : null}
            <p className="truncate text-xs text-ink-muted">
              {d.status ?? "Belum Mulai"}
              {d.group ? ` · ${d.group}` : ""}
              {d.pic ? ` · PIC ${d.pic}` : ""}
            </p>
          </div>
          <p className="hidden text-right text-xs text-ink-muted sm:block">
            <span className="block font-semibold text-ink">{relativeDays(d.daysLeft)}</span>
            Batas <Tanggal date={d.dueDate} />
          </p>
        </li>
      ))}
    </ul>
  );
}

function Group({
  title,
  summary,
  action,
  children,
}: {
  title: string;
  summary: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-ink-muted">{summary}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {children}
    </section>
  );
}

/** Per station: how many, and the names while only a few remain. */
function StaffList({ group, multiStation }: { group: StaffGroup; multiStation: boolean }) {
  const named = (n: number) => n <= NAMED_MAX;
  if (!multiStation) {
    const s = group.stations[0];
    if (!s || !named(s.staff.length)) return null;
    return <p className="text-sm text-ink">{s.staff.map((m) => m.name).join(", ")}.</p>;
  }
  const items = group.stations.map((s) => (
    <li key={s.station} className="text-sm">
      <span className="font-semibold text-ink">{s.station}</span>{" "}
      <span className="text-ink-muted">
        {s.staff.length} dari {s.of}
        {named(s.staff.length) ? `: ${s.staff.map((m) => m.name).join(", ")}` : ""}
      </span>
    </li>
  ));
  const list = (children: ReactNode[]) => <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{children}</ul>;
  const shown = SHOWN * 2;
  if (items.length <= shown) return list(items);
  return (
    <>
      {list(items.slice(0, shown))}
      <More count={items.length - shown} noun="stasiun">
        {list(items.slice(shown))}
      </More>
    </>
  );
}
