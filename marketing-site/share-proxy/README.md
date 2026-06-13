# Share URL proxy — getlittlemoments.com → Supabase edge functions

Public share links must be served with **`Content-Type: text/html; charset=utf-8`**.  
If Safari shows raw `<!DOCTYPE html>…` source, the marketing-site proxy is returning
**`text/plain`** (usually a Next.js route handler that forgot to set the header).

## Verify (use a real token from the app)

```bash
curl -sI "https://getlittlemoments.com/share/mashup/YOUR_TOKEN" | grep -i content-type
# ✅ Good: content-type: text/html; charset=utf-8
# ❌ Bad:  content-type: text/plain
```

Compare with moment shares (known good):

```bash
curl -sI "https://getlittlemoments.com/share/YOUR_MOMENT_TOKEN" | grep -i content-type
```

Direct Supabase (should always be HTML):

```bash
curl -sI "https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/shared-mashup/YOUR_TOKEN" | grep -i content-type
```

If Supabase is `text/html` but getlittlemoments.com is `text/plain`, fix the **marketing site** only.

---

## Option A — `vercel.json` rewrite (recommended; same as moment shares)

Add rewrites **above** the generic `/share/:token` rule:

```json
{
  "rewrites": [
    {
      "source": "/share/chapter/:token",
      "destination": "https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/shared-chapter/:token"
    },
    {
      "source": "/share/mashup/:token",
      "destination": "https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/shared-mashup/:token"
    },
    {
      "source": "/share/:token",
      "destination": "https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/shared-moment/:token"
    }
  ]
}
```

No app code — Vercel forwards the upstream body **and** `Content-Type` from Supabase.

**Do not** also add a Next.js page at `/share/mashup/[token]` — it will conflict and
often returns plain text.

---

## Option B — Next.js route handler (if you must proxy in code)

If you fetch Supabase in a Route Handler, you **must** forward `Content-Type`:

```typescript
// app/share/mashup/[token]/route.ts
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const upstream = await fetch(
    `https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/shared-mashup/${params.token}`
  );
  const html = await upstream.text();

  return new Response(html, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control":
        upstream.headers.get("Cache-Control") ?? "public, max-age=300",
    },
  });
}
```

Common bug (causes raw HTML in Safari):

```typescript
// ❌ Wrong — defaults to text/plain
return new Response(html);
```

Mirror the same pattern for `/share/chapter/[token]/route.ts`.

---

## Deploy checklist

1. Migration `0057_shared_mashups.sql` applied in prod
2. `supabase functions deploy shared-mashup --project-ref smwmkeoljqnifaoqzemb`
3. Marketing site rewrite or route handler deployed
4. `curl -sI` shows `text/html` on getlittlemoments.com
5. Tap link in Messages → vertical snippet player renders (not source view)
