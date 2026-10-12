"use client";

import { Button, type ButtonVariant } from "@/components/ui/Button";

/**
 * Opens the browser's print dialog for the weekly report (A4 landscape, chrome hidden).
 * Secondary when the page already has a primary action (saving the findings).
 */
export function PrintButton({ variant = "primary" }: { variant?: Extract<ButtonVariant, "primary" | "secondary"> }) {
  return (
    <Button variant={variant} onClick={() => window.print()}>
      Cetak laporan
    </Button>
  );
}
