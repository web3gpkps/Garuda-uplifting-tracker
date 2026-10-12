"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { isActive, type NavItem } from "./nav-items";

type ShellNavProps = {
  /** Logos + context (product, scope), rendered on the server and passed in. */
  brand: ReactNode;
  /** Sections. Plain data, so a server component can build them (e.g. per token). */
  items: NavItem[];
  /** Right side of row 1 on desktop, bottom of the menu on phones (user + sign-out, link label). */
  aside?: ReactNode;
  /** Accessible name of the nav landmark. */
  label: string;
};

const MORE_LABEL = "Lainnya";

function linkClasses(active: boolean): string {
  return cx(
    "flex min-h-11 items-center px-3 font-semibold whitespace-nowrap transition-colors duration-150",
    // Phones and tablets: full-width 44 px rows, the current one on --brand-tint.
    "rounded-control text-base",
    active ? "bg-brand-tint text-ink" : "text-ink-muted hover:bg-neutral-tint hover:text-ink",
    // From 900 px: a horizontal row; the current section gets a 2 px --brand underline.
    "nav:-mb-px nav:rounded-none nav:border-b-2 nav:bg-transparent nav:text-sm nav:hover:bg-transparent",
    active ? "nav:border-brand" : "nav:border-transparent nav:hover:border-line-strong",
  );
}

/** Desktop divider before a group (e.g. the owner-only pages after the workbook sheets). */
function GroupDivider() {
  return <span aria-hidden="true" className="mx-2 hidden h-5 w-px shrink-0 bg-line-strong nav:block" />;
}

/**
 * How many items fit in the desktop row next to the "Lainnya" button. Reads widths from the
 * invisible measuring row, so hidden items still have a size. Under 900 px (column layout)
 * every item is shown in the menu.
 */
function fitCount(row: HTMLElement, measure: HTMLElement, total: number): number {
  if (getComputedStyle(row).flexDirection !== "row") return total;
  const cells = Array.from(measure.children) as HTMLElement[];
  const widths = cells.slice(0, total).map((el) => el.getBoundingClientRect().width);
  const moreWidth = cells[total]?.getBoundingClientRect().width ?? 0;
  const available = row.clientWidth;
  if (widths.reduce((a, b) => a + b, 0) <= available) return total;
  let used = moreWidth;
  let count = 0;
  while (count < total && used + widths[count] <= available) {
    used += widths[count];
    count++;
  }
  return count;
}

/**
 * Top bar rows 1 and 2 for both shells. Under 900 px the nav collapses behind a labelled
 * "Menu" disclosure; Escape closes it and returns focus to the button. From 900 px the
 * sections sit in one row; the ones that do not fit move, in order, into a "Lainnya" menu
 * at the end of the row (9 sheets plus 3 owner pages do not fit until about 1250 px).
 */
export function ShellNav({ brand, items, aside, label }: ShellNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [visible, setVisible] = useState(items.length);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const measureRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const update = () => setVisible(fitCount(row, measure, items.length));
    update();
    // The row changes with the window; the measuring row changes when the web font arrives.
    const observer = new ResizeObserver(update);
    observer.observe(row);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (!open && !moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moreOpen) {
        setMoreOpen(false);
        moreRef.current?.focus();
      } else {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (moreOpen && !moreMenuRef.current?.contains(target) && !moreRef.current?.contains(target)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, moreOpen]);

  const overflow = items.slice(visible);
  const activeHidden = overflow.some((item) => isActive(pathname, item));
  // A hidden overflow item keeps its group heading in the menu even when the group starts in the row.
  const overflowGroup = (i: number): string | undefined => {
    if (overflow[i].groupLabel || i > 0) return overflow[i].groupLabel;
    for (let j = visible - 1; j >= 0; j--) if (items[j].groupLabel) return items[j].groupLabel;
    return undefined;
  };

  return (
    <>
      <div className="flex min-h-14 items-center gap-3 py-2 nav:py-0">
        {brand}
        {aside ? (
          <div className="ml-auto hidden max-w-[24rem] min-w-0 items-center gap-3 nav:flex">{aside}</div>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="menu-utama"
          onClick={() => setOpen((value) => !value)}
          className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-neutral-tint sm:self-center nav:hidden"
        >
          <span aria-hidden="true" className="flex w-4 flex-col gap-[3px]">
            <span className="h-0.5 bg-ink" />
            <span className="h-0.5 bg-ink" />
            <span className="h-0.5 bg-ink" />
          </span>
          {open ? "Tutup menu" : "Menu"}
        </button>
      </div>

      <div
        id="menu-utama"
        className={cx(open ? "block" : "hidden", "relative pb-3 nav:block nav:border-b nav:border-line nav:pb-0")}
      >
        <nav aria-label={label}>
          <ul ref={rowRef} className="flex flex-col gap-1 nav:-mx-3 nav:flex-row nav:flex-nowrap nav:gap-0 nav:overflow-x-clip">
            {items.map((item, i) => {
              const active = isActive(pathname, item);
              return (
                <li
                  key={item.href}
                  className={cx(
                    item.groupLabel && "mt-3 nav:mt-0 nav:flex nav:items-center",
                    i >= visible && "nav:hidden",
                  )}
                >
                  {item.groupLabel ? (
                    <>
                      {/* Phones: a small heading. Desktop: a thin divider before the group. */}
                      <span className="section-label mb-1 block px-3 nav:hidden">{item.groupLabel}</span>
                      <GroupDivider />
                    </>
                  ) : null}
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={linkClasses(active)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {overflow.length > 0 ? (
              <li className="relative hidden nav:block">
                <button
                  ref={moreRef}
                  type="button"
                  aria-expanded={moreOpen}
                  aria-controls="menu-lainnya"
                  onClick={() => setMoreOpen((value) => !value)}
                  className={cx(linkClasses(activeHidden), "gap-1.5")}
                >
                  {MORE_LABEL}
                  {activeHidden ? <span className="sr-only">, berisi halaman yang sedang dibuka</span> : null}
                  <span aria-hidden="true" className={cx("text-xs transition-transform duration-150", moreOpen && "rotate-180")}>
                    ▾
                  </span>
                </button>
                <div
                  ref={moreMenuRef}
                  id="menu-lainnya"
                  hidden={!moreOpen}
                  className="absolute right-0 z-20 mt-1 w-60 rounded-panel border border-line bg-surface p-1.5 shadow-float"
                >
                  <ul className="flex flex-col gap-0.5">
                    {overflow.map((item, i) => {
                      const active = isActive(pathname, item);
                      const group = overflowGroup(i);
                      return (
                        <li key={item.href} className={cx(group && i > 0 && "mt-1.5 border-t border-line pt-1.5")}>
                          {group ? <span className="section-label block px-2.5 pt-1 pb-0.5">{group}</span> : null}
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            onClick={() => setMoreOpen(false)}
                            className={cx(
                              "flex min-h-10 items-center rounded-control px-2.5 text-sm font-semibold transition-colors duration-150",
                              active ? "bg-brand-tint text-ink" : "text-ink-muted hover:bg-neutral-tint hover:text-ink",
                            )}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            ) : null}
          </ul>
        </nav>

        {/* Same items, never shown or focusable: gives fitCount() the width of every cell. */}
        <ul
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-0 hidden h-0 overflow-hidden nav:flex"
        >
          {items.map((item) => (
            <li key={item.href} className={cx("shrink-0", item.groupLabel && "flex items-center")}>
              {item.groupLabel ? <GroupDivider /> : null}
              <span className={linkClasses(false)}>{item.label}</span>
            </li>
          ))}
          <li className="shrink-0">
            <span className={cx(linkClasses(false), "gap-1.5")}>
              {MORE_LABEL}
              <span className="text-xs">▾</span>
            </span>
          </li>
        </ul>

        {aside ? (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 nav:hidden">
            {aside}
          </div>
        ) : null}
      </div>
    </>
  );
}
