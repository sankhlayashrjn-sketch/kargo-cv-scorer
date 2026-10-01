import { GeminiType, generateJson } from "@/lib/generate";

export interface ExtractedPii {
  name: string;
  email: string | null;
  phone: string | null;
  redactedText: string;
}

const SCHEMA = {
  type: GeminiType.OBJECT,
  properties: {
    name: { type: GeminiType.STRING, description: "The candidate's full name as it appears on the CV." },
    email: {
      type: GeminiType.STRING,
      nullable: true,
      description: "The candidate's email address, or null if none is present.",
    },
    phone: {
      type: GeminiType.STRING,
      nullable: true,
      description: "The candidate's phone number, or null if none is present.",
    },
    redactedCvText: {
      type: GeminiType.STRING,
      description:
        "The full CV text with the candidate's name, email, and phone number removed wherever they appear (replace each with [REDACTED]). Keep every other word — work experience, skills, education, dates, companies — exactly as written. Do not summarize or shorten.",
    },
  },
  required: ["name", "email", "phone", "redactedCvText"],
};

/**
 * Extraction is the one AI call that must see the raw CV. Its only job is to
 * split out name/email/phone so that every subsequent AI step (scoring,
 * brief, email drafting) only ever sees the redacted text.
 */
export async function extractPii(cvText: string): Promise<ExtractedPii> {
  const prompt = `Extract the candidate's personal details from this CV, and produce a redacted version with those details removed.

CV TEXT:
"""
${cvText}
"""`;

  const result = await generateJson<{
    name: string;
    email: string | null;
    phone: string | null;
    redactedCvText: string;
  }>(prompt, SCHEMA);

  return {
    name: result.name?.trim() || "Unnamed candidate",
    email: result.email?.trim() || null,
    phone: result.phone?.trim() || null,
    redactedText: result.redactedCvText?.trim() || cvText,
  };
}
