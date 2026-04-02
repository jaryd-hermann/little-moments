/**
 * Shared HTML email layout for Little Moments.
 *
 * Branding:
 *   Background  #FFFFEB (cream)
 *   Text        #1A1A1A
 *   Buttons     #f0d7ff fill, 1px #1A1A1A stroke, 24px border-radius
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

export const APP_URL = "https://getlittlemoments.com/open";

export function emailLayout(opts: { preheader?: string; body: string }): string {
  const wm = wordmarkUrl();
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Little Moments</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{color:#1A1A1A;}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFFFEB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${opts.preheader ? `<div style="display:none;font-size:1px;color:#FFFFEB;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${opts.preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFEB;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${wm}" alt="Little Moments" width="180" style="display:block;width:180px;height:auto;" />
            </td>
          </tr>
          <tr>
            <td style="color:#1A1A1A;font-size:16px;line-height:26px;">
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding-top:40px;border-top:1px solid rgba(0,0,0,0.1);text-align:center;color:rgba(0,0,0,0.4);font-size:13px;line-height:20px;">
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
export function ctaButton(label: string, url: string = APP_URL): string {
  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
  <tr>
    <td align="center" style="padding:0;">
      <a href="${url}" target="_blank" rel="noopener noreferrer" style="background-color:#f0d7ff;border:1px solid #1A1A1A;border-radius:24px;padding:12px 32px;display:inline-block;color:#1A1A1A;font-size:16px;font-weight:600;text-decoration:none;-webkit-border-radius:24px;mso-line-height-rule:exactly;line-height:1.25;">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}
