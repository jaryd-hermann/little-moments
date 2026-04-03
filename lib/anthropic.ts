import { supabase } from "./supabase";

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

  const { data, error } = await supabase.functions.invoke<DigDeeperResponse>(
    "dig-deeper",
    { body: request }
  );

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Dig Deeper returned no data");
  }

  return data;
}
