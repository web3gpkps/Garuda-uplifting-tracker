import type { ReactNode } from "react";

/**
 * The page banner of Cek BMI (the shared .hero gradient). The station chip names the scope;
 * the buttons inside `.hero-actions` are restyled for the dark banner by app/globals.css.
 * Server-component friendly.
 */
export function BmiHero({ chip, children }: { chip?: string; children?: ReactNode }) {
  return (
    <header className="hero bmi-hero">
      <div className="bmi-hero-copy">
        <p className="hero-eyebrow">GA Health &amp; Vitality Campaign</p>
        <h1>BMI Monitoring Tracker</h1>
        <p className="bmi-hero-desc">Kelola pemeriksaan berkala, pantau kategori BMI, dan tindak lanjut kesehatan petugas.</p>
      </div>
      {chip || children ? (
        <div className="hero-actions bmi-hero-actions" data-print="hide">
          {chip ? (
            <span className="bmi-hero-station">
              <i className="bmi-dot" aria-hidden="true" />
              {chip}
            </span>
          ) : null}
          {children}
        </div>
      ) : null}
    </header>
  );
}
