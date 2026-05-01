import { supabase } from "./supabase";

export type PromptType = "word" | "photo" | "question" | "freetext";

interface FollowUpRequest {
  raw_text: string;
  prompt_type: PromptType;
  prompt_value: string;
}

interface FollowUpResponse {
  question: string;
}

interface AssembleRequest {
  raw_text: string;
  prompt_type: PromptType;
  prompt_value: string;
  follow_up_answer: string | null;
}

interface AssembleResponse {
  title: string;
  body: string;
}

async function invokeMomentAssist<T>(body: Record<string, unknown>) {
  const invokeOnce = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const jwt = session?.access_token;
    return supabase.functions.invoke<T>("moment-assist", {
      body,
      ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}),
    });
  };

  let { data, error } = await invokeOnce();
  if (error) {
    await supabase.auth.refreshSession();
    ({ data, error } = await invokeOnce());
  }
  return { data, error };
}

export async function callMomentFollowUp(
  request: FollowUpRequest
): Promise<FollowUpResponse> {
  const { data, error } = await invokeMomentAssist<FollowUpResponse>({
    stage: "follow_up",
    ...request,
  });

  if (error) throw error;
  if (!data) throw new Error("moment-assist returned no data");
  return data;
}

export async function callMomentAssemble(
  request: AssembleRequest
): Promise<AssembleResponse> {
  const { data, error } = await invokeMomentAssist<AssembleResponse>({
    stage: "assemble",
    ...request,
  });

  if (error) throw error;
  if (!data) throw new Error("moment-assist returned no data");
  return data;
}
