import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

type BrandProps = {
  /** Where the logo leads: the shell's home (/admin, or /s/<token>). */
  href: string;
  /** Accessible name of the logo link, e.g. "Dashboard, Stasiun CGK". */
  linkLabel: string;
  /** Main line next to the logos: the scope in the workspace, the area name for the owner. */
  title: ReactNode;
  /** Muted second line. */
  subtitle?: ReactNode;
};

/** Negative margin equal to the lockup's clear space, so the visible logo edge lines up with the page. */
export const LOGO_EDGE = "-ml-[calc(var(--lh-sm)*0.25)] sm:-ml-[calc(var(--lh)*0.25)]";

/**
 * Co-brand lockup (36 px, 26 px on phones) plus who/where you are. On phones the scope
 * moves under the logos instead of being truncated next to them: it is the line that
 * tells a station PIC which station they are editing. Server-component friendly.
 */
export function Brand({ href, linkLabel, title, subtitle }: BrandProps) {
  return (
    <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-3">
      <Link href={href} aria-label={linkLabel} className="shrink-0 self-start rounded-control sm:self-auto">
        <Logo height={36} compactHeight={26} className={LOGO_EDGE} />
      </Link>
      <div className="min-w-0 pb-1 sm:border-l sm:border-line sm:pb-0 sm:pl-3">
        <p className="truncate text-sm font-semibold text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-ink-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
