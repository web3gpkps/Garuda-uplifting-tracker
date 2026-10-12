import Link from "next/link";
import { formatPercent, type DashboardLink, type Tile, type Tone } from "@/lib/dashboard";
import type { SheetLinks } from "@/lib/workspace/access";
import { StatusChip } from "@/components/ui/StatusChip";
import { cx } from "@/components/ui/cx";

export function linkTo(links: SheetLinks, link: DashboardLink): string {
  return links.to(link.sheet, link.query);
}

const valueTone: Record<Tone, string> = {
  good: "text-good",
  warning: "text-warning",
  critical: "text-critical",
  neutral: "text-ink",
};

function spokenValue(tile: Tile): string {
  if (tile.value === null) return tile.note ?? "belum ada data";
  const value = tile.format === "percent" ? formatPercent(tile.value) : String(tile.value);
  return tile.total !== null ? `${value} dari ${tile.total}` : value;
}

/**
 * One dashboard number (docs/UX.md §3): a real value with its target, the PDF baseline and
 * its basis in words, linking to the sheet behind it. Never an invented delta; before there
 * is anything to measure it says so (note) instead of showing 0. Server-component friendly.
 */
export function KpiTile({ tile, href }: { tile: Tile; href: string }) {
  const spoken = [
    `${tile.label}: ${spokenValue(tile)}`,
    tile.target,
    tile.baseline,
    tile.status && tile.value !== null ? tile.status : null,
    tile.detail,
    tile.basis,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Link
      href={href}
      aria-label={spoken}
      className="group flex min-h-32 w-full flex-col gap-1.5 rounded-panel border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong"
    >
      <span className="text-sm font-semibold text-ink-muted">{tile.label}</span>
      {tile.value === null ? (
        <span className="text-sm font-semibold text-ink">{tile.note ?? "Belum ada data."}</span>
      ) : (
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className={cx("text-2xl font-semibold tabular-nums", valueTone[tile.tone])}>
            {tile.format === "percent" ? formatPercent(tile.value) : tile.value}
          </span>
          {tile.total !== null ? <span className="text-sm text-ink-muted tabular-nums">dari {tile.total}</span> : null}
        </span>
      )}
      {tile.target || tile.baseline ? (
        <span className="text-xs text-ink tabular-nums">{[tile.target, tile.baseline].filter(Boolean).join(" · ")}</span>
      ) : null}
      {tile.status && tile.value !== null ? (
        <span>
          <StatusChip label={tile.status} tone={tile.tone} />
        </span>
      ) : null}
      {tile.detail ? <span className="text-xs font-semibold text-ink tabular-nums">{tile.detail}</span> : null}
      <span className="mt-auto text-xs text-ink-muted">{tile.basis}</span>
    </Link>
  );
}

/** A strip of tiles from lib/dashboard, linked through hrefs(access). Two per row on phones. */
export function KpiStrip({ tiles, links, label }: { tiles: Tile[]; links: SheetLinks; label: string }) {
  const cols = tiles.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";
  return (
    <ul aria-label={label} className={cx("grid grid-cols-1 gap-3 min-[420px]:grid-cols-2", cols)}>
      {tiles.map((tile, i) => (
        <li
          key={tile.key}
          className={cx(
            "flex",
            tiles.length % 2 === 1 && i === tiles.length - 1 ? "min-[420px]:col-span-2 lg:col-span-1" : undefined,
          )}
        >
          <KpiTile tile={tile} href={linkTo(links, tile.link)} />
        </li>
      ))}
    </ul>
  );
}
