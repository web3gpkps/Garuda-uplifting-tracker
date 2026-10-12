"use client";

import { Button } from "@/components/ui/Button";

/** Opens the browser's print dialog for the weekly report (A4 landscape, chrome hidden). */
export function PrintButton({ label = "Cetak laporan" }: { label?: string }) {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
