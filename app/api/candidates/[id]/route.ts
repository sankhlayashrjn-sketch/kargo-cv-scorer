import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const candidateRows = await sql`
      SELECT c.id, c.role_applied, c.status, c.error_message,
             c.total_score_pm::float8 AS total_score_pm, c.total_score_spm::float8 AS total_score_spm, c.created_at,
             p.name, p.email, p.phone
      FROM candidates c
      LEFT JOIN candidate_pii p ON p.candidate_id = c.id
      WHERE c.id = ${id}
    `;
    if (!candidateRows.length) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const scoreRows = await sql`
      SELECT rubric_role, criterion_key, score, evidence, rationale, weighted_contribution::float8 AS weighted_contribution,
             rc.label, rc.weight::float8 AS weight, rc.sort_order
      FROM candidate_scores cs
      JOIN rubric_criteria rc ON rc.role = cs.rubric_role AND rc.key = cs.criterion_key
      WHERE candidate_id = ${id}
      ORDER BY rubric_role, rc.sort_order
    `;

    const briefRows = await sql`SELECT summary, generated_at FROM candidate_briefs WHERE candidate_id = ${id}`;
    const emailRows = await sql`
      SELECT kind, subject, body, status, sent_at FROM candidate_emails WHERE candidate_id = ${id}
    `;

    return NextResponse.json({
      candidate: candidateRows[0],
      scores: scoreRows,
      brief: briefRows[0] || null,
      email: emailRows[0] || null,
    });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load candidate: ${msg}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rows = await sql`DELETE FROM candidates WHERE id = ${id} RETURNING id`;
    if (!rows.length) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not remove candidate: ${msg}` }, { status: 500 });
  }
}
