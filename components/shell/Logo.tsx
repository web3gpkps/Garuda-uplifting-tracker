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

function PartnerLogo({ src, alt, height, eager }: { src: StaticImageData; alt: string; height: number; eager: boolean }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={Math.round(height * (src.width / src.height))}
      height={height}
      loading={eager ? "eager" : "lazy"}
      className="w-auto max-w-none shrink-0"
      style={{ height, aspectRatio: `${src.width} / ${src.height}` }}
    />
  );
}

type LogoProps = {
  /**
   * Height of the lockup in px (the Gapura logo; Garuda follows at 0.78 of it).
   * DESIGN.md sizes: sidebar 24, phone top bar 20, login 36, printed report 32.
   */
  height: 20 | 24 | 32 | 36;
  /** Logos sit at the top of every screen, so they load eagerly by default. */
  eager?: boolean;
  className?: string;
};

/**
 * Co-brand lockup: Garuda Indonesia, a 1px --line divider, then Gapura Airport Services.
 * Server-component friendly.
 */
export function Logo({ height, eager = true, className }: LogoProps) {
  return (
    <span className={cx("inline-flex shrink-0 items-center", className)} style={{ gap: Math.round(height / 3) }}>
      <PartnerLogo src={garuda} alt="Garuda Indonesia" height={Math.round(height * 0.78)} eager={eager} />
      <span aria-hidden="true" className="w-px shrink-0 self-stretch bg-line" />
      <PartnerLogo src={gapura} alt="Gapura Airport Services" height={height} eager={eager} />
    </span>
  );
}
