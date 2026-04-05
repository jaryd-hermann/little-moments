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

export async function callMomentFollowUp(
  request: FollowUpRequest
): Promise<FollowUpResponse> {
  const { data, error } = await supabase.functions.invoke<FollowUpResponse>(
    "moment-assist",
    { body: { stage: "follow_up", ...request } }
  );

  if (error) throw error;
  if (!data) throw new Error("moment-assist returned no data");
  return data;
}

export async function callMomentAssemble(
  request: AssembleRequest
): Promise<AssembleResponse> {
  const { data, error } = await supabase.functions.invoke<AssembleResponse>(
    "moment-assist",
    { body: { stage: "assemble", ...request } }
  );

  if (error) throw error;
  if (!data) throw new Error("moment-assist returned no data");
  return data;
}
