import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface UserThreadPreferencesRow {
  preference_summary: string | null;
  avoid_connection_types: string[];
  seek_connection_types: string[];
  avoid_chips: string[];
  seek_chips: string[];
}

export function formatPreferencesForPrompt(
  prefs: UserThreadPreferencesRow | null
): string {
  if (!prefs?.preference_summary?.trim()) return "";
  const parts = [prefs.preference_summary.trim()];
  if (prefs.avoid_connection_types?.length) {
    parts.push(
      `Avoid connection types: ${prefs.avoid_connection_types.join(", ")}.`
    );
  }
  if (prefs.seek_connection_types?.length) {
    parts.push(
      `Seek more: ${prefs.seek_connection_types.join(", ")}.`
    );
  }
  if (prefs.avoid_chips?.length) {
    parts.push(`User dislikes: ${prefs.avoid_chips.join(", ")}.`);
  }
  if (prefs.seek_chips?.length) {
    parts.push(`User wants more: ${prefs.seek_chips.join(", ")}.`);
  }
  return parts.join("\n");
}

export async function loadUserThreadPreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<UserThreadPreferencesRow | null> {
  const { data } = await supabase
    .from("user_thread_preferences")
    .select(
      "preference_summary, avoid_connection_types, seek_connection_types, avoid_chips, seek_chips"
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    preference_summary: data.preference_summary ?? null,
    avoid_connection_types: (data.avoid_connection_types as string[]) ?? [],
    seek_connection_types: (data.seek_connection_types as string[]) ?? [],
    avoid_chips: (data.avoid_chips as string[]) ?? [],
    seek_chips: (data.seek_chips as string[]) ?? [],
  };
}

/** user_answer text keyed by entry_id for entries in the current comparison set. */
export async function loadThreadAnswersByEntryId(
  supabase: SupabaseClient,
  userId: string,
  entryIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (entryIds.length === 0) return map;

  const orFilter = entryIds
    .flatMap((id) => [`entry_id_a.eq.${id}`, `entry_id_b.eq.${id}`])
    .join(",");

  const { data } = await supabase
    .from("threads")
    .select("entry_id_a, entry_id_b, user_answer")
    .eq("user_id", userId)
    .not("user_answer", "is", null)
    .or(orFilter);

  for (const row of data ?? []) {
    const answer = (row.user_answer as string)?.trim();
    if (!answer) continue;
    if (entryIds.includes(row.entry_id_a)) map.set(row.entry_id_a, answer);
    if (entryIds.includes(row.entry_id_b)) map.set(row.entry_id_b, answer);
  }
  return map;
}

export function appendThreadAnswerToEntryBlock(
  baseBlock: string,
  entryId: string,
  answersByEntryId: Map<string, string>
): string {
  const answer = answersByEntryId.get(entryId);
  if (!answer) return baseBlock;
  return `${baseBlock}\nThread reflection (user wrote): ${answer}`;
}

export function entryTextForEmbedding(
  body: string,
  threadAnswer: string | null | undefined
): string {
  const base = body.trim();
  if (!threadAnswer?.trim()) return base;
  return `${base}\n\nThread reflection: ${threadAnswer.trim()}`;
}

const PREF_REFRESH_SYSTEM = `You summarize a user's thread feedback to tune future connection discovery.
Return JSON only:
{
  "preference_summary": "2-3 sentences, first person about the user ('They find...', 'They want fewer...'). Specific and actionable.",
  "avoid_connection_types": ["zero or more of: thematic, emotional, person, place, pattern, evolution"],
  "seek_connection_types": ["zero or more of the same enum"],
  "avoid_chips": ["chip ids the user dislikes, from: not_relevant, too_obvious, wrong_vibe, not_this_theme"],
  "seek_chips": ["chip ids the user likes, from: more_like_this, surprising, made_me_reflect, beautifully_put"]
}
Be conservative — only list types/chips with clear repeated signal.`;

export async function refreshUserThreadPreferences(
  supabase: SupabaseClient,
  anthropic: {
    messages: {
      create: (
        args: unknown
      ) => Promise<{ content: { type: string; text?: string }[] }>;
    };
  },
  userId: string,
  anthropicAssistantText: (content: { type: string; text?: string }[]) => string
): Promise<void> {
  const { data: feedbackRows } = await supabase
    .from("thread_feedback")
    .select("sentiment, chips, note, action, created_at, thread_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!feedbackRows?.length) return;

  const threadIds = [
    ...new Set(feedbackRows.map((r) => r.thread_id as string)),
  ];
  const { data: threadRows } = await supabase
    .from("threads")
    .select("id, connection_type, statement")
    .in("id", threadIds);
  const threadById = new Map(
    (threadRows ?? []).map((t) => [t.id as string, t])
  );

  const block = feedbackRows
    .map((r, i) => {
      const t = threadById.get(r.thread_id as string);
      return [
        `#${i + 1} ${r.sentiment} (${r.action})`,
        `type: ${t?.connection_type ?? "?"}`,
        `statement: ${t?.statement ?? ""}`,
        `chips: ${((r.chips as string[]) ?? []).join(", ") || "none"}`,
        r.note ? `note: ${r.note}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: PREF_REFRESH_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Recent thread feedback from this user:\n\n${block}`,
      },
    ],
  });

  const raw = anthropicAssistantText(response.content).trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*\n?/gm, "").replace(/\n?```\s*$/gm, "").trim());
  } catch {
    return;
  }

  await supabase.from("user_thread_preferences").upsert(
    {
      user_id: userId,
      preference_summary: String(parsed?.preference_summary ?? "").trim() || null,
      avoid_connection_types: Array.isArray(parsed?.avoid_connection_types)
        ? (parsed.avoid_connection_types as string[])
        : [],
      seek_connection_types: Array.isArray(parsed?.seek_connection_types)
        ? (parsed.seek_connection_types as string[])
        : [],
      avoid_chips: Array.isArray(parsed?.avoid_chips)
        ? (parsed.avoid_chips as string[])
        : [],
      seek_chips: Array.isArray(parsed?.seek_chips)
        ? (parsed.seek_chips as string[])
        : [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}
