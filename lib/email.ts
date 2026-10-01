import { CriterionResult, ROLE_LABELS, Role } from "@/lib/rubric";
import { generateJson, GeminiType } from "@/lib/generate";

function criteriaBlock(criteria: CriterionResult[]) {
  return criteria
    .map((c) => `- ${c.label} (score ${c.score}/100): ${c.rationale || "(no rationale)"}`)
    .join("\n");
}

export async function generateBrief(
  role: Role,
  redactedCvText: string,
  criteria: CriterionResult[]
): Promise<string> {
  const prompt = `You are preparing a hiring founder for an interview with a candidate for the role of ${ROLE_LABELS[role]}.

The candidate's CV (name/email/phone already redacted to placeholders) was scored against the hiring rubric:

${criteriaBlock(criteria)}

Write a short interview brief: exactly three sentences, for the interviewer's own prep, not a hiring decision. Base it on the CV content below.

CV TEXT:
"""
${redactedCvText}
"""`;

  const result = await generateJson<{ summary: string }>(prompt, {
    type: GeminiType.OBJECT,
    properties: { summary: { type: GeminiType.STRING, description: "Exactly three sentences." } },
    required: ["summary"],
  });

  return result.summary.trim();
}

export interface EmailDraft {
  subject: string;
  body: string;
}

export async function generateEmailDraft(
  kind: "invite" | "rejection",
  role: Role,
  redactedCvText: string,
  criteria: CriterionResult[]
): Promise<EmailDraft> {
  const roleLabel = ROLE_LABELS[role];
  const instructions =
    kind === "invite"
      ? `Write a warm, professional email inviting the candidate to interview for the ${roleLabel} role at Kargo. Reference at least one concrete, specific detail from their CV. Do not promise an offer, a specific outcome, or compensation. Invite them to schedule a conversation.`
      : `Write a warm, respectful rejection email for the ${roleLabel} role at Kargo. Thank them specifically for something concrete in their background (reference the CV), be honest that the team is moving forward with other candidates, and do not give detailed criticism of their scoring. Keep it short and kind.`;

  const prompt = `You are drafting a ${kind} email on behalf of a hiring founder at Kargo.

${instructions}

The candidate's real name is private and has been redacted from the CV below. In the email body, address them using the exact placeholder token {{NAME}} wherever their name would go (e.g. "Hi {{NAME}},"). Do not invent a name.

The candidate was scored against this rubric for ${roleLabel}:

${criteriaBlock(criteria)}

CV TEXT (redacted):
"""
${redactedCvText}
"""`;

  const result = await generateJson<EmailDraft>(prompt, {
    type: GeminiType.OBJECT,
    properties: {
      subject: { type: GeminiType.STRING, description: "Email subject line." },
      body: {
        type: GeminiType.STRING,
        description:
          "Full email body. Must contain the literal token {{NAME}} at least once as the greeting placeholder.",
      },
    },
    required: ["subject", "body"],
  });

  if (!result.body.includes("{{NAME}}")) {
    result.body = `Hi {{NAME}},\n\n${result.body}`;
  }

  return result;
}
