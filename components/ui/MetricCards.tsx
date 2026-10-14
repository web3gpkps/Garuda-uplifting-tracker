import type { ReactNode } from "react";
import { cx } from "./cx";

export type Metric = {
  label: string;
  value: ReactNode;
  /** One short line under the value, e.g. "Cek ke-1 · 67% selesai". */
  foot?: string;
  /** Colours the value for exceptions; default is ink. */
  tone?: "good" | "critical" | "warning";
  /** 0..100: draws a thin progress bar under the foot. */
  progress?: number;
};

const valueTone = { good: "text-good", critical: "text-critical", warning: "text-warning" } as const;
const barTone = { good: "bg-good", critical: "bg-critical", warning: "bg-warning" } as const;

/** Four-up summary cards above a table. Server-component friendly; hidden when printing. */
export function MetricCards({ items, label }: { items: Metric[]; label: string }) {
  return (
    <section aria-label={label} data-print="hide" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map((m) => (
        <div key={m.label} className="min-w-0 rounded-panel border border-line bg-surface p-4 shadow-card sm:p-5">
          <p className="text-xs text-ink-muted">{m.label}</p>
          <p data-numeric className={cx("mt-2 text-[28px] leading-9 font-semibold", m.tone ? valueTone[m.tone] : "text-ink")}>
            {m.value}
          </p>
          {m.foot ? <p className="mt-1 text-xs text-ink-muted">{m.foot}</p> : null}
          {m.progress !== undefined ? (
            <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-tint">
              <div
                className={cx("h-full rounded-full", m.tone ? barTone[m.tone] : "bg-brand")}
                style={{ width: `${Math.max(0, Math.min(100, m.progress))}%` }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
