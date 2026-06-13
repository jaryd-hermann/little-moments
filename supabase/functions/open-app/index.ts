/**
 * @deprecated Superseded by Universal Links / Android App Links targeting
 * `https://getlittlemoments.com/app/*` (see `app.config.ts`
 * `ios.associatedDomains` + `android.intentFilters`, the redirect router at
 * `app/+native-intent.tsx`, and the marketing-site files in
 * `marketing-site/universal-links/`).
 *
 * No new email template should target this URL — `resolveEmailAppOpenUrl()` /
 * `emailDeepLinks` now build Universal Link URLs instead.
 *
 * Kept deployed strictly so that emails already in users' inboxes (which
 * baked the Supabase URL into the CTA <a href>) still render a manual-tap
 * fallback rather than 404'ing. The deep link behavior on this page does NOT
 * work reliably from in-app email browsers (Gmail iOS, Outlook, LinkedIn) —
 * that is the original bug that motivated the Universal Links migration.
 * Once the oldest CTA-bearing emails age out of regular inbox traffic (~30
 * days), this function can be safely deleted.
 *
 * Deploy: `supabase functions deploy open-app`
 * Optional env: EMAIL_OPEN_WEB_FALLBACK (default https://getlittlemoments.com/)
 */
const DEFAULT_WEB_FALLBACK = "https://getlittlemoments.com/";
const APP_SCHEME = "littlemoments";
const ANDROID_PACKAGE = "com.jarydhermann.littlemoments";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const webFallback = Deno.env.get("EMAIL_OPEN_WEB_FALLBACK")?.trim() || DEFAULT_WEB_FALLBACK;
  const deepLink = `${APP_SCHEME}://`;
  const encodedFallback = encodeURIComponent(webFallback);
  const androidIntent =
    `intent://open#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodedFallback};end`;

  const safeDeep = escapeHtml(deepLink);
  const safeWeb = escapeHtml(webFallback);
  const safeIntent = escapeHtml(androidIntent);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Little Moments</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #ffffeb; color: #1a1a1a; margin: 0; padding: 2rem; text-align: center; }
    p { max-width: 22rem; margin: 1rem auto; line-height: 1.5; }
    a { color: #1a1a1a; font-weight: 600; }
    .btn { display: inline-block; margin-top: 1rem; padding: 12px 28px; border-radius: 24px;
      background: #f0d7ff; border: 1px solid #1a1a1a; text-decoration: none; color: #1a1a1a; }
  </style>
</head>
<body>
  <p>Opening Little Moments…</p>
  <p>If nothing happens, use one of the links below.</p>
  <p><a class="btn" href="${safeDeep}">Open the app</a></p>
  <p><a href="${safeIntent}">Open the app (Android)</a></p>
  <p><a href="${safeWeb}">Visit getlittlemoments.com</a></p>
  <script>
    (function () {
      var u = ${JSON.stringify(deepLink)};
      try { window.location.replace(u); } catch (e) {}
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    },
  });
});
