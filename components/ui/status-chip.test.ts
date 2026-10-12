import { describe, expect, test } from "bun:test";
import { toneForStatus } from "./StatusChip";

describe("toneForStatus", () => {
  test("passing, on-schedule and finished labels are good", () => {
    for (const label of ["Passed", "Lulus", "Sama", "Normal", "Selesai", "Tepat waktu", "Terjadwal", "On Track"]) {
      expect(toneForStatus(label)).toBe("good");
    }
  });

  test("failed, late and obese labels are critical, including the dated replacement label", () => {
    for (const label of ["Belum Lulus", "Failed", "Obesitas", "OVERDUE", "Terlambat cek", "Lewat 14 Des"]) {
      expect(toneForStatus(label)).toBe("critical");
    }
  });

  test("labels that ask for attention soon are warning", () => {
    for (const label of [
      "Overweight",
      "Kurus",
      "Jatuh tempo ≤ 7 hari",
      "Menunggu",
      "Cek ≤ 7 hari",
      "Menunggu hasil",
      "Beda – verifikasi",
      "Batas waktu belum ditetapkan",
      "Belum dijadwalkan",
    ]) {
      expect(toneForStatus(label)).toBe("warning");
    }
  });

  test("work under way is progress, never the brand tone", () => {
    expect(toneForStatus("On Progress")).toBe("progress");
    expect(toneForStatus("Rutin – pantau")).toBe("progress");
  });

  test("not started, postponed and unknown labels stay neutral", () => {
    expect(toneForStatus("Belum Mulai")).toBe("neutral");
    expect(toneForStatus("Tertunda")).toBe("neutral");
    expect(toneForStatus("Belum training/dinilai")).toBe("neutral");
    expect(toneForStatus("label baru")).toBe("neutral");
    expect(toneForStatus(null)).toBe("neutral");
  });

  test("failure causes and KPI statuses come from the same map", () => {
    expect(toneForStatus("Role play & post-test belum optimal")).toBe("warning");
    expect(toneForStatus("Remedial")).toBe("progress");
    expect(toneForStatus("Tercapai")).toBe("good");
    expect(toneForStatus("Di bawah posisi awal")).toBe("warning");
  });

  test("matching ignores case and extra spaces", () => {
    expect(toneForStatus("  belum   lulus ")).toBe("critical");
  });
});
