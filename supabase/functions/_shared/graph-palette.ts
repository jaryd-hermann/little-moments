/**
 * Fixed palette for entry_metadata.primary_theme and primary_emotion.
 *
 * Must stay in sync with:
 *   - supabase/migrations/0030_graph_palette_constraints.sql (CHECK constraint)
 *   - constants/GraphPalette.ts (client-side color map)
 *
 * The LLM prompt asks for one of these exact strings. The DB rejects
 * anything else. The graph colors nodes from this list.
 */

export const THEME_ENUM = [
  "belonging",
  "loss",
  "pride",
  "family",
  "work",
  "change",
  "place",
  "growth",
  "joy",
  "uncertain",
] as const;

export const EMOTION_ENUM = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "love",
  "longing",
  "pride",
  "peace",
] as const;

export type Theme = (typeof THEME_ENUM)[number];
export type Emotion = (typeof EMOTION_ENUM)[number];

/**
 * Coerce an LLM response to a valid theme, or null if unrecognised / empty.
 * Returns null (not "") so the DB CHECK constraint accepts the value —
 * entry_metadata_primary_theme_chk allows null but rejects empty strings.
 */
export function coerceTheme(value: unknown): Theme | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if (!v) return null;
  return (THEME_ENUM as readonly string[]).includes(v) ? (v as Theme) : null;
}

export function coerceEmotion(value: unknown): Emotion | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if (!v) return null;
  return (EMOTION_ENUM as readonly string[]).includes(v)
    ? (v as Emotion)
    : null;
}
