import { sql } from "@/lib/db";
import { CriterionDef, Role } from "@/lib/rubric";
import { scoreAgainstRubric } from "@/lib/scoring";
import { generateBrief, generateEmailDraft } from "@/lib/email";

async function getRubricCriteria(role: Role): Promise<CriterionDef[]> {
  const rows = await sql`
    SELECT key, label, weight, description
    FROM rubric_criteria
    WHERE role = ${role}
    ORDER BY sort_order
  `;
  return rows.map((r) => ({
    key: r.key as string,
    label: r.label as string,
    weight: Number(r.weight),
    description: r.description as string,
  }));
}

async function getThreshold(role: Role): Promise<number> {
  const key = role === "pm" ? "invite_threshold_pm" : "invite_threshold_senior_pm";
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows.length ? Number(rows[0].value) : 70;
}

/**
 * Runs the full pipeline for a newly-created candidate: scores against both
 * rubrics, decides invite/reject against the role they applied for, and
 * generates the matching brief + email draft. Only ever touches
 * `cv_redacted` — the real name/email/phone never reach this code path.
 */
export async function runPipeline(candidateId: string) {
  const rows = await sql`SELECT role_applied, cv_redacted FROM candidates WHERE id = ${candidateId}`;
  if (!rows.length) throw new Error("Candidate not found");
  const roleApplied = rows[0].role_applied as Role;
  const cvRedacted = rows[0].cv_redacted as string;

  try {
    const [pmCriteria, seniorCriteria] = await Promise.all([
      getRubricCriteria("pm"),
      getRubricCriteria("senior_pm"),
    ]);

    const [pmResult, seniorResult] = await Promise.all([
      scoreAgainstRubric("pm", cvRedacted, pmCriteria),
      scoreAgainstRubric("senior_pm", cvRedacted, seniorCriteria),
    ]);

    const scoreRows: Array<{
      role: Role;
      key: string;
      score: number;
      evidence: string;
      rationale: string;
      weighted: number;
    }> = [];
    for (const c of pmResult.criteria) {
      scoreRows.push({ role: "pm", key: c.key, score: c.score, evidence: c.evidence, rationale: c.rationale, weighted: c.weightedContribution });
    }
    for (const c of seniorResult.criteria) {
      scoreRows.push({ role: "senior_pm", key: c.key, score: c.score, evidence: c.evidence, rationale: c.rationale, weighted: c.weightedContribution });
    }

    await Promise.all(
      scoreRows.map(
        (r) => sql`
          INSERT INTO candidate_scores (candidate_id, rubric_role, criterion_key, score, evidence, rationale, weighted_contribution)
          VALUES (${candidateId}, ${r.role}, ${r.key}, ${r.score}, ${r.evidence}, ${r.rationale}, ${r.weighted})
          ON CONFLICT (candidate_id, rubric_role, criterion_key)
          DO UPDATE SET score = EXCLUDED.score, evidence = EXCLUDED.evidence, rationale = EXCLUDED.rationale, weighted_contribution = EXCLUDED.weighted_contribution
        `
      )
    );

    await sql`
      UPDATE candidates
      SET total_score_pm = ${pmResult.totalScore}, total_score_spm = ${seniorResult.totalScore}, updated_at = now()
      WHERE id = ${candidateId}
    `;

    const appliedResult = roleApplied === "pm" ? pmResult : seniorResult;
    const threshold = await getThreshold(roleApplied);
    const decision: "invite" | "rejection" = appliedResult.totalScore >= threshold ? "invite" : "rejection";

    const emailDraftPromise = generateEmailDraft(decision, roleApplied, cvRedacted, appliedResult.criteria);
    const briefPromise = decision === "invite" ? generateBrief(roleApplied, cvRedacted, appliedResult.criteria) : null;

    const [emailDraft, brief] = await Promise.all([emailDraftPromise, briefPromise]);

    if (brief) {
      await sql`
        INSERT INTO candidate_briefs (candidate_id, summary)
        VALUES (${candidateId}, ${brief})
        ON CONFLICT (candidate_id) DO UPDATE SET summary = EXCLUDED.summary, generated_at = now()
      `;
    }

    await sql`
      INSERT INTO candidate_emails (candidate_id, kind, subject, body)
      VALUES (${candidateId}, ${decision}, ${emailDraft.subject}, ${emailDraft.body})
      ON CONFLICT (candidate_id) DO UPDATE SET kind = EXCLUDED.kind, subject = EXCLUDED.subject, body = EXCLUDED.body, status = 'draft', sent_at = NULL
    `;

    await sql`UPDATE candidates SET status = 'ready', updated_at = now() WHERE id = ${candidateId}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await sql`UPDATE candidates SET status = 'error', error_message = ${message}, updated_at = now() WHERE id = ${candidateId}`;
    throw err;
  }
}
