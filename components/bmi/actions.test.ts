import { describe, expect, mock, test } from "bun:test";

const rpcCalls: string[] = [];
let lastArgs: Record<string, unknown> = {};
mock.module("next/cache", () => ({ refresh: () => {} }));
mock.module("@/lib/workspace", () => ({
  resolveAccess: async () => ({
    ok: true,
    access: { kind: "owner", key: "owner" },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name);
      lastArgs = args;
      return { data: {}, error: null };
    },
  }),
  toLinkError: (error: unknown) => error,
}));

const { saveBmiCheck } = await import("./actions");

const check = { staffCode: "TMB-01", checkDate: "2026-10-26", heightCm: 170, weightKg: 62, commitment: null };

describe("saveBmiCheck and the Coaching Assessment check", () => {
  test("the first check is refused whoever asks, and nothing is written", async () => {
    rpcCalls.length = 0;
    const result = await saveBmiCheck("owner", { ...check, period: 1 });
    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "period", message: "Data cek ini hanya bisa diubah di Google Sheet." },
    });
    // Deleting it is a change too.
    const removal = await saveBmiCheck("owner", { staffCode: "TMB-01", period: 1, checkDate: null, heightCm: null, weightKg: null });
    expect(removal.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  test("any later check is saved", async () => {
    rpcCalls.length = 0;
    const result = await saveBmiCheck("owner", { ...check, period: 2 });
    expect(result.ok).toBe(true);
    expect(rpcCalls).toEqual(["share_save_check"]);
  });

  test("the commitment goes to the database as p_commitment, and one that is too long is refused", async () => {
    rpcCalls.length = 0;
    const saved = await saveBmiCheck("owner", { ...check, period: 3, heightCm: 170, weightKg: 90, commitment: "Turun 5 kg dalam 2 bulan" });
    expect(saved.ok).toBe(true);
    expect(lastArgs.p_commitment).toBe("Turun 5 kg dalam 2 bulan");
    const tooLong = await saveBmiCheck("owner", { ...check, period: 3, commitment: "x".repeat(501) });
    expect(tooLong).toMatchObject({ ok: false, error: { code: "invalid_input", field: "commitment" } });
    expect(rpcCalls).toEqual(["share_save_check"]);
  });
});
