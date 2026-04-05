import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SHARE_PUBLIC_BASE = "https://getlittlemoments.com/share";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(
  entryDate: string | null,
  entryMonth: number | null,
  entryYear: number
): string {
  if (entryDate) {
    const d = new Date(entryDate + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  if (entryMonth) {
    const d = new Date(entryYear, entryMonth - 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return String(entryYear);
}

function getPublicMediaUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/entry-media/${storagePath}`;
}

function renderPage(
  entry: {
    title: string | null;
    body: string;
    entry_date: string | null;
    entry_month: number | null;
    entry_year: number;
    word_of_day: string | null;
  },
  media: { storage_path: string; storage_url: string | null; display_order: number }[],
  _displayName: string | null,
  shareUrl: string
): string {
  const title = entry.title || "A Little Moment";
  const plainBody = stripHtml(entry.body);
  const ogDescription = plainBody.length > 150 ? plainBody.slice(0, 147) + "..." : plainBody;

  const sortedMedia = [...media].sort((a, b) => a.display_order - b.display_order);
  const firstImage = sortedMedia.length > 0 ? sortedMedia[0] : null;
  const ogImageUrl = firstImage
    ? (firstImage.storage_url || getPublicMediaUrl(firstImage.storage_path))
    : "";

  const bodyParagraphs = plainBody
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p style="font-size:16px;line-height:1.75;color:#1A1A1A;margin:0 0 16px 0;font-family:'Libre Baskerville',Georgia,serif;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const imagesHtml = sortedMedia
    .map(
      (m) =>
        `<img src="${escapeHtml(m.storage_url || getPublicMediaUrl(m.storage_path))}" alt="" style="width:100%;border-radius:12px;display:block;background:#f5f0e0;" loading="lazy">`
    )
    .join("");

  const wordHtml = entry.word_of_day
    ? `<div style="margin-top:12px;font-family:'Roboto',sans-serif;font-weight:400;font-size:13px;color:#8a7a6b;font-style:italic;">today&#8217;s word: ${escapeHtml(entry.word_of_day).toLowerCase()}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} \u2014 Little Moments</title>

  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}">` : ""}
  <meta property="og:site_name" content="Little Moments">

  <meta name="twitter:card" content="${ogImageUrl ? "summary_large_image" : "summary"}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  ${ogImageUrl ? `<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">` : ""}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FFFFEB;color:#1A1A1A;font-family:'Libre Baskerville',Georgia,serif;min-height:100vh;-webkit-font-smoothing:antialiased;">

  <div style="max-width:600px;margin:0 auto;padding:0 24px;">

    <header style="padding:28px 0 20px;text-align:center;">
      <img src="https://getlittlemoments.com/wordmark-black.png" alt="Little Moments" style="height:36px;display:inline-block;">
      <p style="font-family:'Roboto',sans-serif;font-weight:400;font-size:13px;color:#8a7a6b;margin:12px 0 0 0;">A moment has been shared with you</p>
    </header>

    <div style="width:100%;height:1px;background:rgba(0,0,0,0.06);"></div>

    <article style="padding:32px 0 40px;">
      ${imagesHtml ? `<div style="margin-bottom:24px;display:flex;flex-direction:column;gap:12px;">${imagesHtml}</div>` : ""}

      <h1 style="font-family:'Libre Baskerville',Georgia,serif;font-size:24px;font-weight:700;line-height:1.35;color:#1A1A1A;margin:0;">${escapeHtml(title)}</h1>

      ${wordHtml}

      <div style="margin-top:28px;">
        ${bodyParagraphs}
      </div>
    </article>

    <div style="width:100%;height:1px;background:rgba(0,0,0,0.06);"></div>

    <footer style="padding:32px 0 48px;text-align:center;">
      <p style="font-family:'Libre Baskerville',Georgia,serif;font-weight:400;font-size:15px;line-height:1.6;color:#1A1A1A;margin:0 0 24px 0;">Capture a lifetime of memories,<br>starting with a single word.<br>Join them for free.</p>
      <a href="https://getlittlemoments.com?utm_source=shared_moment&amp;utm_medium=web&amp;utm_campaign=moment_share" style="display:inline-block;font-family:'Roboto',sans-serif;font-weight:500;font-size:14px;color:#1A1A1A;background:#f0d7ff;padding:14px 36px;border-radius:9999px;text-decoration:none;border:2px solid #1A1A1A;">Learn about Little Moments</a>
    </footer>

  </div>
</body>
</html>`;
}

function render404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Not Found \u2014 Little Moments</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Roboto:wght@300;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#FFFFEB;color:#1A1A1A;font-family:'Libre Baskerville',Georgia,serif;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px 20px;">
  <div>
    <div style="font-family:'Libre Baskerville',Georgia,serif;font-size:18px;font-weight:700;color:#1A1A1A;margin-bottom:32px;">Little Moments</div>
    <h1 style="font-size:22px;margin:0 0 12px 0;color:#1A1A1A;">Moment not found</h1>
    <p style="font-family:'Roboto',sans-serif;font-weight:300;font-size:14px;color:#8a7a6b;margin:0 0 24px 0;">This link may have expired or been removed.</p>
    <a href="https://getlittlemoments.com?utm_source=shared_moment&amp;utm_medium=web&amp;utm_campaign=moment_share" style="display:inline-block;font-family:'Roboto',sans-serif;font-weight:500;font-size:14px;color:#1A1A1A;background:#f0d7ff;padding:14px 32px;border-radius:9999px;text-decoration:none;border:2px solid #1A1A1A;">Visit Little Moments</a>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // URL pattern: /shared-moment/TOKEN
  const token = pathParts[pathParts.length - 1];

  if (!token || token === "shared-moment") {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: share, error: shareErr } = await supabase
    .from("shared_entries")
    .select("entry_id, user_id")
    .eq("share_token", token)
    .single();

  if (shareErr || !share) {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: entry, error: entryErr } = await supabase
    .from("entries")
    .select("title, body, entry_date, entry_month, entry_year, word_of_day")
    .eq("id", share.entry_id)
    .single();

  if (entryErr || !entry) {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: media } = await supabase
    .from("entry_media")
    .select("storage_path, storage_url, display_order")
    .eq("entry_id", share.entry_id)
    .order("display_order", { ascending: true });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", share.user_id)
    .single();

  const shareUrl = `${SHARE_PUBLIC_BASE}/${token}`;

  const html = renderPage(
    entry,
    media ?? [],
    profile?.display_name ?? null,
    shareUrl
  );

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
