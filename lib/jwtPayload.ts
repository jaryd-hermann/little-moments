/**
 * Decode a JWT payload (middle segment) without verifying the signature.
 * For debugging auth issues only (e.g. comparing `aud` to Supabase Apple Client ID).
 */
export function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segments = token.split(".");
    if (segments.length < 2) return null;
    const segment = segments[1];
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(padLen);
    const g = globalThis as typeof globalThis & { atob?: (s: string) => string };
    if (typeof g.atob !== "function") return null;
    const json = g.atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jwtAudience(token: string): string | undefined {
  const payload = readJwtPayload(token);
  if (!payload) return undefined;
  const aud = payload.aud;
  if (typeof aud === "string") return aud;
  if (Array.isArray(aud) && typeof aud[0] === "string") return aud[0];
  return undefined;
}
