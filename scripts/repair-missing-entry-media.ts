/**
 * Rebuild `entry_media` rows for moments whose photo reached Supabase storage
 * but whose database row was never inserted — the second half of the
 * fire-and-forget save described in scripts/diagnose-missing-media.ts.
 *
 * Storage is the source of truth here: objects live at
 * `{user_id}/{entry_id}/{timestamp}.{jpg,mp4}`, so the entry id is recoverable
 * from the prefix alone.
 *
 * Pairing rule: a `.jpg` alongside an `.mp4` in the same entry folder is a Live
 * Photo, so the video becomes `paired_video_*` on the image row rather than a
 * row of its own. An `.mp4` on its own is a real video attachment.
 *
 * `taken_at` stays null: the original capture time only ever existed on device,
 * and object upload time is not a stand-in for it — it feeds "on this day"
 * anniversaries and Live Photo asset matching, both of which need the real
 * value or nothing. The UI falls back to `entries.entry_date`.
 *
 * Run:
 *   npx tsx scripts/repair-missing-entry-media.ts            # dry run
 *   npx tsx scripts/repair-missing-entry-media.ts --apply
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

const APPLY = process.argv.includes("--apply");

function publicUrl(path: string): string {
  return supabase.storage.from("entry-media").getPublicUrl(path).data.publicUrl;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("entries")
    .select("id, user_id, title, entry_date, entry_media(id)")
    .eq("entry_type", "moment")
    .not("photo_bucket_at_save", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const orphans = (rows ?? []).filter((r) => (r.entry_media ?? []).length === 0);
  console.log(
    `${orphans.length} moments saved with a photo but missing their media row\n`
  );

  let repaired = 0;
  let skipped = 0;

  for (const entry of orphans) {
    const prefix = `${entry.user_id}/${entry.id}`;
    const { data: objects } = await supabase.storage
      .from("entry-media")
      .list(prefix, { limit: 20 });

    // Supabase returns a null-id placeholder row for empty prefixes.
    const files = (objects ?? []).filter((f) => f.id != null);
    if (files.length === 0) {
      skipped += 1;
      continue;
    }

    const images = files.filter((f) => f.name.endsWith(".jpg"));
    const videos = files.filter((f) => f.name.endsWith(".mp4"));
    const title = String(entry.title ?? "(untitled)").slice(0, 40);

    const insert: Record<string, unknown>[] = [];

    if (images.length > 0) {
      const primary = images[0];
      const paired = videos[0] ?? null;
      insert.push({
        entry_id: entry.id,
        user_id: entry.user_id,
        storage_path: `${prefix}/${primary.name}`,
        storage_url: publicUrl(`${prefix}/${primary.name}`),
        media_type: "image",
        display_order: 0,
        taken_at: null,
        paired_video_storage_path: paired ? `${prefix}/${paired.name}` : null,
        paired_video_storage_url: paired
          ? publicUrl(`${prefix}/${paired.name}`)
          : null,
      });
      // Extra stills beyond the first keep their order behind it.
      images.slice(1).forEach((img, i) => {
        insert.push({
          entry_id: entry.id,
          user_id: entry.user_id,
          storage_path: `${prefix}/${img.name}`,
          storage_url: publicUrl(`${prefix}/${img.name}`),
          media_type: "image",
          display_order: i + 1,
          taken_at: null,
        });
      });
    } else {
      videos.forEach((vid, i) => {
        insert.push({
          entry_id: entry.id,
          user_id: entry.user_id,
          storage_path: `${prefix}/${vid.name}`,
          storage_url: publicUrl(`${prefix}/${vid.name}`),
          media_type: "video",
          display_order: i,
          taken_at: null,
        });
      });
    }

    const summary = insert
      .map((r) => `${r.media_type}${r.paired_video_storage_path ? "+live" : ""}`)
      .join(", ");
    console.log(
      `${APPLY ? "REPAIR" : "WOULD REPAIR"}  ${entry.entry_date}  ${title.padEnd(42)}  ${summary}`
    );

    if (APPLY) {
      const { error: insErr } = await supabase.from("entry_media").insert(insert);
      if (insErr) {
        console.error(`  failed: ${insErr.message}`);
        continue;
      }
    }
    repaired += 1;
  }

  console.log(
    `\n${APPLY ? "repaired" : "would repair"}: ${repaired}` +
      `\nno object in storage (unrecoverable): ${skipped}`
  );
  if (!APPLY && repaired > 0) {
    console.log(`\nRe-run with --apply to write these rows.`);
  }
}

main();
