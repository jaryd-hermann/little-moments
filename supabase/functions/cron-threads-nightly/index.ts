/**
 * Nightly batch: Threads analysis for premium users.
 *
 * Runs nightly via pg_cron. For each premium user active in the last 14 days:
 *   - Picks the 10 most recent entries that have embeddings
 *   - For each, runs similarity search against the full archive
 *   - Sends candidates to Claude Sonnet for longitudinal/evolution analysis
 *   - Stores any new threads found
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";
import { sendEmail } from "../_shared/resend.ts";
import { threadEmail } from "../_shared/email-templates/thread.ts";
import { observationPlainPreview } from "../_shared/thread-text.ts";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";

const ANDROID_CHANNEL = "default";
const MIN_SIMILARITY = 0.78;
const MIN_CONFIDENCE = 0.75;
const MAX_CANDIDATES = 15;
const ENTRIES_PER_USER = 10;

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const BATCH_SYSTEM_PROMPT = `You are Ellie, a thoughtful memory companion for the Little Moments app.
You have been given a user's entry alongside several other past entries from their archive that are semantically similar.

Your job: identify genuinely meaningful connections — focusing especially on:
- Longitudinal patterns: a word, phrase, or feeling that clusters around a time of year or life period
- Evolution / contradiction: a belief or feeling that has visibly changed over time
- Recurring themes the user returns to without realizing it

Be selective. Most entries will not have a real connection. Do not force one.

For each real connection found, return:
{
  "has_connection": true,
  "entry_id_a": "[anchor entry id]",
  "entry_id_b": "[past entry id]",
  "connection_type": "pattern | evolution | thematic | emotional | person | place",
  "confidence": 0.0-1.0,
  "ellie_observation": "2–4 short sentences, first person as Ellie, warm and vivid. Put your sharpest takeaway in **double asterisks** for bold, then 1–2 sentences with specific color from the entries (images, phrases, how the pattern evolves). Not generic.",
  "questions": ["One thoughtful question for the user to sit with."]
}

If no real connection exists:
{ "has_connection": false }

Return JSON only.`;

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stripCodeFences(text));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const serviceSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Find premium users active in last 14 days
    const fourteenDaysAgo = new Date(
      Date.now() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: premiumUsers } = await serviceSupabase
      .from("profiles")
      .select("id, email, display_name, notification_enabled")
      .eq("subscription_status", "active")
      .gte("last_entry_date", fourteenDaysAgo.split("T")[0]);

    if (!premiumUsers?.length) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: "no_active_premium" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let totalThreadsCreated = 0;

    for (const user of premiumUsers) {
      try {
        // Get recent entries with embeddings
        const { data: recentEntries } = await serviceSupabase
          .from("entries")
          .select("id, title, body, ai_enhanced_body, entry_date, created_at")
          .eq("user_id", user.id)
          .not("embedding", "is", null)
          .order("created_at", { ascending: false })
          .limit(ENTRIES_PER_USER);

        if (!recentEntries?.length) continue;

        for (const entry of recentEntries) {
          const entryText = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
          if (!entryText) continue;

          // Similarity search using stored embedding
          const { data: candidates } = await serviceSupabase.rpc(
            "match_entries_by_id",
            {
              source_entry_id: entry.id,
              match_user_id: user.id,
              min_day_gap: 7,
              similarity_threshold: MIN_SIMILARITY,
              match_count: MAX_CANDIDATES,
            }
          );

          if (!candidates?.length) continue;

          // Filter already-connected pairs
          const { data: existingThreads } = await serviceSupabase
            .from("threads")
            .select("entry_id_a, entry_id_b")
            .or(`entry_id_a.eq.${entry.id},entry_id_b.eq.${entry.id}`)
            .eq("user_id", user.id);

          const connectedIds = new Set<string>();
          for (const t of existingThreads ?? []) {
            connectedIds.add(t.entry_id_a);
            connectedIds.add(t.entry_id_b);
          }

          const filtered = candidates.filter(
            (c: { id: string }) => !connectedIds.has(c.id)
          );
          if (!filtered.length) continue;

          // LLM analysis
          const candidateBlock = filtered
            .map(
              (c: { id: string; entry_date: string; title: string | null; ai_enhanced_body: string | null; body: string }, i: number) =>
                `--- Past Entry ${i + 1} (id: ${c.id}, date: ${c.entry_date}) ---\nTitle: ${c.title ?? "(untitled)"}\n${c.ai_enhanced_body ?? c.body}`
            )
            .join("\n\n");

          const userMessage = `ANCHOR ENTRY (id: ${entry.id}, date: ${entry.entry_date}):\nTitle: ${entry.title ?? "(untitled)"}\n${entryText}\n\nPAST ENTRIES:\n${candidateBlock}`;

          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 1400,
            system: BATCH_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          });

          const raw = anthropicAssistantText(response.content).trim();
          const result = tryParseJSON(raw);

          if (!result || result.has_connection !== true) continue;

          const confidence = Number(result.confidence ?? 0);
          if (confidence < MIN_CONFIDENCE) continue;

          const validTypes = [
            "thematic", "emotional", "person", "place", "pattern", "evolution",
          ];
          const connectionType = validTypes.includes(
            result.connection_type as string
          )
            ? (result.connection_type as string)
            : "pattern";

          // Store thread
          const { data: thread, error: threadErr } = await serviceSupabase
            .from("threads")
            .insert({
              user_id: user.id,
              entry_id_a: entry.id,
              entry_id_b: result.entry_id_b as string,
              connection_type: connectionType,
              ellie_observation: result.ellie_observation as string,
              questions: Array.isArray(result.questions)
                ? result.questions
                : [],
              confidence,
            })
            .select("id")
            .single();

          if (threadErr) {
            if (threadErr.code === "23505") continue; // duplicate pair
            console.error("Thread insert error:", threadErr);
            continue;
          }

          await serviceSupabase.rpc("increment_thread_count", {
            p_user_id: user.id,
          });
          totalThreadsCreated++;

          // Push notification
          if (user.notification_enabled) {
            const { data: tokens } = await serviceSupabase
              .from("push_tokens")
              .select("expo_push_token")
              .eq("user_id", user.id);

            if (tokens?.length) {
              const observation =
                (result.ellie_observation as string) ?? "";
              const preview = observationPlainPreview(observation);
              const truncated =
                preview.length > 120
                  ? preview.slice(0, 117) + "..."
                  : preview;

              const tickets = tokens.map(
                (t: { expo_push_token: string }) => ({
                  to: t.expo_push_token,
                  title: "✦ Ellie found a Thread",
                  body: truncated,
                  sound: "default" as const,
                  priority: "high" as const,
                  channelId: ANDROID_CHANNEL,
                  data: { type: "thread", threadId: thread.id },
                })
              );
              await sendExpoPushTickets(tickets).catch((e) =>
                console.error("Batch push error:", e)
              );

              await serviceSupabase
                .from("threads")
                .update({ push_sent: true })
                .eq("id", thread.id);
            }
          }

          // Email
          if (user.email) {
            const { data: entryB } = await serviceSupabase
              .from("entries")
              .select("title")
              .eq("id", result.entry_id_b as string)
              .single();

            const email = threadEmail({
              displayName: user.display_name,
              ellieObservation: result.ellie_observation as string,
              entryTitleA: entry.title,
              entryTitleB: entryB?.title,
            });

            await sendEmail({
              to: user.email,
              subject: email.subject,
              html: email.html,
            }).catch((e) => console.error("Batch email error:", e));

            await serviceSupabase
              .from("threads")
              .update({ email_sent: true })
              .eq("id", thread.id);
          }

          // Update last_analyzed_at
          await serviceSupabase
            .from("user_thread_stats")
            .upsert(
              {
                user_id: user.id,
                last_analyzed_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
        }
      } catch (userErr) {
        console.error(`Batch error for user ${user.id}:`, userErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        users_processed: premiumUsers.length,
        threads_created: totalThreadsCreated,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("cron-threads-nightly error:", e);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
