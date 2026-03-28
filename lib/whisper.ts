import { supabase } from "./supabase";
import Constants from "expo-constants";

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

  const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
  const response = await fetch(
    `${supabaseUrl}/functions/v1/transcribe`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.status}`);
  }

  const { text } = await response.json();
  return text;
}
