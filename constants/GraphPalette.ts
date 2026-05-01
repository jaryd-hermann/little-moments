/**
 * Client-side graph palette — kept in strict sync with:
 *   - supabase/functions/_shared/graph-palette.ts (LLM prompt + coerce helpers)
 *   - supabase/migrations/0030_graph_palette_constraints.sql (DB CHECK)
 *
 * Node coloring rule:
 *   1. if entry has primary_theme → theme color
 *   2. else if entry has primary_emotion → emotion color
 *   3. else → DEFAULT (cream)
 */

export const THEMES = [
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

export const EMOTIONS = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "love",
  "longing",
  "pride",
  "peace",
] as const;

export type Theme = (typeof THEMES)[number];
export type Emotion = (typeof EMOTIONS)[number];

// Jewel-tone palette tuned for a black canvas — Obsidian/Roam-style
// "memory brain" look. Each colour is high-saturation and bright enough
// to pop at 10px radius on a dark background while still forming
// recognisable clusters.
export const THEME_COLORS: Record<Theme, string> = {
  belonging: "#FF7A59", // coral
  loss: "#6EA7D8", // sky
  pride: "#B584E8", // violet
  family: "#5DD9B3", // mint
  work: "#F5D17E", // gold
  change: "#FFB547", // amber
  place: "#4ECDC4", // turquoise
  growth: "#F08FC3", // pink
  joy: "#FFE066", // bright yellow
  uncertain: "#8892A8", // slate
};

export const EMOTION_COLORS: Record<Emotion, string> = {
  joy: "#FFE066",
  sadness: "#6EA7D8",
  anger: "#FF6B6B",
  fear: "#8892A8",
  love: "#FF7A59",
  longing: "#F08FC3",
  pride: "#B584E8",
  peace: "#5DD9B3",
};

export const DEFAULT_NODE_COLOR = "#A8AEC2"; // pale slate — visible on black bg

/** Human-readable label for a theme, used on filter chips. */
export const THEME_LABEL: Record<Theme, string> = {
  belonging: "Belonging",
  loss: "Loss",
  pride: "Pride",
  family: "Family",
  work: "Work",
  change: "Change",
  place: "Place",
  growth: "Growth",
  joy: "Joy",
  uncertain: "Uncertain",
};

export function nodeColor(
  primaryTheme: string | null | undefined,
  primaryEmotion: string | null | undefined
): string {
  if (primaryTheme && primaryTheme in THEME_COLORS) {
    return THEME_COLORS[primaryTheme as Theme];
  }
  if (primaryEmotion && primaryEmotion in EMOTION_COLORS) {
    return EMOTION_COLORS[primaryEmotion as Emotion];
  }
  return DEFAULT_NODE_COLOR;
}

/**
 * Edge visual style by connection_type. Thread types are the 6 values
 * constrained in the threads table CHECK. Colours match the theme/
 * emotion palette so edges feel part of the same visual language as
 * nodes. No dashes — glow layering conveys the "specialness" instead.
 */
export const CONNECTION_TYPE_STYLE: Record<
  string,
  { color: string; dash?: string }
> = {
  thematic: { color: "#FF7A59" },
  emotional: { color: "#F08FC3" },
  person: { color: "#B584E8" },
  place: { color: "#4ECDC4" },
  pattern: { color: "#FFB547" },
  evolution: { color: "#FFE066" },
};
