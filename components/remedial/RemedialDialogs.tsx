"use client";

import { createContext, use, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { deleteRemedial } from "./actions";

export const CONNECTION_LOST = "koneksi ke server terputus. Isian Anda masih ada; simpan lagi.";

type PageStatus = { state: SaveState; set: (state: SaveState) => void };

const PageStatusContext = createContext<PageStatus | null>(null);

/** Page-level save feedback: "Dihapus pukul …" after a remedial row is removed from the grid. */
export function RemedialPageStatus({ children }: { children: ReactNode }) {
  const [state, set] = useState<SaveState>({ status: "idle" });
  return <PageStatusContext value={{ state, set }}>{children}</PageStatusContext>;
}

/** Shows the page-level status (rendered once, under the summary). */
export function RemedialPageStatusLine() {
  const page = use(PageStatusContext);
  return <SaveStatus state={page?.state ?? { status: "idle" }} />;
}

type DeleteProps = {
  accessKey: string;
  staffCode: string;
  name: string;
  /** Grid row action (small, not in the tab order) or card button. */
  variant?: "grid" | "card";
  onDeleted?: (at: string) => void;
};

/**
 * "Hapus" for one remedial row with its confirmation (share_delete_remedial). The staff
 * member stays on the list while their training result is Failed; only the remedial data goes.
 */
export function RemedialDeleteButton({ accessKey, staffCode, name, variant = "grid", onDeleted }: DeleteProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const page = use(PageStatusContext);

  function remove() {
    startTransition(async () => {
      try {
        const result = await deleteRemedial(accessKey, staffCode);
        if (result.ok) {
          setOpen(false);
          page?.set({ status: "deleted", at: result.savedAt });
          onDeleted?.(result.savedAt);
        } else {
          setError(result.error.message);
        }
      } catch {
        setError(CONNECTION_LOST);
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="quiet"
        tabIndex={variant === "grid" ? -1 : undefined}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Hapus<span className="sr-only"> data remedial {name}</span>
      </Button>
      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        dismissible={!pending}
        title={`Hapus data remedial ${name}?`}
        description="Tindakan, tanggal, nilai ulang, status pelaporan, dan catatan remedial dihapus. Data SDM dan hasil training awalnya tidak berubah."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button variant="danger" onClick={remove} loading={pending} loadingText="Menghapus…">
              Hapus data remedial
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm font-semibold text-critical">
            Gagal menghapus: {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
