import type { CSSProperties } from "react";
import Image, { type StaticImageData } from "next/image";
import garuda from "@/public/brand/garuda-indonesia.png";
import gapura from "@/public/brand/gapura-airport-services.png";
import { cx } from "@/components/ui/cx";

/*
 * The two official logos, never stretched, recoloured, cropped or redrawn. Each is drawn at
 * a set height with `width: auto` and its own aspect ratio (Garuda 315 × 61, Gapura
 * 1052 × 569); the boxes cannot shrink, so a narrow parent cannot squash them.
 *
 * Optical balance: the Garuda wordmark fills most of its file's height while the Gapura word
 * sits in the lower half of a tall mark, so the Garuda logo is drawn at 0.78 of the Gapura
 * height. At that ratio both wordmarks read at about the same letter size.
 */

type PartnerLogoProps = {
  src: StaticImageData;
  alt: string;
  /** Rendered height used for the intrinsic width/height attributes (CSS sets the real one). */
  height: number;
  eager: boolean;
  className: string;
};

function PartnerLogo({ src, alt, height, eager, className }: PartnerLogoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={Math.round(height * (src.width / src.height))}
      height={height}
      loading={eager ? "eager" : "lazy"}
      className={cx("w-auto max-w-none shrink-0", className)}
      style={{ aspectRatio: `${src.width} / ${src.height}` }}
    />
  );
}

type LogoProps = {
  /**
   * Height of the Gapura logo in px; the Garuda logo follows at 0.78 of it. DESIGN.md sizes:
   * app header 36 (28 on phones), login 64, share page header 40, printed report 48.
   */
  height?: number;
  /** Height under 640 px, where the header also has to fit the scope and the menu button. */
  compactHeight?: number;
  /**
   * Logos sit at the top of every screen, so they load eagerly by default
   * (Next 16: `priority` is deprecated; eager loading is the replacement).
   */
  eager?: boolean;
  /**
   * Keep clear space around the lockup (25 % of the height on every side) as padding.
   * Default true; turn off only when the parent already reserves it.
   */
  clearSpace?: boolean;
  className?: string;
};

/**
 * Co-brand lockup: Garuda Indonesia first (the programme owner), a thin divider, then
 * Gapura Airport Services (the handling partner whose frontliners are tracked).
 * Sizes come from two CSS variables, so one render serves phones and desktops.
 */
export function Logo({ height = 36, compactHeight, eager = true, clearSpace = true, className }: LogoProps) {
  const small = compactHeight ?? height;
  const vars = { "--lh": `${height}px`, "--lh-sm": `${small}px` } as CSSProperties;
  return (
    <span
      style={vars}
      className={cx(
        "inline-flex shrink-0 items-center",
        "gap-[calc(var(--lh-sm)*0.33)] sm:gap-[calc(var(--lh)*0.33)]",
        clearSpace && "p-[calc(var(--lh-sm)*0.25)] sm:p-[calc(var(--lh)*0.25)]",
        className,
      )}
    >
      <PartnerLogo
        src={garuda}
        alt="Garuda Indonesia"
        height={Math.round(height * 0.78)}
        eager={eager}
        className="h-[calc(var(--lh-sm)*0.78)] sm:h-[calc(var(--lh)*0.78)]"
      />
      <span aria-hidden="true" className="h-[calc(var(--lh-sm)*0.8)] w-px shrink-0 bg-line-strong sm:h-[calc(var(--lh)*0.8)]" />
      <PartnerLogo
        src={gapura}
        alt="Gapura Airport Services"
        height={height}
        eager={eager}
        className="h-(--lh-sm) sm:h-(--lh)"
      />
    </span>
  );
}
