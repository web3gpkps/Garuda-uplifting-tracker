import { describe, expect, test } from 'bun:test';
import {
  OWNER_ACCESS,
  OWNER_ACCESS_KEY,
  SHEETS,
  hrefs,
  isNavActive,
  linkAccess,
  navSections,
  sheetLabel,
  toQuery,
} from './access';

const TOKEN = 'a'.repeat(48);

describe('workspace access', () => {
  test('link and owner access carry their base path and action key', () => {
    const link = linkAccess(TOKEN);
    expect(link).toEqual({ kind: 'link', token: TOKEN, key: TOKEN, basePath: `/s/${TOKEN}` });
    expect(OWNER_ACCESS).toEqual({ kind: 'owner', key: OWNER_ACCESS_KEY, basePath: '/admin' });
    // The owner key can never be mistaken for a token.
    expect(/^[0-9a-f]{48}$/i.test(OWNER_ACCESS_KEY)).toBe(false);
  });

  test('every sheet path hangs off the base path', () => {
    const owner = hrefs(OWNER_ACCESS);
    expect(owner.dashboard).toBe('/admin');
    expect(owner.sdm).toBe('/admin/sdm');
    expect(owner.tindakLanjut).toBe('/admin/tindak-lanjut');
    const link = hrefs(linkAccess(TOKEN));
    expect(link.dashboard).toBe(`/s/${TOKEN}`);
    expect(link.laporan).toBe(`/s/${TOKEN}/laporan`);
    expect(SHEETS.map((s) => s.label)).toEqual([
      'Beranda',
      'Laporan Mingguan',
      'Penilaian Mingguan',
      'Cek BMI',
      'Remedial',
      'Tindak Lanjut',
      'Data SDM',
      'Penggantian SDM',
    ]);
    // Route keys and paths never change with the labels.
    expect(owner.performa).toBe('/admin/performa');
    expect(owner.penggantian).toBe('/admin/penggantian');
    expect(SHEETS.some((s) => (s.key as string) === 'acuan' || (s.path as string) === '/acuan')).toBe(false);
    expect(sheetLabel('performa')).toBe('Penilaian Mingguan');
  });

  test('navigation is grouped; Tindak Lanjut only for KPS and owner; Pengelolaan only for owner', () => {
    const shape = (sections: ReturnType<typeof navSections>) =>
      sections.map((s) => [s.label, s.items.map((i) => i.label)]);

    expect(shape(navSections(linkAccess(TOKEN), false))).toEqual([
      ['Pantau', ['Beranda', 'Laporan Mingguan']],
      ['Input mingguan', ['Penilaian Mingguan', 'Cek BMI', 'Remedial']],
      ['Data', ['Data SDM', 'Penggantian SDM']],
    ]);
    expect(shape(navSections(linkAccess(TOKEN), true))[1]).toEqual([
      'Input mingguan',
      ['Penilaian Mingguan', 'Cek BMI', 'Remedial', 'Tindak Lanjut'],
    ]);
    const owner = navSections(OWNER_ACCESS, true);
    expect(shape(owner).at(-1)).toEqual(['Pengelolaan', ['Tautan Akses', 'Parameter', 'Sinkronisasi']]);
    expect(owner.flatMap((s) => s.items).find((i) => i.key === 'tautan')?.href).toBe('/admin/tautan');
    const home = owner[0].items[0];
    expect(home).toMatchObject({ href: '/admin', exact: true, label: 'Beranda' });
    expect(owner[1].items[0].shortLabel).toBe('Penilaian');
  });

  test('isNavActive: index pages match exactly, others match their children', () => {
    expect(isNavActive('/admin', { href: '/admin', exact: true })).toBe(true);
    expect(isNavActive('/admin/sdm', { href: '/admin', exact: true })).toBe(false);
    expect(isNavActive('/admin/sdm/x', { href: '/admin/sdm', exact: false })).toBe(true);
    expect(isNavActive('/admin/sdmx', { href: '/admin/sdm', exact: false })).toBe(false);
  });

  test('to() adds the query and hash, skipping empty values', () => {
    const links = hrefs(OWNER_ACCESS);
    expect(links.to('bmi', { periode: 2, stasiun: 'SUB' })).toBe('/admin/bmi?periode=2&stasiun=SUB');
    expect(links.to('performa', { minggu: 3, stasiun: null, tab: undefined, lp: false, cek: '' })).toBe(
      '/admin/performa?minggu=3',
    );
    expect(links.to('tindakLanjut', undefined, 'tl-GA-TL01')).toBe('/admin/tindak-lanjut#tl-GA-TL01');
    expect(links.to('dashboard')).toBe('/admin');
    expect(toQuery({ a: 'x y' })).toBe('?a=x+y');
  });
});
