/**
 * Scheduled chapter generation: runs every 15 min via pg_cron.
 * On the 1st of each month, at 6:00am local time, generates AI chapter
 * for the entire previous calendar month for eligible users.
 *
 * Eligibility: trial|active subscription, ≥5 moment entries in previous month.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";
import {
  buildChapterPrompt,
  parseChapterSlidesResponse,
  resolveImageSlide,
  monthName,
} from "../_shared/chapters.ts";

const ANDROID_CHANNEL = "default";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  subscription_status: string;
  last_chapter_push_local_date: string | null;
};

Deno.serve(async (req) => {
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

    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("expo_push_token, platform, user_id");

    if (tokErr) {
      return new Response(JSON.stringify({ error: tokErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const list = tokens ?? [];
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, generated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(list.map((t: { user_id: string }) => t.user_id))];

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, notification_timezone, subscription_status, last_chapter_push_local_date"
      )
      .in("id", userIds);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const profileById = new Map(
      (profiles as ProfileRow[]).map((p) => [p.id, p])
    );

    const tokensByUser = new Map<string, string[]>();
    for (const row of list) {
      const arr = tokensByUser.get(row.user_id) ?? [];
      arr.push(row.expo_push_token);
      tokensByUser.set(row.user_id, arr);
    }

    let generated = 0;

    for (const userId of userIds) {
      const p = profileById.get(userId);
      if (!p) continue;

      if (p.subscription_status !== "trial" && p.subscription_status !== "active") {
        continue;
      }

      const tz = p.notification_timezone || "America/New_York";
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;

      if (local.day !== 1 || local.hour !== 6 || local.minute >= 20) continue;

      const todayStr = local.toISODate()!;
      if (p.last_chapter_push_local_date === todayStr) continue;

      const prev = local.minus({ months: 1 });
      const refYear = prev.year;
      const refMonth = prev.month;

      const startDate = `${refYear}-${String(refMonth).padStart(2, "0")}-01`;
      const endLocal = prev.endOf("month");
      const endDate = endLocal.toISODate()!;

      const { data: existingChapter } = await supabase
        .from("chapters")
        .select("id")
        .eq("user_id", userId)
        .eq("ref_year", refYear)
        .eq("ref_month", refMonth)
        .maybeSingle();

      if (existingChapter) {
        await supabase
          .from("profiles")
          .update({ last_chapter_push_local_date: todayStr })
          .eq("id", userId);
        continue;
      }

      const { data: monthEntries } = await supabase
        .from("entries")
        .select("id, title, body, entry_date")
        .eq("user_id", userId)
        .eq("entry_type", "moment")
        .eq("date_precision", "exact")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .order("entry_date", { ascending: true });

      if (!monthEntries || monthEntries.length < 5) continue;

      const { data: maxChapter } = await supabase
        .from("chapters")
        .select("chapter_number")
        .eq("user_id", userId)
        .order("chapter_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const chapterNumber = (maxChapter?.chapter_number ?? 0) + 1;

      let slides;
      try {
        const prompt = buildChapterPrompt(
          chapterNumber,
          refMonth,
          refYear,
          monthEntries.length,
          monthEntries
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
        console.error(`Chapter AI generation failed for user ${userId}:`, err);
        continue;
      }

      if (!slides || slides.length === 0) {
        console.error(`Chapter slide parsing failed for user ${userId}`);
        continue;
      }

      const entryIds = monthEntries.map((e: { id: string }) => e.id);

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
          user_id: userId,
          chapter_number: chapterNumber,
          ref_year: refYear,
          ref_month: refMonth,
          moment_count: monthEntries.length,
          slides,
          image_slide: imageSlide,
          source_entry_ids: entryIds,
          source_media_ids: imageSlide?.media_ids ?? [],
        })
        .select("id")
        .single();

      if (chapterErr || !chapter) {
        console.error(`Chapter insert failed for user ${userId}:`, chapterErr);
        continue;
      }

      const chapterTitle = `Chapter ${chapterNumber}: ${monthName(refMonth)}`;

      await supabase.from("entries").insert({
        user_id: userId,
        title: chapterTitle,
        body: `Your ${monthName(refMonth)} ${refYear} chapter — ${monthEntries.length} moments captured.`,
        entry_type: "chapter",
        entry_date: startDate,
        entry_month: refMonth,
        entry_year: refYear,
        date_precision: "month_only",
        chapter_id: chapter.id,
      });

      const pushTokens = tokensByUser.get(userId) ?? [];
      if (p.notification_enabled && pushTokens.length > 0) {
        const tickets = pushTokens.map((to) => ({
          to,
          title: "Your chapter is ready",
          body: `${monthName(refMonth)} — ${monthEntries.length} moments woven into your story.`,
          sound: "default" as const,
          priority: "high" as const,
          channelId: ANDROID_CHANNEL,
          data: { type: "chapter", chapterId: chapter.id },
        }));
        await sendExpoPushTickets(tickets);
      }

      await supabase
        .from("profiles")
        .update({ last_chapter_push_local_date: todayStr })
        .eq("id", userId);

      generated++;
    }

    return new Response(JSON.stringify({ ok: true, generated }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
