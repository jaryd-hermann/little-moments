import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Reverse-geocode lat/lng to a "City, Country" label.
 *
 * Uses BigDataCloud's free client-side endpoint (no key required, ~1k QPM
 * generous limit). Results are cached in AsyncStorage keyed by rounded
 * coords so the same neighborhood only resolves once across captures.
 *
 * Returns `null` on missing input, network failure, or "no useful name"
 * responses. Callers should treat absence as "skip the location pill" —
 * we never want a half-baked string in the UI.
 */

const CACHE_PREFIX = "lm.geo.v1.";
// We deliberately store IN-MEMORY too so the same render pass that resolves
// "today's past photo" doesn't fire N parallel fetches for the same coords.
const memoryCache = new Map<string, string | null>();
// Track in-flight promises so concurrent callers share a single fetch.
const inflight = new Map<string, Promise<string | null>>();

function roundKey(lat: number, lng: number): string {
  // ~100m precision — good enough for "same neighborhood = same label" but
  // not so coarse that adjacent cities collapse together.
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `${r(lat)},${r(lng)}`;
}

function buildLabelFromBigDataCloud(json: any): string | null {
  if (!json || typeof json !== "object") return null;
  // Prefer locality (city) + country, with fallbacks for rural areas.
  const city: string | undefined =
    json.city || json.locality || json.principalSubdivision;
  const country: string | undefined = json.countryName;
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

export async function reverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined
): Promise<string | null> {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0) // skip the null-island artifact some libraries emit
  ) {
    return null;
  }
  const key = roundKey(lat, lng);
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;

  const inflightHit = inflight.get(key);
  if (inflightHit) return inflightHit;

  const work = (async (): Promise<string | null> => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (stored != null) {
        const parsed = stored === "" ? null : stored;
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Cache miss; fall through to network.
    }

    let label: string | null = null;
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        label = buildLabelFromBigDataCloud(json);
      }
    } catch {
      label = null;
    }

    memoryCache.set(key, label);
    try {
      await AsyncStorage.setItem(CACHE_PREFIX + key, label ?? "");
    } catch {
      // Storage write failures are non-fatal; the memory cache still helps.
    }
    return label;
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}
