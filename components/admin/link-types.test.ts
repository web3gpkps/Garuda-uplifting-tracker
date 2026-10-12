import { describe, expect, test } from "bun:test";
import { isScopeFormat, linkScopes, scopeDescription, scopeName } from "./link-types";

describe("link scopes", () => {
  test("KPS first, then the stations from the table in their order", () => {
    expect(linkScopes(["AAP", "CGK", "UPG"])).toEqual(["KPS", "AAP", "CGK", "UPG"]);
    expect(linkScopes([])).toEqual(["KPS"]);
  });

  test("format matches share_links_scope_check", () => {
    expect(isScopeFormat("KPS")).toBe(true);
    expect(isScopeFormat("CGK")).toBe(true);
    expect(isScopeFormat("cgk")).toBe(false);
    expect(isScopeFormat("TOOLONG")).toBe(false);
    expect(isScopeFormat("")).toBe(false);
  });

  test("descriptions say what a link opens", () => {
    expect(scopeName("KPS")).toBe("KPS");
    expect(scopeName("DPS")).toBe("Stasiun DPS");
    expect(scopeDescription("KPS")).toContain("semua stasiun");
    expect(scopeDescription("DPS")).toContain("DPS saja");
  });
});
