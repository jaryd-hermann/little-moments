import { supabase } from "./supabase";

export interface CoachingMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CoachingSession {
  id: string;
  user_id: string;
  entry_id: string;
  conversation: CoachingMessage[];
  feedback_summary: string | null;
  created_at: string;
  updated_at: string;
}

interface StoryCoachRequest {
  stage: "initial" | "follow_up";
  entry_id: string;
  title: string;
  body: string;
  original_body: string | null;
  conversation_history?: CoachingMessage[];
  user_message?: string;
}

interface StoryCoachResponse {
  message: string;
  feedback_summary?: string;
}

export async function callStoryCoach(
  request: StoryCoachRequest
): Promise<StoryCoachResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke<StoryCoachResponse>(
    "story-coach",
    { body: request }
  );

  if (error) throw error;
  if (!data) throw new Error("Story Coach returned no data");

  return data;
}

export async function loadCoachingSession(
  entryId: string
): Promise<CoachingSession | null> {
  const { data, error } = await supabase
    .from("coaching_sessions")
    .select("*")
    .eq("entry_id", entryId)
    .maybeSingle();

  if (error) throw error;
  return data as CoachingSession | null;
}

export async function createCoachingSession(
  entryId: string,
  userId: string
): Promise<CoachingSession> {
  const { data, error } = await supabase
    .from("coaching_sessions")
    .insert({
      entry_id: entryId,
      user_id: userId,
      conversation: [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as CoachingSession;
}

export async function updateCoachingConversation(
  sessionId: string,
  conversation: CoachingMessage[],
  feedbackSummary?: string
): Promise<void> {
  const update: Record<string, unknown> = { conversation };
  if (feedbackSummary !== undefined) {
    update.feedback_summary = feedbackSummary;
  }

  const { error } = await supabase
    .from("coaching_sessions")
    .update(update)
    .eq("id", sessionId);

  if (error) throw error;
}
