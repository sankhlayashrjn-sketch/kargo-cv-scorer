import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, Type } from "@google/genai";
import { CriterionDef, CriterionResult, ROLE_LABELS, Role } from "@/lib/rubric";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

type RawScores = Record<string, { score: number; evidence: string; rationale: string }>;

function buildPrompt(role: Role, cvText: string, criteria: CriterionDef[]) {
  const roleLabel = ROLE_LABELS[role];
  const criteriaBlock = criteria
    .map((c, i) => `${i + 1}. ${c.label} (weight ${c.weight}%)\n   ${c.description}`)
    .join("\n\n");

  return `You are scoring a candidate's CV against Kargo's fixed hiring rubric for the role of ${roleLabel}.

Score the CV strictly against each of the following criteria, using ONLY textual evidence found in the CV below. Do not guess generously — if the CV is silent on a criterion, or the evidence is thin/generic, score it low. Reward specificity (named incidents, named artifacts, concrete scope of adoption) over vague claims or metrics with no supporting narrative.

Note: the CV below has had the candidate's name, email, and phone number replaced with placeholder tokens like [CANDIDATE], [EMAIL], [PHONE] for privacy. Score on substance, not the placeholders.

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

function buildAnthropicTool(criteria: CriterionDef[]) {
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

function buildGeminiSchema(criteria: CriterionDef[]) {
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

async function scoreWithClaude(
  role: Role,
  cvText: string,
  criteria: CriterionDef[],
  apiKey: string
): Promise<RawScores> {
  const anthropic = new Anthropic({ apiKey });
  const tool = buildAnthropicTool(criteria);

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2000,
    tools: [tool],
    tool_choice: { type: "tool", name: "submit_scores" },
    messages: [{ role: "user", content: buildPrompt(role, cvText, criteria) }],
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("Model did not return structured scores. Try again.");

  return toolUse.input as RawScores;
}

async function scoreWithGemini(
  role: Role,
  cvText: string,
  criteria: CriterionDef[],
  apiKey: string
): Promise<RawScores> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(role, cvText, criteria),
    config: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiSchema(criteria),
    },
  });

  const text = response.text;
  if (!text) throw new Error("Model did not return structured scores. Try again.");

  return JSON.parse(text) as RawScores;
}

function clampScore(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export interface ScoredCriteria {
  criteria: CriterionResult[];
  totalScore: number;
}

/**
 * Scores redacted CV text against one role's rubric criteria. Never pass
 * un-redacted CV text here — this text goes straight to an LLM.
 */
export async function scoreAgainstRubric(
  role: Role,
  redactedCvText: string,
  criteria: CriterionDef[]
): Promise<ScoredCriteria> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!anthropicKey && !geminiKey) {
    throw new Error("No LLM API key is configured on the server (ANTHROPIC_API_KEY or GEMINI_API_KEY).");
  }

  const raw = anthropicKey
    ? await scoreWithClaude(role, redactedCvText, criteria, anthropicKey)
    : await scoreWithGemini(role, redactedCvText, criteria, geminiKey as string);

  const results: CriterionResult[] = criteria.map((def) => {
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

  const totalScore = Math.round(results.reduce((sum, c) => sum + c.weightedContribution, 0) * 10) / 10;

  return { criteria: results, totalScore };
}
