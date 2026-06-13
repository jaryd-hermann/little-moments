import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SHARE_PUBLIC_BASE = "https://getlittlemoments.com/share/mashup";
const APP_STORE_URL =
  "https://apps.apple.com/us/app/little-moments-a-2min-journal/id6761054988?utm_source=shared_mashup&utm_medium=web&utm_campaign=mashup_share";
const WORDMARK_URL =
  "https://smwmkeoljqnifaoqzemb.supabase.co/storage/v1/object/public/brand/wordmark-little-moments-black.png";
/** Cream text + purple mark — for dark playback backgrounds (matches in-app). */
const WORDMARK_LIGHT_URL =
  "https://smwmkeoljqnifaoqzemb.supabase.co/storage/v1/object/public/brand/wordmark-little-moments.png";

type ClipSnapshot = {
  storage_path?: string | null;
  media_type?: string;
  paired_video_storage_path?: string | null;
  title?: string | null;
  entry_date?: string | null;
  entry_id?: string;
};

type MashupShareRow = {
  label: string;
  clip_count: number;
  clip_snapshots: ClipSnapshot[] | null;
  preview_storage_path: string | null;
  user_id: string;
};

type WebSlide = {
  stillUrl: string | null;
  videoUrl: string | null;
  isVideo: boolean;
  isLivePhoto: boolean;
  title: string;
  date: string;
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPublicMediaUrl(storagePath: string): string {
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  return `${SUPABASE_URL}/storage/v1/object/public/entry-media/${storagePath}`;
}

function sharerDisplayName(displayName: string | null | undefined): string | null {
  const n = displayName?.trim();
  if (!n) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(n)) return null;
  return n;
}

function slideFromClip(clip: ClipSnapshot): WebSlide | null {
  const stillUrl = clip.storage_path
    ? getPublicMediaUrl(clip.storage_path)
    : null;
  const pairedUrl = clip.paired_video_storage_path
    ? getPublicMediaUrl(clip.paired_video_storage_path)
    : null;
  const isFullVideo = clip.media_type === "video";
  const videoUrl = isFullVideo ? stillUrl : pairedUrl;
  const isLivePhoto = Boolean(pairedUrl && !isFullVideo);

  if (!stillUrl && !videoUrl) return null;

  return {
    stillUrl,
    videoUrl,
    isVideo: Boolean(videoUrl),
    isLivePhoto,
    title: clip.title ?? "",
    date: clip.entry_date ?? "",
  };
}

function renderPage(
  mashup: MashupShareRow,
  sharer: { displayName: string | null; avatarUrl: string | null },
  shareUrl: string,
  previewUrl: string | null
): string {
  const slides = (mashup.clip_snapshots ?? [])
    .map(slideFromClip)
    .filter((s): s is WebSlide => s !== null);

  const ogImage =
    previewUrl ?? slides[0]?.stillUrl ?? slides[0]?.videoUrl ?? null;
  const pageTitle = `${mashup.label} \u2014 Little Moments`;
  const description = `${mashup.clip_count} moment${
    mashup.clip_count === 1 ? "" : "s"
  } stitched into a snippet movie.`;

  const slidesJson = JSON.stringify(slides);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  ${
    ogImage
      ? `<meta property="og:image" content="${escapeHtml(ogImage)}">`
      : ""
  }
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --cream: #FFFFEB;
      --ink: #1A1A1A;
      --cta-bg: #f0d7ff;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: Roboto, sans-serif;
      overflow: hidden;
    }
    #app { position: fixed; inset: 0; background: #000; }
    .slide {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 0.42s ease;
    }
    .slide.active { opacity: 1; z-index: 2; }
    .slide video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .ken-burns {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .ken-burns img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform: scale(1);
      animation: kenBurns 2s linear forwards;
    }
    @keyframes kenBurns {
      from { transform: scale(1); }
      to { transform: scale(1.1); }
    }
    .live-stack {
      position: relative;
      width: 100%;
      height: 100%;
    }
    .live-stack .poster {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }
    .live-stack video {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .chrome { transition: opacity 220ms ease; }
    body.on-complete .chrome { opacity: 0; pointer-events: none; }
    .progress {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      left: 12px;
      right: 12px;
      display: flex;
      gap: 4px;
      z-index: 20;
    }
    .seg {
      flex: 1;
      height: 2px;
      background: rgba(255,255,255,0.3);
      border-radius: 1px;
      overflow: hidden;
    }
    .seg-fill {
      height: 100%;
      width: 0%;
      background: #fff;
      transition: width linear;
    }
    .overlay {
      position: fixed;
      left: 0;
      right: 0;
      bottom: max(28px, env(safe-area-inset-bottom));
      padding: 0 24px;
      text-align: center;
      z-index: 20;
      pointer-events: none;
    }
    .label {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 28px;
      font-weight: 700;
      line-height: 1.25;
      text-shadow: 0 2px 12px rgba(0,0,0,0.65);
      margin-bottom: 8px;
    }
    .meta {
      font-size: 12px;
      letter-spacing: 0.4px;
      opacity: 0.85;
      background: rgba(0,0,0,0.55);
      display: inline-block;
      padding: 5px 12px;
      border-radius: 999px;
    }
    .header {
      position: fixed;
      top: max(36px, calc(env(safe-area-inset-top) + 24px));
      left: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 20;
    }
    .header img.logo {
      height: 18px;
      width: auto;
    }
    .header .who { font-size: 13px; opacity: 0.85; }
    .tap {
      position: fixed;
      top: 0;
      bottom: 0;
      width: 34%;
      z-index: 15;
    }
    .tap.left { left: 0; }
    .tap.right { right: 0; }
    .complete {
      position: fixed;
      inset: 0;
      background: var(--cream);
      color: var(--ink);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: calc(env(safe-area-inset-top, 0px) + 32px) 28px
               calc(env(safe-area-inset-bottom, 0px) + 32px);
      z-index: 100;
      text-align: center;
    }
    .complete.active { display: flex; }
    .complete-wordmark {
      height: 36px;
      width: auto;
      margin-bottom: 28px;
    }
    .complete-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 700;
      font-size: 24px;
      line-height: 32px;
      margin: 0 0 8px;
      max-width: 320px;
    }
    .complete-sub {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 16px;
      line-height: 24px;
      color: #5c5348;
      margin: 0;
      max-width: 300px;
    }
    .complete-actions {
      margin-top: 32px;
      width: 100%;
      max-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pill {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 56px;
      border-radius: 9999px;
      font-family: Roboto, sans-serif;
      font-weight: 500;
      font-size: 15px;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      text-decoration: none;
      cursor: pointer;
      border: 0;
      padding: 0 24px;
      -webkit-appearance: none;
      appearance: none;
      -webkit-tap-highlight-color: transparent;
    }
    .pill.primary {
      background: var(--cta-bg);
      color: var(--ink);
      border: 2px solid var(--ink);
      box-shadow: 0 5px 0 0 var(--ink);
    }
    .pill.secondary {
      background: transparent;
      color: var(--ink);
      border: 1.5px solid rgba(0,0,0,0.15);
      letter-spacing: 0.4px;
      text-transform: none;
      font-size: 14px;
      height: 48px;
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <div class="chrome">
    <div class="progress" id="progress"></div>
    <div class="header">
      <img class="logo" src="${WORDMARK_LIGHT_URL}" alt="Little Moments">
      ${
        sharer.displayName
          ? `<span class="who">Shared by ${escapeHtml(sharer.displayName)}</span>`
          : ""
      }
    </div>
    <div class="overlay">
      <div class="label" id="title">${escapeHtml(mashup.label)}</div>
      <div class="meta" id="meta">${mashup.clip_count} moments</div>
    </div>
    <div class="tap left" id="prev"></div>
    <div class="tap right" id="next"></div>
  </div>

  <div class="complete" id="complete">
    <img class="complete-wordmark" src="${WORDMARK_URL}" alt="Little Moments">
    <h1 class="complete-title">${escapeHtml(mashup.label)}</h1>
    <p class="complete-sub">${mashup.clip_count} moment${
      mashup.clip_count === 1 ? "" : "s"
    } stitched into a snippet movie.</p>
    <div class="complete-actions">
      <a class="pill primary" href="${APP_STORE_URL}">Download Little Moments</a>
      <button type="button" class="pill secondary" id="rewatch">Watch again</button>
    </div>
  </div>

  <script>
    (function () {
      var slides = ${slidesJson};
      var idx = 0;
      var DURATION = 2000;
      var app = document.getElementById('app');
      var progress = document.getElementById('progress');
      var titleEl = document.getElementById('title');
      var metaEl = document.getElementById('meta');
      var complete = document.getElementById('complete');
      var timer = null;
      var onComplete = false;

      slides.forEach(function () {
        var seg = document.createElement('div');
        seg.className = 'seg';
        var fill = document.createElement('div');
        fill.className = 'seg-fill';
        seg.appendChild(fill);
        progress.appendChild(seg);
      });

      function showComplete() {
        onComplete = true;
        app.innerHTML = '';
        document.body.classList.add('on-complete');
        complete.classList.add('active');
        var segs = progress.children;
        for (var i = 0; i < segs.length; i++) {
          segs[i].firstChild.style.width = '100%';
        }
      }

      function hideComplete() {
        onComplete = false;
        document.body.classList.remove('on-complete');
        complete.classList.remove('active');
      }

      function renderSlide(i) {
        app.innerHTML = '';
        var s = slides[i];
        if (!s) return;
        var el = document.createElement('div');
        el.className = 'slide active';

        if (s.isVideo && s.videoUrl) {
          if (s.isLivePhoto && s.stillUrl) {
            var stack = document.createElement('div');
            stack.className = 'live-stack';
            var poster = document.createElement('img');
            poster.className = 'poster';
            poster.src = s.stillUrl;
            poster.alt = '';
            var v = document.createElement('video');
            v.src = s.videoUrl;
            v.autoplay = true;
            v.loop = true;
            v.muted = true;
            v.playsInline = true;
            v.setAttribute('playsinline', '');
            stack.appendChild(poster);
            stack.appendChild(v);
            el.appendChild(stack);
          } else {
            var vid = document.createElement('video');
            vid.src = s.videoUrl;
            vid.autoplay = true;
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            el.appendChild(vid);
          }
        } else if (s.stillUrl) {
          var kb = document.createElement('div');
          kb.className = 'ken-burns';
          var img = document.createElement('img');
          img.src = s.stillUrl;
          img.alt = '';
          kb.appendChild(img);
          el.appendChild(kb);
        }

        app.appendChild(el);
        titleEl.textContent = s.title || ${JSON.stringify(mashup.label)};
        metaEl.textContent = s.date || '';
        updateProgress();
      }

      function updateProgress() {
        var segs = progress.children;
        for (var i = 0; i < segs.length; i++) {
          var fill = segs[i].firstChild;
          fill.style.transition = 'none';
          fill.style.width = i < idx ? '100%' : '0%';
        }
        if (!onComplete && segs[idx]) {
          var activeFill = segs[idx].firstChild;
          requestAnimationFrame(function () {
            activeFill.style.transition = 'width ' + DURATION + 'ms linear';
            activeFill.style.width = '100%';
          });
        }
      }

      function scheduleNext() {
        if (timer) clearTimeout(timer);
        if (onComplete) return;
        timer = setTimeout(function () {
          if (idx >= slides.length - 1) {
            showComplete();
          } else {
            go(idx + 1, false);
          }
        }, DURATION);
      }

      function go(n, fromTap) {
        if (timer) clearTimeout(timer);
        if (onComplete && !fromTap) return;
        hideComplete();
        idx = Math.max(0, Math.min(n, slides.length - 1));
        renderSlide(idx);
        scheduleNext();
      }

      document.getElementById('prev').addEventListener('click', function () {
        if (onComplete) {
          go(slides.length - 1, true);
          return;
        }
        if (idx > 0) go(idx - 1, true);
      });

      document.getElementById('next').addEventListener('click', function () {
        if (onComplete) return;
        if (idx < slides.length - 1) go(idx + 1, true);
        else showComplete();
      });

      document.getElementById('rewatch').addEventListener('click', function () {
        hideComplete();
        idx = 0;
        renderSlide(0);
        scheduleNext();
      });

      if (slides.length === 0) {
        titleEl.textContent = ${JSON.stringify(mashup.label)};
        metaEl.textContent = 'No media available';
        showComplete();
      } else {
        go(0, false);
      }
    })();
  </script>
</body>
</html>`;
}

function render404(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not Found</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;background:#FFFFEB;">
  <div style="text-align:center;padding:40px;"><h1>Snippet not found</h1><p>This link may have expired.</p></div>
</body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const token = pathParts[pathParts.length - 1];

  if (!token || token === "shared-mashup") {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: share, error: shareErr } = await supabase
    .from("shared_mashups")
    .select("label, clip_count, clip_snapshots, preview_storage_path, user_id")
    .eq("share_token", token)
    .single();

  if (shareErr || !share) {
    return new Response(render404(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", share.user_id)
    .single();

  const previewUrl = share.preview_storage_path
    ? getPublicMediaUrl(share.preview_storage_path)
    : null;
  const shareUrl = `${SHARE_PUBLIC_BASE}/${token}`;

  const html = renderPage(
    share as MashupShareRow,
    {
      displayName: sharerDisplayName(profile?.display_name),
      avatarUrl: profile?.avatar_url ?? null,
    },
    shareUrl,
    previewUrl
  );

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
