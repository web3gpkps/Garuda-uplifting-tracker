/**
 * Share-link scopes and the shapes the Tautan stasiun screen passes around.
 * A scope is "KPS" (head office, every station) or a station code from public.stations;
 * the list of stations comes from the database, never from this file.
 */

export const KPS_SCOPE = "KPS";

/** Same shape as the share_links_scope_check constraint. Existence is checked against public.stations. */
const SCOPE_FORMAT = /^[A-Z0-9]{2,5}$/;

export function isScopeFormat(value: string): boolean {
  return value === KPS_SCOPE || SCOPE_FORMAT.test(value);
}

/** KPS first, then the stations in the stations table's order. */
export function linkScopes(stationCodes: readonly string[]): string[] {
  return [KPS_SCOPE, ...stationCodes.filter((code) => code !== KPS_SCOPE)];
}

/** What a scope opens, in the words the share page itself uses (lib/workspace scopeLabel). */
export function scopeDescription(scope: string): string {
  if (scope === KPS_SCOPE) {
    return "KPS: semua stasiun, termasuk baseline training SDM dan pembaruan Tindak Lanjut nasional.";
  }
  return `Stasiun ${scope}: SDM, nilai mingguan, cek BMI, remedial, penggantian, dan temuan ${scope} saja. Tindak Lanjut hanya dibaca.`;
}

export function scopeName(scope: string): string {
  return scope === KPS_SCOPE ? "KPS" : `Stasiun ${scope}`;
}

export type LinkRow = {
  id: string;
  scope: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  /** Full URL for active links (the owner can copy it again); null once revoked. */
  url: string | null;
  /** Labels starting with "QA test" mark temporary links made for testing. */
  isQa: boolean;
};

export type NewLink = { scope: string; label: string | null; url: string };

export type LinkActionResult =
  | { ok: true; link?: NewLink; message: string }
  | { ok: false; message: string; fieldErrors?: { scope?: string; label?: string } };
