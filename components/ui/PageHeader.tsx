import type { ReactNode } from "react";
import { cx } from "./cx";
import { TableSkeleton } from "./States";

type PageHeaderProps = {
  /** The page's h1 (20/600). One per page. */
  title: ReactNode;
  /**
   * At most one meta line (13, muted): counts and nouns, never a sentence of explanation.
   * e.g. "CGK · Minggu ke-2 · 31 dari 45 dinilai".
   */
  meta?: ReactNode;
  /** Page actions on the right (wrap below the title on phones). At most one primary. */
  actions?: ReactNode;
  /** Optional row under the title, e.g. a <Toolbar>. Prefer placing the Toolbar right after the header. */
  children?: ReactNode;
  className?: string;
};

/** Page title block (DESIGN.md PageHeader). No description. Server-component friendly. */
export function PageHeader({ title, meta, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {meta ? <p className="mt-0.5 text-xs text-ink-muted">{meta}</p> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2" data-print="hide">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/** Suspense fallback for a page: its title right away, then static skeleton rows. */
export function PageLoading({ title, label }: { title: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <TableSkeleton label={label} />
    </div>
  );
}
