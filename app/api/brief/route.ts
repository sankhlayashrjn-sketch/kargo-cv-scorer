import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { ROLE_LABELS, Role, CriterionResult, InterviewBrief } from "@/lib/rubric";

export const runtime = "nodejs";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 short, specific strengths grounded in the CV and the rubric scoring.",
    },
    probeAreas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          area: { type: Type.STRING, description: "The rubric criterion or gap this question targets." },
          question: { type: Type.STRING, description: "A specific interview question to ask." },
        },
        required: ["area", "question"],
      },
      description:
        "3-5 targeted interview questions, prioritizing criteria that scored low or had no supporting evidence in the CV.",
    },
    summary: {
      type: Type.STRING,
      description:
        "A short (2-4 sentence) neutral summary framed as input for the interviewer, not a hiring decision.",
    },
    email: {
      type: Type.OBJECT,
      properties: {
        subject: { type: Type.STRING },
        body: {
          type: Type.STRING,
          description:
            "A warm, professional draft email inviting the candidate to interview. Must reference at least one concrete, specific detail from their CV. Do not promise an offer or outcome. This is a draft for the founder to review and edit before sending.",
        },
      },
      required: ["subject", "body"],
    },
  },
  required: ["strengths", "probeAreas", "summary", "email"],
};

function buildPrompt(candidateName: string, role: Role, cvText: string, criteria: CriterionResult[]) {
  const roleLabel = ROLE_LABELS[role];
  const criteriaBlock = criteria
    .map(
      (c) =>
        `- ${c.label} (weight ${c.weight}%, score ${c.score}/100): ${c.rationale || "(no rationale)"}\n  Evidence: "${c.evidence}"`
    )
    .join("\n");

  return `You are helping a founder at Kargo prepare for an interview with a candidate for the role of ${roleLabel}.

The candidate's CV was already scored against Kargo's hiring rubric. Here is that scoring:

${criteriaBlock}

Using the CV text below and the scoring above, produce:

1. strengths: 3-5 specific strengths, grounded in the CV text, not generic praise.
2. probeAreas: 3-5 targeted interview questions. Prioritize criteria that scored low or where the evidence says "No matching evidence found" — these are the gaps the interviewer should probe directly, not softball questions about strengths.
3. summary: a short, neutral summary for the interviewer. Make clear this is input to help them prepare, not a hiring recommendation or decision.
4. email: a draft outreach email inviting the candidate (${candidateName}) to interview. It must reference at least one concrete, specific detail from their actual CV (not a generic template). Do not promise an offer, a specific outcome, or compensation. This is a draft only — the founder will review and send it themselves.

CV TEXT:
"""
${cvText}
"""`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role: Role = body.role === "senior_pm" ? "senior_pm" : "pm";
    const cvText: string = typeof body.cvText === "string" ? body.cvText.trim() : "";
    const candidateName: string =
      typeof body.candidateName === "string" && body.candidateName.trim()
        ? body.candidateName.trim()
        : "the candidate";
    const criteria: CriterionResult[] = Array.isArray(body.criteria) ? body.criteria : [];

    if (!cvText || criteria.length === 0) {
      return NextResponse.json({ error: "cvText and criteria are required" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured on the server. Add it to .env.local and restart the dev server." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(candidateName, role, cvText, criteria),
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: "Model did not return a brief. Try again." }, { status: 502 });
    }

    const parsed = JSON.parse(text) as InterviewBrief;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Brief generation failed: ${msg}` }, { status: 500 });
  }
}
