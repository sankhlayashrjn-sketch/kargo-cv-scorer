import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";
import { RUBRIC, ROLE_LABELS, Role, CriterionResult, ScoreResult } from "@/lib/rubric";

export const runtime = "nodejs";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

type RawScores = Record<string, { score: number; evidence: string; rationale: string }>;

function buildPrompt(role: Role, cvText: string) {
  const criteria = RUBRIC[role];
  const roleLabel = ROLE_LABELS[role];
  const criteriaBlock = criteria
    .map((c, i) => `${i + 1}. ${c.label} (weight ${c.weight}%)\n   ${c.description}`)
    .join("\n\n");

  return `You are scoring a candidate's CV against Kargo's fixed hiring rubric for the role of ${roleLabel}.

Score the CV strictly against each of the following criteria, using ONLY textual evidence found in the CV below. Do not guess generously — if the CV is silent on a criterion, or the evidence is thin/generic, score it low. Reward specificity (named incidents, named artifacts, concrete scope of adoption) over vague claims or metrics with no supporting narrative.

CRITERIA:

${criteriaBlock}

For each criterion, provide:
- score: 0-100
- evidence: a direct quote from the CV (or "No matching evidence found in the CV." if none exists)
- rationale: 1-2 sentences on why the evidence does or doesn't meet the strong-candidate bar

CV TEXT:
"""
${cvText}
"""`;
}

function buildAnthropicTool(role: Role) {
  const criteria = RUBRIC[role];
  const properties: Record<string, unknown> = {};
  for (const c of criteria) {
    properties[c.key] = {
      type: "object",
      properties: {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description:
            "0-100 score for this criterion, based strictly on textual evidence in the CV. If the CV is silent on this criterion, score it low, not a middling default.",
        },
        evidence: {
          type: "string",
          description:
            'A direct quote (or close paraphrase with line reference) from the CV that justifies the score. If there is no matching evidence in the CV, this must literally state "No matching evidence found in the CV."',
        },
        rationale: {
          type: "string",
          description:
            "One to two sentences explaining how the evidence does or does not meet the strong-candidate bar for this criterion.",
        },
      },
      required: ["score", "evidence", "rationale"],
    };
  }
  return {
    name: "submit_scores",
    description: "Submit the per-criterion scores, evidence, and rationale for this candidate's CV.",
    input_schema: {
      type: "object" as const,
      properties,
      required: criteria.map((c) => c.key),
    },
  };
}

function buildGeminiSchema(role: Role) {
  const criteria = RUBRIC[role];
  const properties: Record<string, unknown> = {};
  for (const c of criteria) {
    properties[c.key] = {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: "0-100 score based strictly on textual evidence in the CV." },
        evidence: {
          type: Type.STRING,
          description:
            'A direct quote from the CV that justifies the score, or "No matching evidence found in the CV." if none exists.',
        },
        rationale: { type: Type.STRING, description: "1-2 sentences on why the evidence does or doesn't meet the bar." },
      },
      required: ["score", "evidence", "rationale"],
    };
  }
  return {
    type: Type.OBJECT,
    properties,
    required: criteria.map((c) => c.key),
  };
}

async function scoreWithClaude(role: Role, cvText: string, apiKey: string): Promise<RawScores> {
  const anthropic = new Anthropic({ apiKey });
  const tool = buildAnthropicTool(role);

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2000,
    tools: [tool],
    tool_choice: { type: "tool", name: "submit_scores" },
    messages: [{ role: "user", content: buildPrompt(role, cvText) }],
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("Model did not return structured scores. Try again.");

  return toolUse.input as RawScores;
}

async function scoreWithGemini(role: Role, cvText: string, apiKey: string): Promise<RawScores> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(role, cvText),
    config: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiSchema(role),
    },
  });

  const text = response.text;
  if (!text) throw new Error("Model did not return structured scores. Try again.");

  return JSON.parse(text) as RawScores;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role: Role = body.role === "senior_pm" ? "senior_pm" : "pm";
    const cvText: string = typeof body.cvText === "string" ? body.cvText.trim() : "";
    const candidateName: string =
      typeof body.candidateName === "string" && body.candidateName.trim()
        ? body.candidateName.trim()
        : deriveNameFromCv(cvText);

    if (!cvText) {
      return NextResponse.json({ error: "cvText is required" }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!anthropicKey && !geminiKey) {
      return NextResponse.json(
        {
          error:
            "No LLM API key is configured on the server. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    const raw = anthropicKey
      ? await scoreWithClaude(role, cvText, anthropicKey)
      : await scoreWithGemini(role, cvText, geminiKey as string);

    const criteriaDefs = RUBRIC[role];
    const criteria: CriterionResult[] = criteriaDefs.map((def) => {
      const r = raw[def.key];
      const score = clampScore(r?.score);
      return {
        key: def.key,
        label: def.label,
        weight: def.weight,
        score,
        weightedContribution: Math.round(((score * def.weight) / 100) * 10) / 10,
        evidence: r?.evidence?.trim() || "No matching evidence found in the CV.",
        rationale: r?.rationale?.trim() || "",
      };
    });

    const totalScore = Math.round(criteria.reduce((sum, c) => sum + c.weightedContribution, 0) * 10) / 10;

    const result: ScoreResult = { role, criteria, totalScore };

    return NextResponse.json({ candidateName, ...result });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Scoring failed: ${msg}` }, { status: 500 });
  }
}

function clampScore(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function deriveNameFromCv(cvText: string): string {
  const firstLine = cvText.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  if (!firstLine) return "Unnamed candidate";
  return firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine;
}
