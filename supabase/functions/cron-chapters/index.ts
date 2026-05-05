/**
 * Scheduled chapter generation: runs every 15 min via pg_cron.
 *
 * Eligibility (server-side gating):
 *   - User has ≥4 `entry_type='moment'` `date_precision='exact'` entries in
 *     the previous Mon–Sun ISO week.
 *
 * Subscription tiers (mirrors thread paywalling):
 *   - `active` / `trial` → unlimited weekly chapters.
 *   - everyone else      → first 5 weekly chapters generated, where chapters
 *                          1–4 are openable and chapter 5 is stored but
 *                          locked client-side (tap routes to paywall). We
 *                          stop generating beyond 5 chapters to bound LLM
 *                          cost. Constants:
 *                            FREE_VISIBLE_LIMIT = 4 (push/email/openable cap)
 *                            FREE_PROCESS_LIMIT = 5 (generate-and-store cap)
 *
 * Delivery is independent of generation:
 *   - In-app: always written to `chapters` (mirrored as an `entries` row).
 *   - Push : OneSignal (via `dispatch()`), gated on `notification_enabled`
 *            AND chapter inside the visible limit.
 *   - Email: Resend (via `dispatch()`), gated the same way.
 *
 * Both deliveries are logged to `lifecycle_dispatches` with one-shot
 * idempotency keyed on `chapter_ready:<chapter_id>` /
 * `chapter_ready_email:<chapter_id>`, so a re-tick can't double-fire
 * even if the function crashes between push and stamp update.
 *
 * Timing window: fires Monday `local.hour === 7` && `minute < 20` per user
 * (their `notification_timezone`, falling back to UTC). The window is the
 * trigger mechanism, NOT an eligibility gate — users without a saved
 * timezone still get processed in the UTC window.
 *
 * Idempotency: stamp `profiles.last_chapter_push_local_date` after success
 * so a re-tick on the same Monday is a no-op.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { dispatch } from "../_shared/dispatch.ts";
import { chapterEmail } from "../_shared/email-templates/chapter.ts";
import {
  buildChapterPrompt,
  parseChapterSlidesResponse,
  resolveImageSlide,
  weekOfMonthLabel,
} from "../_shared/chapters.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";


const FALLBACK_TZ = "UTC";
const TARGET_HOUR = 7;
const TARGET_WEEKDAY = 1; // Monday in luxon (1=Mon..7=Sun)

// Free-tier paywalling — mirrors process-threads / cron-threads-nightly.
const FREE_VISIBLE_LIMIT = 4;
const FREE_PROCESS_LIMIT = 5;

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  notification_enabled: boolean;
  notification_timezone: string | null;
  subscription_status: string;
  last_chapter_push_local_date: string | null;
};

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-chapters" });
  const startedAt = Date.now();
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Iterate from `profiles` rather than `push_tokens` — generation is
    // gated on entry count, not on whether the user accepted notifications.
    // Push/email delivery is layered on top per user.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, display_name, email, notification_enabled, notification_timezone, subscription_status, last_chapter_push_local_date"
      );

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let generated = 0;
    let skippedFreeCap = 0;

    for (const p of profiles as ProfileRow[]) {
      const tz = p.notification_timezone || FALLBACK_TZ;
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;

      // Trigger window: Monday at the target hour, before the next 15-min
      // tick rolls past. Timezone is for *when*, not whether to process.
      if (
        local.weekday !== TARGET_WEEKDAY ||
        local.hour !== TARGET_HOUR ||
        local.minute >= 20
      ) {
        continue;
      }

      const todayStr = local.toISODate()!;
      if (p.last_chapter_push_local_date === todayStr) continue;

      // Previous ISO week (Mon-Sun) relative to "today" (which is itself a Monday).
      const prevSomeday = local.minus({ weeks: 1 });
      const weekStart = prevSomeday.startOf("week"); // Monday
      const weekEnd = prevSomeday.endOf("week"); // Sunday end-of-day
      const refIsoWeek = weekStart.weekNumber;
      const refIsoWeekYear = weekStart.weekYear;
      const startDate = weekStart.toISODate()!; // YYYY-MM-DD
      const endDate = weekEnd.toISODate()!;

      const { data: existingChapter } = await supabase
        .from("chapters")
        .select("id")
        .eq("user_id", p.id)
        .eq("ref_iso_week_year", refIsoWeekYear)
        .eq("ref_iso_week", refIsoWeek)
        .maybeSingle();

      if (existingChapter) {
        await supabase
          .from("profiles")
          .update({ last_chapter_push_local_date: todayStr })
          .eq("id", p.id);
        continue;
      }

      const isPaid =
        p.subscription_status === "trial" ||
        p.subscription_status === "active";

      // Free-tier processing cap — count weekly chapters only (legacy
      // monthly chapters don't count against the new tier). Skip Anthropic
      // entirely once the cap is hit so LLM cost stays bounded.
      let existingWeeklyCount = 0;
      if (!isPaid) {
        const { count } = await supabase
          .from("chapters")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .not("ref_week_start_date", "is", null);
        existingWeeklyCount = count ?? 0;
        if (existingWeeklyCount >= FREE_PROCESS_LIMIT) {
          skippedFreeCap++;
          continue;
        }
      }

      const { data: weekEntries } = await supabase
        .from("entries")
        .select("id, title, body, entry_date")
        .eq("user_id", p.id)
        .eq("entry_type", "moment")
        .eq("date_precision", "exact")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .order("entry_date", { ascending: true });

      if (!weekEntries || weekEntries.length < 4) continue;

      const { data: maxChapter } = await supabase
        .from("chapters")
        .select("chapter_number")
        .eq("user_id", p.id)
        .order("chapter_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const chapterNumber = (maxChapter?.chapter_number ?? 0) + 1;
      const weekLabel = weekOfMonthLabel(startDate);
      const rangeLabel = `${weekStart.toFormat("LLL d")}–${weekEnd.toFormat("LLL d")}`;

      let slides;
      try {
        const prompt = buildChapterPrompt(
          chapterNumber,
          weekLabel,
          rangeLabel,
          weekEntries.length,
          weekEntries
        );

        const msg = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });

        const text =
          msg.content[0]?.type === "text" ? msg.content[0].text : "";
        slides = parseChapterSlidesResponse(text);
      } catch (err) {
        console.error(`Chapter AI generation failed for user ${p.id}:`, err);
        continue;
      }

      if (!slides || slides.length === 0) {
        console.error(`Chapter slide parsing failed for user ${p.id}`);
        continue;
      }

      const entryIds = weekEntries.map((e: { id: string }) => e.id);

      const { data: mediaRows } = await supabase
        .from("entry_media")
        .select("id, storage_path")
        .in("entry_id", entryIds)
        .eq("media_type", "image")
        .order("created_at", { ascending: true });

      const imageSlide = resolveImageSlide(mediaRows ?? []);

      const { data: chapter, error: chapterErr } = await supabase
        .from("chapters")
        .insert({
          user_id: p.id,
          chapter_number: chapterNumber,
          ref_iso_week: refIsoWeek,
          ref_iso_week_year: refIsoWeekYear,
          ref_week_start_date: startDate,
          // Keep the start month/year too — useful for filtering and the
          // entries-side join — but the new uniqueness key is the ISO week.
          ref_year: weekStart.year,
          ref_month: weekStart.month,
          moment_count: weekEntries.length,
          slides,
          image_slide: imageSlide,
          source_entry_ids: entryIds,
          source_media_ids: imageSlide?.media_ids ?? [],
        })
        .select("id")
        .single();

      if (chapterErr || !chapter) {
        console.error(`Chapter insert failed for user ${p.id}:`, chapterErr);
        continue;
      }

      const chapterTitle = `Chapter ${chapterNumber}: ${weekLabel}`;

      // Mirror as a Capsule entry so it shows up in the list view alongside
      // moments. Free-user locked chapters still get this row — the UI
      // gates the tap with a paywall, same pattern as locked threads.
      await supabase.from("entries").insert({
        user_id: p.id,
        title: chapterTitle,
        body: `Your ${weekLabel} chapter — ${weekEntries.length} moments captured.`,
        entry_type: "chapter",
        entry_date: startDate,
        entry_month: weekStart.month,
        entry_year: weekStart.year,
        date_precision: "exact",
        chapter_id: chapter.id,
      });

      // Push + email gating: if this newly-created chapter sits beyond the
      // free visible limit, the user can't actually read it (UI shows a
      // lock + routes to paywall), so we don't notify. `existingWeeklyCount`
      // is the count *before* this insert — so `>= FREE_VISIBLE_LIMIT`
      // means the new chapter's 1-indexed position is `> FREE_VISIBLE_LIMIT`.
      const pastVisibleLimit =
        !isPaid && existingWeeklyCount >= FREE_VISIBLE_LIMIT;

      if (!pastVisibleLimit) {
        if (p.notification_enabled) {
          await dispatch(supabase, {
            userId: p.id,
            eventKey: `chapter_ready:${chapter.id}`,
            channel: "push",
            oneShot: true,
            payload: { chapter_id: chapter.id },
            push: {
              title: "Your chapter is ready",
              body:
                `${weekLabel} — ${weekEntries.length} moments woven into your story.`,
              data: { type: "chapter", chapter_id: chapter.id },
            },
          });
        }

        if (p.email && p.notification_enabled) {
          try {
            const { subject, html } = chapterEmail({
              displayName: p.display_name,
              weekLabel,
              momentCount: weekEntries.length,
              chapterNumber,
            });
            await dispatch(supabase, {
              userId: p.id,
              eventKey: `chapter_ready_email:${chapter.id}`,
              channel: "email",
              oneShot: true,
              payload: { chapter_id: chapter.id },
              email: { to: p.email, subject, html },
            });
          } catch (err) {
            console.error(`Chapter email failed for user ${p.id}:`, err);
          }
        }
      }

      await supabase
        .from("profiles")
        .update({ last_chapter_push_local_date: todayStr })
        .eq("id", p.id);

      generated++;
    }

    logger.info("cron_chapters.completed", {
      duration_ms: Date.now() - startedAt,
      generated,
      skipped_free_cap: skippedFreeCap,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({ ok: true, generated, skippedFreeCap }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    logger.error("cron_chapters.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
