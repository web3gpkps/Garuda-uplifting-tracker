"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { isNavActive, type NavLink, type NavSection } from "@/lib/workspace/access";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

function navLinkClasses(active: boolean): string {
  return cx(
    "flex min-h-11 items-center rounded-control px-3 text-sm transition-colors duration-120 lg:min-h-9",
    active
      ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_#9be3a7]"
      : "text-[#d3e3e8] hover:bg-white/10 hover:text-white",
  );
}

/** The grouped nav list, shared by the sidebar (≥1024px) and the phone menu sheet. */
function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <div key={section.key}>
          <p className="nav-label mb-1 px-3">{section.label}</p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={navLinkClasses(active)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sidebar navigation (≥1024px). Client only for the active item. */
export function SidebarNav({ sections, label }: { sections: NavSection[]; label: string }) {
  return (
    <nav aria-label={label}>
      <NavList sections={sections} />
    </nav>
  );
}

type MobileChromeProps = {
  /** Same groups as the sidebar. */
  sections: NavSection[];
  /** Phone bottom bar links (<640px), three at most; "Menu" is added after them. */
  bottomItems: NavLink[];
  /** Accessible name of the nav landmarks, e.g. "Menu Stasiun CGK". */
  label: string;
  /** Logos at 20px, rendered on the server. */
  brand: ReactNode;
  /** Where the logos lead (Beranda). */
  homeHref: string;
  /** Short scope next to the logos: a station code ("CGK", "KPS") or "Pemilik". */
  scopeShort: string;
  /** Top of the sheet: scope line and programme week. */
  sheetHeader: ReactNode;
  /** Bottom of the sheet: link label, or the owner's email and "Keluar". */
  sheetFooter?: ReactNode;
};

/**
 * Chrome under 1024px: a 56px top bar (logos, scope code, "Menu") and, under 640px, a bottom
 * bar (Beranda, Penilaian, Cek BMI, Menu). Both "Menu" buttons open the same left sheet on a
 * native modal <dialog>: the page behind is inert, Tab cycles inside, Escape and the backdrop
 * close it, and focus returns to the button that opened it.
 */
export function MobileChrome({
  sections,
  bottomItems,
  label,
  brand,
  homeHref,
  scopeShort,
  sheetHeader,
  sheetFooter,
}: MobileChromeProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const sheetId = useId();
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      setOpen(false);
    };
    const onClose = () => {
      const target = returnFocusTo.current;
      returnFocusTo.current = null;
      if (target?.isConnected) target.focus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const close = () => setOpen(false);
  const menuButton = (extra: string) => (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={sheetId}
      onClick={() => setOpen(true)}
      className={extra}
    >
      <span aria-hidden="true" className="flex w-4 flex-col gap-[3px]">
        <span className="h-0.5 bg-current" />
        <span className="h-0.5 bg-current" />
        <span className="h-0.5 bg-current" />
      </span>
      Menu
    </button>
  );

  return (
    <>
      <header
        data-print="hide"
        className="sticky top-0 z-30 flex h-(--topbar-height) items-center gap-3 border-b border-line bg-surface px-4 shadow-card sm:px-6 lg:hidden"
      >
        <Link href={homeHref} aria-label="Beranda" className="flex shrink-0 items-center rounded-control">
          {brand}
        </Link>
        <span className="station-code min-w-0 truncate border-l border-line pl-3 text-sm text-ink">{scopeShort}</span>
        {menuButton(
          "ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors duration-120 hover:bg-bg",
        )}
      </header>

      <nav
        aria-label={`${label}, pintasan`}
        data-print="hide"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="grid h-(--bottombar-height) grid-cols-4">
          {bottomItems.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <li key={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex flex-1 flex-col items-center justify-center text-xs",
                    active ? "font-semibold text-brand" : "text-ink-muted",
                  )}
                >
                  <span aria-hidden="true" className={cx("mb-1 h-0.5 w-6 rounded-status", active ? "bg-brand" : "bg-transparent")} />
                  {item.shortLabel}
                </Link>
              </li>
            );
          })}
          <li className="flex">
            {menuButton("flex flex-1 flex-col items-center justify-center gap-1 text-xs text-ink-muted")}
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        id={sheetId}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className={cx(
          "on-navy fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none border-0 bg-navy p-0 text-white shadow-float",
          "open:flex open:flex-col backdrop:bg-ink/40",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/15 px-4 py-3">
          <div id={titleId} className="min-w-0">
            {sheetHeader}
          </div>
          <button
            type="button"
            onClick={close}
            className="-mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control text-sm font-semibold text-[#d3e3e8] hover:bg-white/10 hover:text-white"
          >
            Tutup
          </button>
        </div>
        <nav aria-label={label} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4">
          <NavList sections={sections} onNavigate={close} />
        </nav>
        {sheetFooter ? <div className="border-t border-white/15 px-4 py-3">{sheetFooter}</div> : null}
      </dialog>
    </>
  );
}
