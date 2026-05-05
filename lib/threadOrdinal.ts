import type { Thread } from "@/hooks/useThreads";

/**
 * Display labels for the `connection_type` enum stored on `threads`.
 * Kept here (rather than per-screen) so detail, flipbook card, and any
 * other surface stay in sync.
 */
export const CONNECTION_LABELS: Record<string, string> = {
  thematic: "Thematic",
  emotional: "Emotional signature",
  person: "Recurring person",
  place: "Recurring place",
  pattern: "Longitudinal pattern",
  evolution: "Evolution",
};

/** Resolves the human label, falling back to "Thread" for unknown enum values. */
export function connectionLabel(connectionType: string | null | undefined): string {
  if (!connectionType) return "Thread";
  return CONNECTION_LABELS[connectionType] ?? "Thread";
}

/** 1 → "1st", 2 → "2nd", 11 → "11th" */
export function ordinalWord(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export function threadCardHeadlineFromOrdinal(ordinal: number): string {
  return `${ordinalWord(ordinal)} Thread found`;
}

export function threadDetailHeadingFromOrdinal(ordinal: number): string {
  return `${ordinalWord(ordinal)} Thread`;
}

/** Oldest non-dismissed thread = 1. Tie-break on `id`. */
export function threadOrdinalByIdMap(threads: Thread[]): Map<string, number> {
  const active = threads.filter((t) => !t.dismissed);
  const sorted = [...active].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const m = new Map<string, number>();
  sorted.forEach((t, i) => m.set(t.id, i + 1));
  return m;
}
