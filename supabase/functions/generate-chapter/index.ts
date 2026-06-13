/**
 * On-demand weekly chapter generation. Mirrors the per-user generation
 * pipeline in `cron-chapters/index.ts` but skips the Monday-7am-local
 * trigger window so we can verify the pipeline without waiting a week.
 *
 * Use cases:
 *   - Ops verification ("does the AI prompt + insert + push pipeline work
 *     end-to-end for this user?")
 *   - Manual replay if a Monday cron tick was missed
 *
 * Behavior parity with cron-chapters:
 *   - Eligibility: ≥4 `entry_type='moment'` `date_precision='exact'`
 *     entries in the requested ISO week.
 *   - Free-tier cap: skips with `free_cap_reached` once the user has
 *     `FREE_PROCESS_LIMIT` weekly chapters. trial / active = unlimited.
 *   - Per-ISO-week uniqueness: skips with `already_exists` if a chapter
 *     for that week already lives in the table.
 *   - Push (Expo) + email (Resend) only when the new chapter sits within
 *     `FREE_VISIBLE_LIMIT`.
 *
 * Differences from cron-chapters:
 *   - Does NOT enforce the Monday 7:00–7:19 local trigger window.
 *   - Does NOT consult / write `profiles.last_chapter_push_local_date`
 *     (so re-running for a user the cron already serviced doesn't lock
 *     the cron out next Monday).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Request:
 *   POST /functions/v1/generate-chapter
 *   {
 *     "userId": "<uuid>",
 *     "weekStartDate": "2026-04-27"   // optional Monday ISO date
 *   }
 *
 * If `weekStartDate` is omitted, defaults to the previous Monday in the
 * user's `notification_timezone` (UTC fallback).
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

const FALLBACK_TZ = "UTC";

// Mirrors cron-chapters / useChapters paywalling.
const FREE_VISIBLE_LIMIT = 4;
const FREE_PROCESS_LIMIT = 5;

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  notification_enabled: boolean;
  notification_timezone: string | null;
  subscription_status: string;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return jsonResponse(401, { error: "unauthorized" });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" });
    }

    let body: { userId?: string; weekStartDate?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "invalid_json" });
    }
    const userId = body?.userId;
    const explicitWeekStart = body?.weekStartDate;
    if (!userId || typeof userId !== "string") {
      return jsonResponse(400, { error: "missing_userId" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return jsonResponse(500, { error: "missing_anthropic_key" });
    }
    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, display_name, email, notification_enabled, notification_timezone, subscription_status"
      )
      .eq("id", userId)
      .single<ProfileRow>();

    if (profErr || !profile) {
      return jsonResponse(404, { error: "profile_not_found" });
    }

    // ── Resolve the target ISO week ─────────────────────────────────
    // If the caller passed a `weekStartDate`, trust it (must be a Monday).
    // Otherwise default to the previous Monday in the user's tz.
    const tz = profile.notification_timezone || FALLBACK_TZ;
    let weekStart: DateTime;
    if (explicitWeekStart) {
      weekStart = DateTime.fromISO(explicitWeekStart, { zone: tz });
      if (!weekStart.isValid) {
        return jsonResponse(400, { error: "invalid_weekStartDate" });
      }
      if (weekStart.weekday !== 1) {
        return jsonResponse(400, {
          error: "weekStartDate_must_be_monday",
        });
      }
    } else {
      let now: DateTime;
      try {
        now = DateTime.now().setZone(tz);
      } catch {
        now = DateTime.now().setZone(FALLBACK_TZ);
      }
      if (!now.isValid) now = DateTime.now().setZone(FALLBACK_TZ);
      // Last week's Monday (relative to today's Monday-of-week).
      weekStart = now.startOf("week").minus({ weeks: 1 });
    }

    const weekEnd = weekStart.endOf("week"); // Sunday end-of-day
    const refIsoWeek = weekStart.weekNumber;
    const refIsoWeekYear = weekStart.weekYear;
    const startDate = weekStart.toISODate()!;
    const endDate = weekEnd.toISODate()!;

    // ── Per-week uniqueness ─────────────────────────────────────────
    const { data: existingChapter } = await supabase
      .from("chapters")
      .select("id, chapter_number")
      .eq("user_id", userId)
      .eq("ref_iso_week_year", refIsoWeekYear)
      .eq("ref_iso_week", refIsoWeek)
      .maybeSingle();

    if (existingChapter) {
      return jsonResponse(409, {
        ok: false,
        skippedReason: "already_exists",
        chapterId: existingChapter.id,
        chapterNumber: existingChapter.chapter_number,
        weekStart: startDate,
        weekEnd: endDate,
      });
    }

    // ── Free-tier processing cap ────────────────────────────────────
    const isPaid =
      profile.subscription_status === "trial" ||
      profile.subscription_status === "active";

    let existingWeeklyCount = 0;
    if (!isPaid) {
      const { count } = await supabase
        .from("chapters")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .not("ref_week_start_date", "is", null);
      existingWeeklyCount = count ?? 0;
      if (existingWeeklyCount >= FREE_PROCESS_LIMIT) {
        return jsonResponse(409, {
          ok: false,
          skippedReason: "free_cap_reached",
          existingWeeklyCount,
          freeProcessLimit: FREE_PROCESS_LIMIT,
        });
      }
    }

    // ── Eligibility: ≥4 moments in the requested week ───────────────
    const { data: weekEntries } = await supabase
      .from("entries")
      .select("id, title, body, entry_date")
      .eq("user_id", userId)
      .eq("entry_type", "moment")
      .eq("date_precision", "exact")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date", { ascending: true });

    if (!weekEntries || weekEntries.length < 4) {
      return jsonResponse(409, {
        ok: false,
        skippedReason: "insufficient_moments",
        momentCount: weekEntries?.length ?? 0,
        weekStart: startDate,
        weekEnd: endDate,
      });
    }

    // ── Choose chronologically-correct chapter_number ───────────────
    // Unlike cron-chapters (which always processes the most recent past
    // week → max+1 is naturally chronological), generate-chapter can
    // backfill an older week. We compute the insertion slot by sorting
    // existing chapters by ref_week_start_date (legacy monthly rows fall
    // back to (ref_year, ref_month, 1)) and place the new chapter at
    // (countBefore + 1). Any chapters that should sort after this one
    // get shifted up by 1.
    type ExistingChapterRow = {
      id: string;
      chapter_number: number;
      ref_week_start_date: string | null;
      ref_year: number | null;
      ref_month: number | null;
    };

    const { data: existingChapters } = await supabase
      .from("chapters")
      .select(
        "id, chapter_number, ref_week_start_date, ref_year, ref_month"
      )
      .eq("user_id", userId);

    const chapterSortKey = (c: ExistingChapterRow): string =>
      c.ref_week_start_date ??
      (c.ref_year && c.ref_month
        ? `${c.ref_year}-${String(c.ref_month).padStart(2, "0")}-01`
        : "9999-12-31");

    const newSortKey = startDate;
    const existing = (existingChapters ?? []) as ExistingChapterRow[];
    const chaptersAfter = existing
      .filter((c) => chapterSortKey(c) >= newSortKey)
      // Descending by current chapter_number so each `+1` shift can land
      // in the slot just freed by the previous iteration without ever
      // violating the (user_id, chapter_number) unique constraint.
      .sort((a, b) => b.chapter_number - a.chapter_number);
    const chapterNumber =
      existing.filter((c) => chapterSortKey(c) < newSortKey).length + 1;

    for (const c of chaptersAfter) {
      const { error: shiftErr } = await supabase
        .from("chapters")
        .update({ chapter_number: c.chapter_number + 1 })
        .eq("id", c.id);
      if (shiftErr) {
        console.error(
          `[generate-chapter] failed to shift chapter ${c.id} for backfill:`,
          shiftErr
        );
        return jsonResponse(500, {
          error: "renumber_failed",
          detail: shiftErr.message,
        });
      }

      // Keep the mirrored Capsule entry title in sync ("Chapter N: …").
      const { data: mirrored } = await supabase
        .from("entries")
        .select("id, title")
        .eq("chapter_id", c.id);
      for (const row of mirrored ?? []) {
        const oldTitle = (row.title as string | null) ?? "";
        const newTitle = oldTitle.replace(
          /^Chapter \d+:/,
          `Chapter ${c.chapter_number + 1}:`
        );
        if (newTitle === oldTitle) continue;
        await supabase
          .from("entries")
          .update({ title: newTitle })
          .eq("id", row.id);
      }
    }

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
      const message = err instanceof Error ? err.message : "anthropic_error";
      console.error(`[generate-chapter] Anthropic failed for ${userId}:`, err);
      return jsonResponse(502, { error: "anthropic_error", detail: message });
    }

    if (!slides || slides.length === 0) {
      return jsonResponse(502, { error: "slide_parsing_failed" });
    }

    // ── Resolve image slide ─────────────────────────────────────────
    const entryIds = weekEntries.map((e: { id: string }) => e.id);
    const { data: mediaRows } = await supabase
      .from("entry_media")
      .select("id, storage_path")
      .in("entry_id", entryIds)
      .eq("media_type", "image")
      .order("created_at", { ascending: true });

    const imageSlide = resolveImageSlide(mediaRows ?? []);

    // ── Insert chapter ──────────────────────────────────────────────
    const { data: chapter, error: chapterErr } = await supabase
      .from("chapters")
      .insert({
        user_id: userId,
        chapter_number: chapterNumber,
        ref_iso_week: refIsoWeek,
        ref_iso_week_year: refIsoWeekYear,
        ref_week_start_date: startDate,
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
      console.error(`[generate-chapter] insert failed for ${userId}:`, chapterErr);
      return jsonResponse(500, {
        error: "insert_failed",
        detail: chapterErr?.message ?? "unknown",
      });
    }

    const chapterTitle = `Chapter ${chapterNumber}: ${weekLabel}`;

    // Mirror as a Capsule entry — same as cron-chapters.
    await supabase.from("entries").insert({
      user_id: userId,
      title: chapterTitle,
      body: `Your ${weekLabel} chapter — ${weekEntries.length} moments captured.`,
      entry_type: "chapter",
      entry_date: startDate,
      entry_month: weekStart.month,
      entry_year: weekStart.year,
      date_precision: "exact",
      chapter_id: chapter.id,
    });

    // ── Push + email gating (visible-limit only) ────────────────────
    const pastVisibleLimit =
      !isPaid && existingWeeklyCount >= FREE_VISIBLE_LIMIT;
    const isLocked = pastVisibleLimit;

    let pushSent = 0;
    let emailSent = false;

    if (!pastVisibleLimit) {
      if (profile.notification_enabled) {
        const r = await dispatch(supabase, {
          userId,
          eventKey: `chapter_ready:${chapter.id}`,
          channel: "push",
          oneShot: true,
          payload: { chapter_id: chapter.id },
          push: {
            title: "Your chapter is ready",
            body: `${weekLabel} — ${weekEntries.length} moments woven into your story.`,
            data: { type: "chapter", chapter_id: chapter.id },
          },
        });
        pushSent = r.sent ? 1 : 0;
      }

      if (profile.email && profile.notification_enabled) {
        try {
          const { subject, html } = chapterEmail({
            displayName: profile.display_name,
            weekLabel,
            momentCount: weekEntries.length,
            chapterNumber,
            chapterId: chapter.id,
          });
          const r = await dispatch(supabase, {
            userId,
            eventKey: `chapter_ready_email:${chapter.id}`,
            channel: "email",
            oneShot: true,
            payload: { chapter_id: chapter.id },
            email: { to: profile.email, subject, html },
          });
          emailSent = r.sent;
        } catch (err) {
          console.error(
            `[generate-chapter] email failed for ${userId}:`,
            err
          );
        }
      }
    }

    return jsonResponse(200, {
      ok: true,
      chapterId: chapter.id,
      chapterNumber,
      weekStart: startDate,
      weekEnd: endDate,
      weekLabel,
      momentCount: weekEntries.length,
      slidesCount: slides.length,
      hasImageSlide: !!imageSlide,
      locked: isLocked,
      pushSent,
      emailSent,
      subscriptionStatus: profile.subscription_status,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("[generate-chapter] error:", message);
    return jsonResponse(500, { error: "internal_error", detail: message });
  }
});
