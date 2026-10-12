/*
 * Table cell display for Beranda and Laporan. Number formats live in lib/format
 * (Indonesian decimal comma).
 */
import { cx } from "@/components/ui/cx";

/** A table cell value, or a muted dash with a spoken reason (default "kosong"). */
export function Value({
  value,
  format = String,
  emptyReason = "kosong",
}: {
  value: number | null | undefined;
  format?: (v: number) => string;
  emptyReason?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <>
        <span aria-hidden="true" className="text-ink-muted">
          –
        </span>
        <span className="sr-only">{emptyReason}</span>
      </>
    );
  }
  return <>{format(value)}</>;
}

/** A count that needs action reads in its status tone; zero stays quiet. */
export function Flagged({ n, tone }: { n: number; tone: "critical" | "warning" }) {
  if (n === 0) return <span className="tabular-nums">0</span>;
  return <span className={cx("font-semibold tabular-nums", tone === "critical" ? "text-critical" : "text-warning")}>{n}</span>;
}
