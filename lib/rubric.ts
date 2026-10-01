export type Role = "pm" | "senior_pm";

export interface CriterionDef {
  key: string;
  label: string;
  weight: number; // percent, weights per role sum to 100
  description: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  pm: "Product Manager",
  senior_pm: "Senior Product Manager",
};

// Rubric criteria (weights, descriptions) now live in the `rubric_criteria`
// table — see lib/pipeline.ts. This file keeps only the shared types.

export interface CriterionResult {
  key: string;
  label: string;
  weight: number;
  score: number; // 0-100
  weightedContribution: number; // 0-100 scale points contributed to total
  evidence: string;
  rationale: string;
}

