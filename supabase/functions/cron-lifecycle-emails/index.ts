/**
 * Lifecycle email trigger-checker.
 *
 * Runs hourly via pg_cron. For each user, evaluates every lifecycle
 * email's trigger condition and dispatches the matching email if:
 *   1. The condition is met.
 *   2. The user hasn't already received that exact email
 *      (lifecycle_dispatches one-shot enforcement).
 *   3. Premium pitches additionally honor a 7-day frequency cap
 *      across all premium variants (priority: thread > chapter >
 *      capsule_full > album).
 *
 * Replaces the legacy `cron-onboarding-emails` time-based drip. The
 * core insight: behavior-triggered emails get 4–9× higher CTR than
 * time-based ones — the ones the legacy drip used to send are still
 * here, but they fire when the user is *ready* (e.g. Pin/Album when
 * they've captured 3 moments without pinning), not on day-N.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env (Supabase secrets):
 *   - CRON_SECRET
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - RESEND_API_KEY
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { dispatch } from "../_shared/dispatch.ts";
import { lifecycleEmail } from "../_shared/email-templates/lifecycle.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  notification_enabled: boolean;
  subscription_status: string;
  total_moments: number | null;
  last_entry_date: string | null;
  created_at: string;
};

const PREMIUM_PRIORITY: string[] = [
  // Reactive variants are HIGHEST priority (they bypass the 7d cap
  // anyway, but listed here so the proactive checks below skip if
  // a reactive bump fired in the same run).
  "premium_threads_reactive",
  "premium_chapters_reactive",
  // Proactive — order matters: thread > chapter > capsule_full > album
  "premium_threads_proactive",
  "premium_chapters_proactive",
  "premium_capsule_full",
  "premium_album_5pins",
  "premium_album_15pins",
  "premium_album_25pins",
  "premium_album_50pins",
];

const PREMIUM_FREQ_CAP = { keyPrefix: "premium_", windowDays: 7 } as const;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** ISO week start (Monday 00:00 UTC) for "now". */
function thisIsoWeekStart(): Date {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - dow,
      0,
      0,
      0,
    ),
  );
}

/**
 * Lifetime moment count for a user (cheap — single covered index lookup
 * via profiles.total_moments). We pull it from the row already loaded
 * in `profiles` but expose this helper for clarity.
 */
function totalMoments(p: ProfileRow): number {
  return p.total_moments ?? 0;
}

async function countQuery(
  supabase: SupabaseClient,
  table: string,
  filters: (q: ReturnType<SupabaseClient["from"]>) => unknown,
): Promise<number> {
  // PostgREST count without rows.
  // deno-lint-ignore no-explicit-any
  const builder: any = supabase.from(table).select("id", {
    count: "exact",
    head: true,
  });
  filters(builder);
  const { count } = await builder;
  return count ?? 0;
}

async function alreadySentLifecycle(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lifecycle_dispatches")
    .select("id")
    .eq("user_id", userId)
    .eq("event_key", eventKey)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Resolves the highest-priority premium email this user qualifies for
 * RIGHT NOW. Returns null if none. Reactive variants take precedence —
 * they're triggered by an explicit paywall bump.
 */
async function resolvePremiumPitch(
  supabase: SupabaseClient,
  p: ProfileRow,
): Promise<string | null> {
  if (!p.email) return null;
  if (p.subscription_status !== "free") return null;

  // ------- REACTIVE -------
  // Look for any unhandled paywall_bump rows for this user. If the
  // bump is for a chapter/thread, fire the matching reactive email.
  // Reactive bypasses the freq cap (high intent signal).
  const { data: bumps } = await supabase
    .from("paywall_bumps")
    .select("id, surface, bumped_at")
    .eq("user_id", p.id)
    .is("followup_sent_at", null)
    .order("bumped_at", { ascending: false })
    .limit(1);

  const latestBump = bumps?.[0];
  if (latestBump) {
    const surface = latestBump.surface as string;
    if (surface === "thread") {
      if (!await alreadySentLifecycle(
        supabase,
        p.id,
        "premium_threads_reactive",
      )) {
        return "premium_threads_reactive";
      }
    } else if (surface === "chapter") {
      if (!await alreadySentLifecycle(
        supabase,
        p.id,
        "premium_chapters_reactive",
      )) {
        return "premium_chapters_reactive";
      }
    }
  }

  // ------- PROACTIVE -------
  // 7-day cross-premium cap: any premium_* dispatch in last 7 days.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("lifecycle_dispatches")
    .select("id")
    .eq("user_id", p.id)
    .gte("sent_at", since)
    .like("event_key", "premium_%")
    .limit(1)
    .maybeSingle();
  if (recent) return null;

  // (c1) Threads proactive — 5+ threads, ≥1 viewed
  const threadsTotal = await countQuery(supabase, "threads", (q) => {
    // deno-lint-ignore no-explicit-any
    return (q as any).eq("user_id", p.id).eq("dismissed", false);
  });
  if (threadsTotal >= 5) {
    const threadsSeen = await countQuery(supabase, "threads", (q) => {
      // deno-lint-ignore no-explicit-any
      return (q as any)
        .eq("user_id", p.id)
        .eq("dismissed", false)
        .not("viewed_at", "is", null);
    });
    if (
      threadsSeen >= 1 &&
      !await alreadySentLifecycle(
        supabase,
        p.id,
        "premium_threads_proactive",
      )
    ) {
      return "premium_threads_proactive";
    }
  }

  // (b1) Chapters proactive — 4+ chapters, ≥1 viewed
  const chaptersTotal = await countQuery(supabase, "chapters", (q) => {
    // deno-lint-ignore no-explicit-any
    return (q as any).eq("user_id", p.id);
  });
  if (chaptersTotal >= 4) {
    const chaptersSeen = await countQuery(supabase, "chapters", (q) => {
      // deno-lint-ignore no-explicit-any
      return (q as any)
        .eq("user_id", p.id)
        .not("viewed_at", "is", null);
    });
    if (
      chaptersSeen >= 1 &&
      !await alreadySentLifecycle(
        supabase,
        p.id,
        "premium_chapters_proactive",
      )
    ) {
      return "premium_chapters_proactive";
    }
  }

  // (a) Capsule full — 15+ moments
  if (totalMoments(p) >= 15) {
    if (
      !await alreadySentLifecycle(
        supabase,
        p.id,
        "premium_capsule_full",
      )
    ) {
      return "premium_capsule_full";
    }
  }

  // (d) Album pin tiers — 5 / 15 / 25 / 50
  const pinCount = await countQuery(supabase, "entries", (q) => {
    // deno-lint-ignore no-explicit-any
    return (q as any)
      .eq("user_id", p.id)
      .eq("entry_type", "moment")
      .eq("is_pinned", true);
  });

  for (const tier of [50, 25, 15, 5] as const) {
    if (pinCount >= tier) {
      const key = `premium_album_${tier}pins`;
      if (!await alreadySentLifecycle(supabase, p.id, key)) {
        return key;
      }
      break; // higher tiers checked first; if 50 already sent, don't fall to 25
    }
  }

  return null;
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-lifecycle-emails" });
  const startedAt = Date.now();
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, email, display_name, notification_enabled, subscription_status, total_moments, last_entry_date, created_at",
      )
      .not("email", "is", null);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    const sentByKey: Record<string, number> = {};

    const today = todayUTC();
    const isoWeekStart = thisIsoWeekStart();

    for (const p of profiles as ProfileRow[]) {
      try {
        if (!p.email) continue;

        // Pre-load some shared state for this user.
        const created = new Date(p.created_at);
        const accountAge = daysBetween(today, created);
        const hasMoments = totalMoments(p) >= 1;
        const dsl = p.last_entry_date
          ? daysBetween(today, new Date(p.last_entry_date + "T00:00:00Z"))
          : null;

        // ============================================================
        // PREMIUM PITCHES (highest priority — the conversion engine)
        // ============================================================
        const premiumKey = await resolvePremiumPitch(supabase, p);
        if (premiumKey) {
          const tpl = lifecycleEmail(premiumKey, {
            displayName: p.display_name,
          });
          if (tpl) {
            const r = await dispatch(supabase, {
              userId: p.id,
              eventKey: premiumKey,
              channel: "email",
              oneShot: true,
              email: { to: p.email, subject: tpl.subject, html: tpl.html },
            });
            if (r.sent) {
              totalSent++;
              sentByKey[premiumKey] = (sentByKey[premiumKey] ?? 0) + 1;

              // For reactive variants, stamp the latest paywall_bump
              // so we don't re-fire on the next tick.
              if (
                premiumKey === "premium_chapters_reactive" ||
                premiumKey === "premium_threads_reactive"
              ) {
                const surface =
                  premiumKey === "premium_chapters_reactive"
                    ? "chapter"
                    : "thread";
                await supabase
                  .from("paywall_bumps")
                  .update({ followup_sent_at: new Date().toISOString() })
                  .eq("user_id", p.id)
                  .eq("surface", surface)
                  .is("followup_sent_at", null);
              }
            }
          }
          // Premium took priority — skip lifecycle education emails this tick.
          continue;
        }

        // ============================================================
        // WIN-BACK (D7 / D14 / D30 since last capture)
        // Only relevant if they HAVE captured before. Brand-new users
        // who never captured fall through to lifecycle_day1_starter.
        // ============================================================
        if (hasMoments && dsl !== null && p.notification_enabled) {
          const winbackKey = dsl >= 30
            ? "winback_d30"
            : dsl >= 14
            ? "winback_d14"
            : dsl >= 7
            ? "winback_d7"
            : null;

          if (winbackKey) {
            const tpl = lifecycleEmail(winbackKey, {
              displayName: p.display_name,
            });
            if (tpl) {
              const r = await dispatch(supabase, {
                userId: p.id,
                eventKey: winbackKey,
                channel: "email",
                oneShot: true,
                email: { to: p.email, subject: tpl.subject, html: tpl.html },
              });
              if (r.sent) {
                totalSent++;
                sentByKey[winbackKey] = (sentByKey[winbackKey] ?? 0) + 1;
              }
            }
            // Win-back fired — also skip education emails this tick.
            continue;
          }
        }

        // ============================================================
        // EDUCATION / FEATURE EMAILS (behavior-triggered)
        // ============================================================

        // Day-1 starter — 24h+ old, never captured
        if (accountAge >= 1 && !hasMoments && p.notification_enabled) {
          await maybeSend(
            supabase,
            p,
            "lifecycle_day1_starter",
            sentByKey,
            (n) => (totalSent += n),
          );
        }

        // Dig Deeper — 24h+ since first capture (no good "completed Dig
        // Deeper" signal in the schema; using post-first-capture instead)
        if (
          hasMoments &&
          accountAge >= 1 &&
          totalMoments(p) >= 1
        ) {
          await maybeSend(
            supabase,
            p,
            "lifecycle_dig_deeper",
            sentByKey,
            (n) => (totalSent += n),
          );
        }

        // Pin / album — 3+ moments, 0 pins
        if (totalMoments(p) >= 3) {
          const pins = await countQuery(supabase, "entries", (q) => {
            // deno-lint-ignore no-explicit-any
            return (q as any)
              .eq("user_id", p.id)
              .eq("entry_type", "moment")
              .eq("is_pinned", true);
          });
          if (pins === 0) {
            await maybeSend(
              supabase,
              p,
              "lifecycle_pin_album",
              sentByKey,
              (n) => (totalSent += n),
            );
          }
        }

        // Sharing — 5+ moments, 0 shares
        if (totalMoments(p) >= 5) {
          const shares = await countQuery(supabase, "shared_entries", (q) => {
            // deno-lint-ignore no-explicit-any
            return (q as any).eq("user_id", p.id);
          });
          if (shares === 0) {
            await maybeSend(
              supabase,
              p,
              "lifecycle_sharing",
              sentByKey,
              (n) => (totalSent += n),
            );
          }
        }

        // Chapters intro — 4+ moments this ISO week, 0 chapters generated
        if (totalMoments(p) >= 4) {
          const weekMoments = await countQuery(supabase, "entries", (q) => {
            // deno-lint-ignore no-explicit-any
            return (q as any)
              .eq("user_id", p.id)
              .eq("entry_type", "moment")
              .eq("date_precision", "exact")
              .gte("entry_date", isoWeekStart.toISOString().slice(0, 10));
          });
          if (weekMoments >= 4) {
            const chapters = await countQuery(supabase, "chapters", (q) => {
              // deno-lint-ignore no-explicit-any
              return (q as any).eq("user_id", p.id);
            });
            if (chapters === 0) {
              await maybeSend(
                supabase,
                p,
                "lifecycle_chapters_intro",
                sentByKey,
                (n) => (totalSent += n),
              );
            }
          }
        }

        // Threads intro — 1+ thread surfaced + ≥24h since first thread
        // (let the user feel the surprise in-app first).
        {
          const { data: firstThread } = await supabase
            .from("threads")
            .select("created_at")
            .eq("user_id", p.id)
            .eq("dismissed", false)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (
            firstThread?.created_at &&
            daysBetween(today, new Date(firstThread.created_at)) >= 1
          ) {
            await maybeSend(
              supabase,
              p,
              "lifecycle_threads",
              sentByKey,
              (n) => (totalSent += n),
            );
          }
        }

        // Brain — 10+ moments
        if (totalMoments(p) >= 10) {
          await maybeSend(
            supabase,
            p,
            "lifecycle_brain",
            sentByKey,
            (n) => (totalSent += n),
          );
        }

        // Capsule flipbook — 15+ moments
        if (totalMoments(p) >= 15) {
          await maybeSend(
            supabase,
            p,
            "lifecycle_capsule",
            sentByKey,
            (n) => (totalSent += n),
          );
        }

        // Premium backstop — 20+ moments AND no premium_* dispatch in
        // last 14 days (resolvePremiumPitch already returned null, so
        // we know no premium pitch is firing this tick — but we don't
        // want this backstop to displace a future one, so the 14-day
        // window is a softer floor than the 7-day cap above).
        if (totalMoments(p) >= 20 && p.subscription_status === "free") {
          const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            .toISOString();
          const { data: recent } = await supabase
            .from("lifecycle_dispatches")
            .select("id")
            .eq("user_id", p.id)
            .gte("sent_at", since14)
            .like("event_key", "premium_%")
            .limit(1)
            .maybeSingle();
          if (!recent) {
            await maybeSend(
              supabase,
              p,
              "lifecycle_premium_backstop",
              sentByKey,
              (n) => (totalSent += n),
            );
          }
        }
      } catch (userErr) {
        const message = userErr instanceof Error
          ? userErr.message
          : String(userErr);
        console.error(`lifecycle email error for user ${p.id}:`, userErr);
        // Per-user errors get their own ERROR-level log so we can spot
        // recurring per-user failures (eg. malformed display_name) in
        // PostHog Logs without blowing up the wide event below.
        logger.error("lifecycle_email.user_error", {
          posthog_distinct_id: p.id,
          error: message,
        });
      }
    }

    logger.info("cron_lifecycle_emails.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      sent: totalSent,
      // Flatten the per-key counts onto the wide event so each can be
      // graphed independently without traversing a nested object.
      ...Object.fromEntries(
        Object.entries(sentByKey).map(([k, v]) => [`sent_${k}`, v]),
      ),
    });
    await logger.flush();

    return new Response(
      JSON.stringify({ ok: true, sent: totalSent, by_key: sentByKey }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-lifecycle-emails error:", message);
    logger.error("cron_lifecycle_emails.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

/**
 * Helper: render the email template, dispatch via the shared helper,
 * and bump the per-key counter on success. Centralized so the trigger
 * checks above stay readable.
 */
async function maybeSend(
  supabase: SupabaseClient,
  p: ProfileRow,
  eventKey: string,
  sentByKey: Record<string, number>,
  onSent: (n: number) => void,
): Promise<void> {
  if (!p.email) return;
  const tpl = lifecycleEmail(eventKey, { displayName: p.display_name });
  if (!tpl) return;
  const r = await dispatch(supabase, {
    userId: p.id,
    eventKey,
    channel: "email",
    oneShot: true,
    email: { to: p.email, subject: tpl.subject, html: tpl.html },
  });
  if (r.sent) {
    sentByKey[eventKey] = (sentByKey[eventKey] ?? 0) + 1;
    onSent(1);
  }
}
