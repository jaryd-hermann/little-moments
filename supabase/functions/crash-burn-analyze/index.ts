import Anthropic from "npm:@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const { race_text, word_of_day } = await req.json();

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You analyze "Crash & Burn" freewriting races. The user wrote continuously for 2+ minutes starting from a single word. Your job is to find the story seeds — specific memories, people, or moments that surfaced. Be warm and observant. Return JSON with "message" (your observation) and "questions" (2-3 questions about the specific memories you detected).`,
      messages: [
        {
          role: "user",
          content: `Starting word: "${word_of_day}"\n\nRace text:\n${race_text}\n\nWhat memories or stories do you see emerging from this writing?`,
        },
      ],
    });

    const responseText =
      response.content[0].type === "text"
        ? response.content[0].text
        : "";

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { message: responseText };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Analysis failed", details: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
