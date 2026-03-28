import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";

export async function exportToJSON(userId: string): Promise<void> {
  const { data: entries } = await supabase
    .from("entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const exportData = {
    exported_at: new Date().toISOString(),
    profile,
    entries: entries ?? [],
  };

  const fileUri =
    FileSystem.documentDirectory + "little-moments-backup.json";
  await FileSystem.writeAsStringAsync(
    fileUri,
    JSON.stringify(exportData, null, 2)
  );

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Export Little Moments Backup",
    });
  }
}
