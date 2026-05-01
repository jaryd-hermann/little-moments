/**
 * Shared HTML email layout for Little Moments.
 *
 * Branding:
 *   Background  #FFFFEB (cream)
 *   Text        #1A1A1A
 *   Buttons     #f0d7ff fill, 1px #1A1A1A stroke, 24px border-radius
 *
 * Dark mode (mobile Gmail / Apple Mail, etc.): many clients auto-invert light HTML and
 * break contrast. We opt into a light color scheme, re-assert brand colors under
 * `prefers-color-scheme: dark`, and use gradient + inset box-shadow (common Gmail workarounds).
 *
 * Wordmark: public Storage `brand/wordmark-little-moments-black.png`. Override with
 * Edge Function secret WORDMARK_URL if you ever move the file.
 */

/** Production wordmark — `brand` bucket, public object `wordmark-little-moments-black.png` */
const DEFAULT_WORDMARK =
  "https://smwmkeoljqnifaoqzemb.supabase.co/storage/v1/object/public/brand/wordmark-little-moments-black.png";

export function wordmarkUrl(): string {
  const fromProcess =
    typeof process !== "undefined" && process.env?.WORDMARK_URL?.trim()
      ? process.env.WORDMARK_URL.trim()
      : undefined;
  if (fromProcess) return fromProcess;
  const Deno_ = (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } })
    .Deno;
  const fromDeno = Deno_?.env?.get("WORDMARK_URL")?.trim();
  if (fromDeno) return fromDeno;
  return DEFAULT_WORDMARK;
}

/**
 * Primary CTA target for transactional emails.
 *
 * - In Supabase Edge Functions, `SUPABASE_URL` is set → CTAs use
 *   `{SUPABASE_URL}/functions/v1/open-app` (bridge page → `littlemoments://`).
 * - Override with `EMAIL_APP_OPEN_URL` (e.g. after you add `/open` on getlittlemoments.com).
 * - Local `npm run email:preview`: set `SUPABASE_URL` or `EMAIL_APP_OPEN_URL` in `.env` for correct links.
 */
export function resolveEmailAppOpenUrl(): string {
  const fromProcess =
    typeof process !== "undefined" && process.env?.EMAIL_APP_OPEN_URL?.trim()
      ? process.env.EMAIL_APP_OPEN_URL.trim()
      : undefined;
  if (fromProcess) return fromProcess;

  const Deno_ = (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno;
  const fromDeno = Deno_?.env?.get("EMAIL_APP_OPEN_URL")?.trim();
  if (fromDeno) return fromDeno;

  const supabaseFromProcess =
    typeof process !== "undefined" && process.env?.SUPABASE_URL?.trim()
      ? process.env.SUPABASE_URL.trim()
      : undefined;
  const supabaseUrl = supabaseFromProcess ?? Deno_?.env?.get("SUPABASE_URL")?.trim();
  if (supabaseUrl) {
    const base = supabaseUrl.replace(/\/$/, "");
    return `${base}/functions/v1/open-app`;
  }

  return "https://getlittlemoments.com/open";
}

const BG = "#FFFFEB";
const FG = "#1A1A1A";
const BTN = "#f0d7ff";

/** Inline stack that resists some clients stripping or inverting a lone background-color. */
function layerCream(extra: string): string {
  const base = `background-color:${BG};background-image:linear-gradient(${BG},${BG});`;
  return `${base}${extra}`;
}

export function emailLayout(opts: { preheader?: string; body: string }): string {
  const wm = wordmarkUrl();
  const shell = layerCream("");
  const padCell = layerCream(`box-shadow:inset 0 0 0 1000px ${BG};`);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Little Moments</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    :root{color-scheme:light only;}
    body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{color:${FG};}
    @media (prefers-color-scheme:dark){
      body.lm-root,table.lm-shell,td.lm-pad,td.lm-content,td.lm-footer{
        background-color:${BG}!important;
        background-image:linear-gradient(${BG},${BG})!important;
      }
      td.lm-pad{box-shadow:inset 0 0 0 1000px ${BG}!important;}
      body.lm-root,td.lm-content,td.lm-content p,td.lm-content strong{color:${FG}!important;}
      td.lm-footer,td.lm-footer p{color:rgba(0,0,0,0.4)!important;}
      td.lm-footer{border-top-color:rgba(0,0,0,0.1)!important;}
      a.lm-cta{background-color:${BTN}!important;color:${FG}!important;border-color:${FG}!important;}
      a{color:${FG}!important;}
    }
    [data-ogsc] body.lm-root,[data-ogsc] table.lm-shell,[data-ogsc] td.lm-pad,[data-ogsc] td.lm-content,[data-ogsc] td.lm-footer{
      background-color:${BG}!important;
      background-image:linear-gradient(${BG},${BG})!important;
    }
    [data-ogsc] td.lm-pad{box-shadow:inset 0 0 0 1000px ${BG}!important;}
    [data-ogsc] body.lm-root,[data-ogsc] td.lm-content,[data-ogsc] td.lm-content p{color:${FG}!important;}
    [data-ogsc] td.lm-footer,[data-ogsc] td.lm-footer p{color:rgba(0,0,0,0.4)!important;}
    [data-ogsc] a.lm-cta{background-color:${BTN}!important;color:${FG}!important;border-color:${FG}!important;}
    [data-ogsc] a{color:${FG}!important;}
  </style>
</head>
<body class="lm-root" style="margin:0;padding:0;${shell}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${opts.preheader ? `<div style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</div>` : ""}
  <table role="presentation" class="lm-shell" width="100%" cellpadding="0" cellspacing="0" style="${shell}">
    <tr>
      <td align="center" class="lm-pad" style="padding:40px 20px;${padCell}">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;${shell}">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${wm}" alt="Little Moments" width="180" style="display:block;width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td class="lm-content" style="color:${FG};font-size:16px;line-height:26px;${shell}">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td class="lm-footer" style="padding-top:40px;border-top:1px solid rgba(0,0,0,0.1);text-align:center;color:rgba(0,0,0,0.4);font-size:13px;line-height:20px;${shell}">
              <p style="margin:0;">Little Moments — made by Jaryd Hermann</p>
              <p style="margin:4px 0 0;">You received this because you have a Little Moments account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Rounded pill CTA: border + radius live on the &lt;a&gt; (inline-block), not the outer &lt;td&gt;,
 * so clients do not draw a square outline around a rounded fill.
 */
export function ctaButton(label: string, url: string = resolveEmailAppOpenUrl()): string {
  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
  <tr>
    <td align="center" style="padding:0;">
      <a class="lm-cta" href="${url}" target="_blank" rel="noopener noreferrer" style="background-color:${BTN};border:1px solid ${FG};border-radius:24px;padding:12px 32px;display:inline-block;color:${FG};font-size:16px;font-weight:600;text-decoration:none;-webkit-border-radius:24px;mso-line-height-rule:exactly;line-height:1.25;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}
