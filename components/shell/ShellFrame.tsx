import Link from "next/link";
import type { ReactNode } from "react";
import { TableSkeleton } from "@/components/ui/States";
import { BOTTOM_BAR_KEYS, type NavSection } from "@/lib/workspace/access";
import { Logo } from "./Logo";
import { MobileChrome, SidebarNav } from "./ShellNav";

/** Page gutter (16 phone, 24 from 640, 32 from 1280) and section rhythm, for content outside the shell. */
export const pageGutter = "px-4 sm:px-6 xl:px-8";

type ShellFrameProps = {
  /** Grouped navigation from navSections(access, isKps). */
  sections: NavSection[];
  /** Where the logos lead (Beranda). */
  homeHref: string;
  /** Scope line under the logos: "Stasiun CGK", "KPS · semua stasiun", "Pemilik · semua stasiun". */
  scopeLabel: string;
  /** Short scope for the phone top bar: a station code ("CGK", "KPS") or "Pemilik". */
  scopeShort: string;
  /** Programme line under the scope ("Minggu ke-2 dari 10"), caption muted. Optional. */
  weekLine?: ReactNode;
  /** Sidebar / sheet footer: the link label, or the owner's email and "Keluar". */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The app shell (DESIGN.md Shell and navigation), shared by station links and the owner.
 * ≥1024px: fixed 232px white sidebar (logos, scope line, programme week, grouped nav, footer).
 * <1024px: 56px top bar with a "Menu" sheet; <640px also a bottom bar. Chrome is hidden in print.
 * Server component; only the nav (active state, sheet) runs on the client.
 */
export function ShellFrame({ sections, homeHref, scopeLabel, scopeShort, weekLine, footer, children }: ShellFrameProps) {
  const allLinks = sections.flatMap((s) => s.items);
  const bottomItems = BOTTOM_BAR_KEYS.map((key) => allLinks.find((l) => l.key === key)).filter((l) => l !== undefined);
  const navLabel = `Menu ${scopeLabel}`;
  const scopeBlock = (
    <>
      <p className="text-sm font-semibold text-white">{scopeLabel}</p>
      {weekLine ? <p className="text-xs text-[#b6ced4]">{weekLine}</p> : null}
    </>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#isi"
        className="sr-only z-50 rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink shadow-float focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Lewati ke isi halaman
      </a>

      <aside
        data-print="hide"
        className="on-navy fixed inset-y-0 left-0 z-20 hidden w-(--sidebar-width) flex-col bg-navy text-white lg:flex"
      >
        <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
          <Link href={homeHref} aria-label="Beranda" className="self-start rounded-control bg-white px-3 py-2">
            <Logo height={24} />
          </Link>
          <div className="min-w-0">{scopeBlock}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
          <SidebarNav sections={sections} label={navLabel} />
        </div>
        {footer ? <div className="border-t border-white/15 px-5 py-3">{footer}</div> : null}
      </aside>

      <MobileChrome
        sections={sections}
        bottomItems={bottomItems}
        label={navLabel}
        brand={<Logo height={20} />}
        homeHref={homeHref}
        scopeShort={scopeShort}
        sheetHeader={scopeBlock}
        sheetFooter={footer}
      />

      <div data-shell-main="" className="lg:pl-(--sidebar-width)">
        <main
          id="isi"
          data-shell-main=""
          className={`${pageGutter} mx-auto w-full max-w-[1440px] pt-6 pb-[calc(var(--bottombar-height)+env(safe-area-inset-bottom)+24px)] sm:pb-8`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Static shell shown while a gate runs. Prerendered, so it reads no request data and
 * renders no client nav (usePathname would block prerendering): logos, scope, skeleton.
 */
export function ShellLoading({ scopeLabel }: { scopeLabel: string }) {
  return (
    <div className="min-h-dvh">
      <aside
        data-print="hide"
        className="fixed inset-y-0 left-0 z-20 hidden w-(--sidebar-width) flex-col gap-3 bg-navy px-5 pt-5 lg:flex"
      >
        <span className="self-start rounded-control bg-white px-3 py-2">
          <Logo height={24} />
        </span>
        <p className="text-sm font-semibold text-white">{scopeLabel}</p>
      </aside>
      <header
        data-print="hide"
        className="sticky top-0 z-30 flex h-(--topbar-height) items-center border-b border-line bg-surface px-4 sm:px-6 lg:hidden"
      >
        <Logo height={20} />
      </header>
      <div data-shell-main="" className="lg:pl-(--sidebar-width)">
        <main data-shell-main="" className={`${pageGutter} mx-auto flex w-full max-w-[1440px] flex-col gap-6 py-6`}>
          <div aria-hidden="true" className="h-7 w-48 rounded-control bg-neutral-tint" />
          <TableSkeleton rows={6} label="Membuka halaman" />
        </main>
      </div>
    </div>
  );
}
