import { supabase } from "./supabase";

export async function transcribeAudio(
  audioUri: string
): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const formData = new FormData();
  formData.append("audio", {
    uri: audioUri,
    name: "recording.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const { data, error } = await supabase.functions.invoke<{ text: string }>(
    "transcribe",
    { body: formData }
  );

  if (error) {
    throw error;
  }
  if (!data?.text) {
    throw new Error("Transcription returned no text");
  }

  return data.text;
}
