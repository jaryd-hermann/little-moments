/**
 * Nightly batch: Threads analysis for ALL users.
 *
 * Default behavior (cron invocation, no body):
 *   - Picks every user with last_entry_date within the last 14 days
 *   - For each, analyses their `ENTRIES_PER_USER_DEFAULT` most recent entries
 *     that have embeddings as anchors against the full archive
 *   - Free users still get threads stored, but push/email is gated by
 *     `FREE_THREAD_LIMIT` so we don't spam them past the paywall
 *
 * Manual / backfill invocation (POST body):
 *   { user_id?: string, entries_per_user?: number }
 *   - `user_id`: limit to a single user (also bypasses the 14-day filter)
 *   - `entries_per_user`: override the per-user anchor cap. Pass a large number
 *     (e.g. 1000) for a one-shot backfill across all entries.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { dispatch } from "../_shared/dispatch.ts";
import { threadEmail } from "../_shared/email-templates/thread.ts";
import { observationPlainPreview } from "../_shared/thread-text.ts";
import { anthropicAssistantText } from "../_shared/anthropicAssistantText.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";


// Tuned against real data on 2026-05-03 — see process-threads/index.ts for
// the rationale. Keep these in sync with that file.
const MIN_SIMILARITY = 0.45;
const MIN_CONFIDENCE = 0.6;
const MAX_CANDIDATES = 15;
const ENTRIES_PER_USER_DEFAULT = 30;
// Tiered free-tier model. See process-threads/index.ts for the long
// explanation. Keep in sync with that file and hooks/useThreads.ts.
const FREE_VISIBLE_LIMIT = 5;
const FREE_PROCESS_LIMIT = 10;

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
  const logger = createPostHogLogger({ service: "cron-threads-nightly" });
  const startedAt = Date.now();
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Optional body for manual / backfill invocation. The pg_cron job posts
  // `{}` so we tolerate empty/missing bodies without erroring.
  let body: { user_id?: string; entries_per_user?: number } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const entriesPerUser = Math.max(
    1,
    Math.min(body.entries_per_user ?? ENTRIES_PER_USER_DEFAULT, 5000),
  );
  const targetUserId = body.user_id;

  const serviceSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Pick the user set:
    //   - Default cron run: anyone active in the last 14 days
    //   - Manual / backfill: just the targeted user (or everyone if no user_id
    //     and the caller passes a large entries_per_user, but still apply the
    //     14-day filter to avoid resurrecting churned accounts).
    let query = serviceSupabase
      .from("profiles")
      .select(
        "id, email, display_name, notification_enabled, subscription_status"
      );

    if (targetUserId) {
      query = query.eq("id", targetUserId);
    } else {
      const fourteenDaysAgo = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000
      ).toISOString();
      query = query.gte("last_entry_date", fourteenDaysAgo.split("T")[0]);
    }

    const { data: users, error: usersErr } = await query;

    if (usersErr) {
      return new Response(
        JSON.stringify({ error: usersErr.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!users?.length) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, reason: "no_users_match" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let totalThreadsCreated = 0;

    for (const user of users) {
      try {
        const hasUnlimitedThreads =
          user.subscription_status === "active" ||
          user.subscription_status === "trial";

        // Read current thread count once per user; we keep an in-memory tally
        // as we go so the gate stays accurate even if multiple threads land
        // for the same user in this run.
        const { data: stats } = await serviceSupabase
          .from("user_thread_stats")
          .select("total_connections")
          .eq("user_id", user.id)
          .maybeSingle();
        let currentCount = stats?.total_connections ?? 0;

        // Cost cap: if a free user has hit the absolute storage cap, skip
        // them entirely. No anchors, no Claude calls.
        if (!hasUnlimitedThreads && currentCount >= FREE_PROCESS_LIMIT) {
          continue;
        }

        const { data: recentEntries } = await serviceSupabase
          .from("entries")
          .select("id, title, body, ai_enhanced_body, entry_date, created_at")
          .eq("user_id", user.id)
          .not("embedding", "is", null)
          .order("created_at", { ascending: false })
          .limit(entriesPerUser);

        if (!recentEntries?.length) continue;

        for (const entry of recentEntries) {
          // Mid-run cap check: a previous anchor in this run may have pushed
          // the user over FREE_PROCESS_LIMIT. Stop before spending more money.
          if (!hasUnlimitedThreads && currentCount >= FREE_PROCESS_LIMIT) {
            break;
          }

          const entryText = (entry.ai_enhanced_body ?? entry.body ?? "").trim();
          if (!entryText) continue;

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

          const candidateBlock = filtered
            .map(
              (
                c: {
                  id: string;
                  entry_date: string;
                  title: string | null;
                  ai_enhanced_body: string | null;
                  body: string;
                },
                i: number,
              ) =>
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
          currentCount++;
          totalThreadsCreated++;

          // Gate notifications: free users past the visible limit get the
          // thread stored (so the UI can show a locked teaser and unlock on
          // upgrade) but no push or email.
          const pastVisibleLimit =
            !hasUnlimitedThreads && currentCount > FREE_VISIBLE_LIMIT;
          if (pastVisibleLimit) continue;

          // PUSH: route through OneSignal via dispatch() so the send is
          // logged in `lifecycle_dispatches` (1 row per thread per user)
          // and the same OneSignal frequency caps as the rest of the
          // lifecycle system apply.
          if (user.notification_enabled) {
            const observation = (result.ellie_observation as string) ?? "";
            const preview = observationPlainPreview(observation);
            const truncated =
              preview.length > 120 ? preview.slice(0, 117) + "..." : preview;

            const pushResult = await dispatch(serviceSupabase, {
              userId: user.id,
              eventKey: `thread_surfaced:${thread.id}`,
              channel: "push",
              oneShot: true,
              payload: { thread_id: thread.id },
              push: {
                title: "Ellie found a thread",
                body: truncated,
                data: { type: "thread", thread_id: thread.id },
              },
            });

            if (pushResult.sent) {
              await serviceSupabase
                .from("threads")
                .update({ push_sent: true })
                .eq("id", thread.id);
            }
          }

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

            const emailResult = await dispatch(serviceSupabase, {
              userId: user.id,
              eventKey: `thread_surfaced_email:${thread.id}`,
              channel: "email",
              oneShot: true,
              payload: { thread_id: thread.id },
              email: {
                to: user.email,
                subject: email.subject,
                html: email.html,
              },
            });

            if (emailResult.sent) {
              await serviceSupabase
                .from("threads")
                .update({ email_sent: true })
                .eq("id", thread.id);
            }
          }

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
        const message = userErr instanceof Error
          ? userErr.message
          : String(userErr);
        console.error(`Batch error for user ${user.id}:`, userErr);
        logger.error("cron_threads_nightly.user_error", {
          posthog_distinct_id: user.id,
          error: message,
        });
      }
    }

    logger.info("cron_threads_nightly.completed", {
      duration_ms: Date.now() - startedAt,
      users_processed: users.length,
      threads_created: totalThreadsCreated,
      entries_per_user: entriesPerUser,
      target_user_id: targetUserId ?? "",
      backfill: !!targetUserId,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({
        ok: true,
        users_processed: users.length,
        threads_created: totalThreadsCreated,
        entries_per_user: entriesPerUser,
        target_user_id: targetUserId ?? null,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("cron-threads-nightly error:", e);
    logger.error("cron_threads_nightly.failed", {
      duration_ms: Date.now() - startedAt,
      error: e instanceof Error ? e.message : String(e),
    });
    await logger.flush();
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
