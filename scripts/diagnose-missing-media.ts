/**
 * Diagnose moments that were saved with a photo attached but have no
 * `entry_media` row — the "· placeholder in Capsule, no media on the detail
 * screen" bug.
 *
 * `entries.photo_bucket_at_save` is written synchronously when the user picks
 * a photo, while the upload + `entry_media.insert` happen in a fire-and-forget
 * task afterwards. A moment with that column set and zero media rows is one
 * whose upload failed after the entry was already saved.
 *
 * Read-only.
 *
 * Run:
 *   npx tsx scripts/diagnose-missing-media.ts                  # all users
 *   npx tsx scripts/diagnose-missing-media.ts --email me@x.com
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = vRaw.replace(/^['"]|['"]$/g, "");
  }
} catch {
  // .env optional
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function main() {
  const emailIdx = process.argv.indexOf("--email");
  let userId: string | null = null;
  if (emailIdx !== -1) {
    const email = process.argv[emailIdx + 1];
    const { data } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();
    if (!data) {
      console.error(`No profile for ${email}`);
      process.exit(1);
    }
    userId = data.id;
    console.log(`User ${email} → ${userId}\n`);
  }

  let q = supabase
    .from("entries")
    .select(
      "id, user_id, title, entry_date, created_at, photo_bucket_at_save, entry_media(id, storage_path, storage_url, media_type)"
    )
    .eq("entry_type", "moment")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (userId) q = q.eq("user_id", userId);

  const { data: rows, error } = await q;
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const moments = rows ?? [];
  const noMedia = moments.filter((m) => (m.entry_media ?? []).length === 0);
  const expectedPhoto = noMedia.filter((m) => m.photo_bucket_at_save != null);
  const nullUrl = moments.filter((m) =>
    (m.entry_media ?? []).some(
      (md: { storage_url: string | null }) => !md.storage_url
    )
  );

  console.log(`moments scanned        ${moments.length}`);
  console.log(`  no entry_media row   ${noMedia.length}`);
  console.log(`  ...of those, saved with a photo attached: ${expectedPhoto.length}`);
  console.log(`  media row w/ null storage_url  ${nullUrl.length}`);

  if (expectedPhoto.length === 0) return;

  // Which half of the save failed? Storage paths are
  // `{user_id}/{entry_id}/{timestamp}.jpg`, so a listing under that prefix
  // separates "upload worked, insert didn't" (rebuildable from storage) from
  // "the upload never landed" (the photo only ever existed on device).
  console.log(`\nMoments that lost their photo:`);
  let recoverable = 0;
  let lost = 0;
  for (const m of expectedPhoto) {
    const { data: objects } = await supabase.storage
      .from("entry-media")
      .list(`${m.user_id}/${m.id}`, { limit: 10 });
    const files = (objects ?? []).filter((f) => f.id != null);
    const title = String(m.title ?? "(untitled)").slice(0, 42).padEnd(42);
    if (files.length > 0) {
      recoverable += 1;
      console.log(
        `  RECOVERABLE  ${m.entry_date}  ${title}  ${files.map((f) => f.name).join(", ")}`
      );
    } else {
      lost += 1;
      console.log(
        `  NO OBJECT    ${m.entry_date}  ${title}  saved ${new Date(m.created_at).toISOString()}`
      );
    }
  }

  console.log(`\nobject in storage, row missing: ${recoverable}`);
  console.log(`upload never landed:            ${lost}`);
}

main();
