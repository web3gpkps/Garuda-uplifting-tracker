/*
 * Copy guard (DESIGN.md Principle 4: product vocabulary, not spreadsheet vocabulary).
 * Scans every string literal, template text and JSX text in app/** and components/**
 * (tests and comments excluded) and fails on words that must never reach the screen.
 *
 * PENDING_SCREENS lists screen files that phase 2 is rewriting. Each entry is allowed to
 * fail for now; remove it as soon as its screen is redone. The test also fails when an
 * allowlisted file is already clean, so the list can only shrink.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const FORBIDDEN: Array<[RegExp, string]> = [
  [/PDF/, "PDF"],
  [/[Ss]lide/, "slide"],
  [/[Ww]orkbook/, "workbook"],
  [/sel kuning/i, "sel kuning"],
  [/Acuan/, "Acuan"],
  [/dummy/i, "dummy"],
  [/JOUMPA/, "JOUMPA"],
  [/Cara mengisi/i, "Cara mengisi"],
  [/\u2014/, "em dash"],
  [/\b[Ss]heet\b/, "sheet"],
];

/**
 * Screen files phase 2 is rewriting, all for the word "sheet" (the Sinkronisasi pages name
 * the Google Sheet replica; decide there whether "Google Sheet" stays as a product name and
 * narrow the pattern instead). Remove entries as screens are finished.
 */
const PENDING_SCREENS = new Set<string>([
  "app/admin/sinkronisasi/page.tsx",
  "components/admin/ConflictTable.tsx",
  "components/admin/sync-labels.ts",
  "components/ringkasan/RingkasanView.tsx",
  "components/sdm/DeleteStaffDialog.tsx",
  "components/tindak-lanjut/ActionRows.tsx",
  "components/tindak-lanjut/DeleteActionItemDialog.tsx",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

type Hit = { line: number; word: string; text: string };

/** Visible text in one file: string literals (not module paths), template pieces and JSX text. */
function hits(path: string): Hit[] {
  const text = readFileSync(path, "utf8");
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: Hit[] = [];
  const check = (node: ts.Node, value: string) => {
    for (const [pattern, word] of FORBIDDEN) {
      if (pattern.test(value)) {
        const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
        found.push({ line, word, text: value.trim().slice(0, 80) });
      }
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text);
    else if (ts.isJsxText(node)) check(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))].map((p) => ({
  path: p,
  rel: relative(ROOT, p).split("\\").join("/"),
}));

describe("UI copy uses product vocabulary", () => {
  test("no spreadsheet, PDF or placeholder wording outside the pending screens", () => {
    const failures = files
      .filter((f) => !PENDING_SCREENS.has(f.rel))
      .flatMap((f) => hits(f.path).map((h) => `${f.rel}:${h.line} [${h.word}] ${h.text}`));
    expect(failures).toEqual([]);
  });

  test("every pending screen still exists and still needs its allowlist entry", () => {
    const byRel = new Map(files.map((f) => [f.rel, f.path]));
    const stale = [...PENDING_SCREENS].filter((rel) => !byRel.has(rel) || hits(byRel.get(rel)!).length === 0);
    expect(stale).toEqual([]);
  });
});
