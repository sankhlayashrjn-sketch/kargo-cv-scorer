import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Every AI step in this pipeline (PII extraction, rubric scoring, brief,
 * email drafting) runs on Gemini Flash with forced structured JSON output.
 */
export async function generateJson<T>(prompt: string, schema: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema },
  });
  const text = response.text;
  if (!text) throw new Error("Model did not return a structured result. Try again.");
  return JSON.parse(text) as T;
}

export { Type as GeminiType };
