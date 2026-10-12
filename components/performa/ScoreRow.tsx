"use client";

import { useId, useState, type FormEvent } from "react";
import { GAP_TOPICS, TOUCH_POINTS, coachingAvg, coachingStatus, deltaVsBaseline, type Settings } from "@/lib/rules";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, NumberInput, Select } from "@/components/ui/Field";
import { SaveStatus, type SaveState } from "@/components/ui/SaveStatus";
import { StatusChip } from "@/components/ui/StatusChip";
import type { WeeklyScoreResult } from "@/components/performa/actions";
import type { WeeklyScoreInput } from "@/components/performa/weekly-input";
import { formatScore, formatSignedScore, toInputText } from "@/lib/format";
import { ASPECT_FIELDS, parseScore } from "./format";

export type SavedScore = {
  touchPoint: string | null;
  /** COACHING_ASPECTS order. */
  scores: Array<number | null>;
  gapTopic: string | null;
  observer: string | null;
  coachingNotes: string | null;
};

export type EntryStaff = {
  code: string;
  name: string;
  assignmentStatus: string;
  /** Master SDM Final Result, for Δ vs Final Result. */
  finalResult: number | null;
  /** Master SDM touch point, the default for a new row. */
  defaultTouchPoint: string | null;
  /** This week's saved row, or null. */
  saved: SavedScore | null;
  /** "Diubah lewat tautan ini, 8 Okt 14.05" for the saved row. */
  changedLabel: string | null;
};

export type SaveScoreAction = (accessKey: string, input: WeeklyScoreInput) => Promise<WeeklyScoreResult>;

type Draft = { touchPoint: string; scores: string[]; gapTopic: string; observer: string; notes: string };

function draftFrom(saved: SavedScore | null): Draft {
  return {
    touchPoint: saved?.touchPoint ?? "",
    scores: ASPECT_FIELDS.map((_, i) => toInputText(saved?.scores[i])),
    gapTopic: saved?.gapTopic ?? "",
    observer: saved?.observer ?? "",
    notes: saved?.coachingNotes ?? "",
  };
}

function normalise(d: Draft): Draft {
  return {
    touchPoint: d.touchPoint,
    scores: d.scores.map((s) => s.trim()),
    gapTopic: d.gapTopic,
    observer: d.observer.trim(),
    notes: d.notes.trim(),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  const x = normalise(a);
  const y = normalise(b);
  return (
    x.touchPoint === y.touchPoint &&
    x.gapTopic === y.gapTopic &&
    x.observer === y.observer &&
    x.notes === y.notes &&
    x.scores.every((s, i) => s === y.scores[i])
  );
}

function isEmpty(d: Draft): boolean {
  const n = normalise(d);
  return n.touchPoint === "" && n.gapTopic === "" && n.observer === "" && n.notes === "" && n.scores.every((s) => s === "");
}

type ScoreRowProps = {
  accessKey: string;
  week: number;
  settings: Settings;
  staff: EntryStaff;
  /** Observer name filled into an empty Observer field when scoring starts. */
  defaultObserver: string;
  saveAction: SaveScoreAction;
};

/**
 * One staff member's Log Performa card for one week (phones): touch point, the four
 * aspects 0 to 100, live Rata-rata / Status / Δ vs Final Result (lib/rules), topik gap,
 * observer, catatan, and a save button. Clearing every field of a saved row deletes it
 * after a confirmation. Typed input survives a failed save.
 */
export function ScoreRow({ accessKey, week, settings, staff, defaultObserver, saveAction }: ScoreRowProps) {
  const id = useId();
  const messageId = `${id}-message`;

  const [draft, setDraft] = useState<Draft>(() => draftFrom(staff.saved));
  const [prevSaved, setPrevSaved] = useState<SavedScore | null>(staff.saved);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [serverField, setServerField] = useState<{ field: string; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // New server data after refresh(): adopt it unless the person is still editing this card.
  if (prevSaved !== staff.saved) {
    setPrevSaved(staff.saved);
    if (sameDraft(draft, draftFrom(prevSaved))) setDraft(draftFrom(staff.saved));
  }

  const dirty = !sameDraft(draft, draftFrom(staff.saved));
  const saving = saveState.status === "saving";
  const willDelete = dirty && staff.saved !== null && isEmpty(draft);

  const parsed = draft.scores.map(parseScore);
  const invalidLabels = parsed.flatMap((p, i) => (p === "invalid" ? [ASPECT_FIELDS[i].label] : []));
  const valid = parsed.map((p) => (p === "invalid" ? null : p));
  const avg = coachingAvg(valid);
  const status = coachingStatus(avg, settings);
  const delta = deltaVsBaseline(avg, staff.finalResult);

  let message: string | null = null;
  if (invalidLabels.length > 0) message = `Skor ${invalidLabels.join(", ")} harus angka 0 sampai 100.`;
  else if (serverField) message = serverField.message;

  function edit(next: Draft) {
    setDraft(next);
    if (saveState.status === "saved" || saveState.status === "error" || saveState.status === "deleted") {
      setSaveState({ status: "idle" });
    }
    if (serverField) setServerField(null);
  }

  function editScore(index: number, value: string) {
    const startedScoring = draft.scores.every((s) => s.trim() === "") && value.trim() !== "";
    edit({
      ...draft,
      scores: draft.scores.map((s, i) => (i === index ? value : s)),
      touchPoint: startedScoring && draft.touchPoint === "" ? (staff.defaultTouchPoint ?? "") : draft.touchPoint,
      observer:
        startedScoring && draft.observer.trim() === "" && defaultObserver.trim() !== ""
          ? defaultObserver.trim()
          : draft.observer,
    });
  }

  async function persist(toSave: Draft) {
    const n = normalise(toSave);
    setSaveState({ status: "saving" });
    try {
      const result = await saveAction(accessKey, {
        staffCode: staff.code,
        week,
        touchPoint: n.touchPoint || null,
        scores: n.scores.map(parseScore).map((p) => (p === "invalid" ? null : p)),
        gapTopic: n.gapTopic || null,
        observer: n.observer || null,
        coachingNotes: n.notes || null,
      });
      if (!result.ok) {
        setSaveState({ status: "error", message: result.error.message });
        if (result.error.field) setServerField({ field: result.error.field, message: result.error.message });
        return;
      }
      setDraft((current) => (current === toSave ? n : current));
      setSaveState({ status: result.deleted ? "deleted" : "saved", at: result.savedAt });
    } catch {
      setSaveState({ status: "error", message: "koneksi ke server terputus. Nilai yang Anda ketik masih ada; simpan lagi." });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || saving || invalidLabels.length > 0) return;
    if (willDelete) {
      setConfirmOpen(true);
      return;
    }
    void persist(draft);
  }

  const notActive = staff.assignmentStatus && staff.assignmentStatus !== "Aktif";
  const fieldInvalid = (field: string) => serverField?.field === field || undefined;

  return (
    <li className="border-b border-line px-4 py-4 focus-within:bg-brand-tint sm:px-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3" aria-labelledby={`${id}-name`}>
        <div>
          <p id={`${id}-name`} className="text-base font-semibold text-ink">
            {staff.name}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span className="tabular-nums">{staff.code}</span>
            {notActive ? <StatusChip label={staff.assignmentStatus} /> : null}
          </p>
          {staff.changedLabel ? <p className="text-xs text-ink-muted">{staff.changedLabel}</p> : null}
        </div>

        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Touch Point
          <Select
            value={draft.touchPoint}
            onChange={(e) => edit({ ...draft, touchPoint: e.target.value })}
            aria-invalid={fieldInvalid("touch_point")}
          >
            <option value="">Belum diisi</option>
            {TOUCH_POINTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ASPECT_FIELDS.map((aspect, i) => {
            const bad = parsed[i] === "invalid" || serverField?.field === aspect.field;
            return (
              <label key={aspect.field} className="flex flex-col justify-end gap-1 text-xs font-semibold text-ink">
                {aspect.label}
                <NumberInput
                  decimal
                  value={draft.scores[i]}
                  onChange={(event) => editScore(i, event.target.value)}
                  aria-invalid={bad || undefined}
                  aria-describedby={bad && message ? messageId : undefined}
                />
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
          {avg !== null ? (
            <p className="text-sm tabular-nums">
              <span className="text-ink-muted">Rata-rata </span>
              <span className="font-semibold text-ink">{formatScore(avg)}</span>
              {delta !== null ? (
                <span className="ml-2 text-xs text-ink-muted">Δ Final Result {formatSignedScore(delta)}</span>
              ) : null}
            </p>
          ) : null}
          <StatusChip label={status} emptyLabel="Belum dinilai" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Topik Gap
            <Select
              value={draft.gapTopic}
              onChange={(e) => edit({ ...draft, gapTopic: e.target.value })}
              aria-invalid={fieldInvalid("gap_topic")}
            >
              <option value="">Belum diisi</option>
              {draft.gapTopic && !(GAP_TOPICS as readonly string[]).includes(draft.gapTopic) ? (
                <option value={draft.gapTopic}>{draft.gapTopic}</option>
              ) : null}
              {GAP_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Observer
            <Input
              value={draft.observer}
              onChange={(e) => edit({ ...draft, observer: e.target.value })}
              maxLength={200}
              autoComplete="off"
              aria-invalid={fieldInvalid("observer")}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          Catatan
          <Input
            value={draft.notes}
            onChange={(e) => edit({ ...draft, notes: e.target.value })}
            maxLength={4000}
            autoComplete="off"
            aria-invalid={fieldInvalid("coaching_notes")}
          />
        </label>

        {message ? (
          <p id={messageId} className="text-sm font-semibold text-critical">
            {message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="submit"
            variant={willDelete ? "danger" : "primary"}
            disabled={!dirty || invalidLabels.length > 0}
            loading={saving}
            loadingText="Menyimpan…"
          >
            {willDelete ? "Hapus nilai" : "Simpan nilai"}
          </Button>
          {dirty && !saving && saveState.status !== "error" ? (
            <span className="text-xs font-semibold text-warning">Belum disimpan</span>
          ) : null}
          <SaveStatus state={saveState} />
        </div>
      </form>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Hapus nilai Minggu ke-${week} untuk ${staff.name}?`}
        description="Touch point, skor keempat aspek, topik gap, observer dan catatan minggu ini dikosongkan. Nilai minggu lain tidak berubah."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                void persist(draft);
              }}
            >
              Hapus nilai
            </Button>
          </>
        }
      />
    </li>
  );
}
