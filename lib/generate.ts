import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Calls Claude (if configured) or falls back to Gemini, forcing structured
 * JSON output per the given schema. `anthropicSchema`/`geminiSchema` describe
 * the same shape in each provider's own schema dialect.
 */
export async function generateJson<T>(
  prompt: string,
  toolName: string,
  anthropicSchema: Record<string, unknown>,
  geminiSchema: Record<string, unknown>
): Promise<T> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    throw new Error("No LLM API key is configured on the server (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
  }

  if (anthropicKey) {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      tools: [
        {
          name: toolName,
          description: `Submit the ${toolName} result.`,
          input_schema: anthropicSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: prompt }],
    });
    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!toolUse) throw new Error("Model did not return a structured result. Try again.");
    return toolUse.input as T;
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey as string });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: geminiSchema },
  });
  const text = response.text;
  if (!text) throw new Error("Model did not return a structured result. Try again.");
  return JSON.parse(text) as T;
}

export { Type as GeminiType };
