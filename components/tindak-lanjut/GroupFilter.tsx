import Link from "next/link";
import { cx } from "@/components/ui/cx";

export type GroupFilterOption = { key: string | null; label: string; meta: string; metaLabel: string; href: string };

/**
 * Filter by Kelompok (Coaching Frontliner, Timeline Training, Evaluasi IULS & RUST): real
 * links (?kelompok=), styled like the station filter on the other sheets.
 */
export function GroupFilter({ options, current }: { options: GroupFilterOption[]; current: string | null }) {
  return (
    <nav aria-label="Filter kelompok" className="flex flex-col gap-1.5" data-print="hide">
      <p className="section-label">Kelompok</p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.key === current;
          return (
            <li key={option.key ?? "semua"}>
              <Link
                href={option.href}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cx(
                  "inline-flex min-h-11 items-center gap-2 rounded-control border px-3 text-sm whitespace-nowrap sm:min-h-9",
                  "transition-colors duration-120",
                  active
                    ? "border-brand bg-brand-tint font-semibold text-ink"
                    : "border-line-strong bg-surface text-ink hover:bg-neutral-tint",
                )}
              >
                {option.label}
                <span aria-hidden="true" className="text-xs text-ink-muted tabular-nums">
                  {option.meta}
                </span>
                <span className="sr-only">, {option.metaLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
