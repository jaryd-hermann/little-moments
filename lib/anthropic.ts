import { supabase } from "./supabase";
import Constants from "expo-constants";

interface DigDeeperRequest {
  stage: "initial" | "follow_up" | "enhance" | "revise";
  title: string;
  body: string;
  is_crash_and_burn: boolean;
  conversation_history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  user_answers?: string;
  revision_request?: string;
  round?: number;
}

interface DigDeeperResponse {
  message: string;
  questions?: string[];
  enhanced_body?: string;
  enhanced_title?: string;
}

export async function callDigDeeper(
  request: DigDeeperRequest
): Promise<DigDeeperResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
  const response = await fetch(
    `${supabaseUrl}/functions/v1/dig-deeper`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );

  if (!response.ok) {
    throw new Error(`Dig Deeper request failed: ${response.status}`);
  }

  return response.json();
}
