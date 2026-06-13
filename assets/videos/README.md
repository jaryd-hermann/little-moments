# Splash video

Drop the encoded splash loop here as `splash.mp4`. `app/splash.tsx`
`require`s it directly, so the filename is load-bearing — keep it
`splash.mp4`.

## Recommended encode

HEVC (H.265), no audio, 4–6s loop, 1080×1920. Tuned for ~150–500 KB.

```bash
ffmpeg -i input.mov \
  -an \
  -c:v libx265 -tag:v hvc1 \
  -crf 30 -preset slow \
  -pix_fmt yuv420p \
  -vf "scale=-2:1920:flags=lanczos,fps=30" \
  -movflags +faststart \
  assets/videos/splash.mp4
```

`-tag:v hvc1` is required for iOS/AVPlayer; without it the file plays
on Android but is silent on iOS.

`1.png` is intentionally kept as a poster behind the `VideoView` in
`app/splash.tsx` so the very first frame never flashes black while the
player attaches.
