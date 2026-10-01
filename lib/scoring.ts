import { Type } from "@google/genai";
import { CriterionDef, CriterionResult, ROLE_LABELS, Role } from "@/lib/rubric";
import { generateJson } from "@/lib/generate";

type RawScores = Record<string, { score: number; evidence: string; rationale: string }>;

function buildPrompt(role: Role, cvText: string, criteria: CriterionDef[]) {
  const roleLabel = ROLE_LABELS[role];
  const criteriaBlock = criteria
    .map((c, i) => `${i + 1}. ${c.label} (weight ${c.weight}%)\n   ${c.description}`)
    .join("\n\n");

  return `You are scoring a candidate's CV against Kargo's fixed hiring rubric for the role of ${roleLabel}.

Score the CV strictly against each of the following criteria, using ONLY textual evidence found in the CV below. Do not guess generously — if the CV is silent on a criterion, or the evidence is thin/generic, score it low. Reward specificity (named incidents, named artifacts, concrete scope of adoption) over vague claims or metrics with no supporting narrative.

Note: the CV below has had the candidate's name, email, and phone number removed for privacy. Score on substance.

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

function buildSchema(criteria: CriterionDef[]) {
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
 * Scores redacted CV text against one role's rubric criteria via Gemini
 * Flash. Never pass un-redacted CV text here.
 */
export async function scoreAgainstRubric(
  role: Role,
  redactedCvText: string,
  criteria: CriterionDef[]
): Promise<ScoredCriteria> {
  const raw = await generateJson<RawScores>(buildPrompt(role, redactedCvText, criteria), buildSchema(criteria));

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
