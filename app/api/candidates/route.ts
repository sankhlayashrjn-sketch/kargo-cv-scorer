import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { extractPii } from "@/lib/pii";
import { runPipeline } from "@/lib/pipeline";
import { Role } from "@/lib/rubric";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role: Role = body.role === "senior_pm" ? "senior_pm" : "pm";
    const cvText: string = typeof body.cvText === "string" ? body.cvText.trim() : "";

    if (!cvText) {
      return NextResponse.json({ error: "cvText is required" }, { status: 400 });
    }

    const { name, email, phone, redactedText } = await extractPii(cvText);

    const rows = await sql`
      INSERT INTO candidates (role_applied, cv_redacted)
      VALUES (${role}, ${redactedText})
      RETURNING id
    `;
    const candidateId = rows[0].id as string;

    await sql`
      INSERT INTO candidate_pii (candidate_id, name, email, phone)
      VALUES (${candidateId}, ${name}, ${email}, ${phone})
    `;

    await runPipeline(candidateId);

    const result = await sql`
      SELECT c.id, c.role_applied, c.status, c.error_message,
             c.total_score_pm::float8 AS total_score_pm, c.total_score_spm::float8 AS total_score_spm,
             p.name, e.kind AS email_kind
      FROM candidates c
      LEFT JOIN candidate_pii p ON p.candidate_id = c.id
      LEFT JOIN candidate_emails e ON e.candidate_id = c.id
      WHERE c.id = ${candidateId}
    `;

    return NextResponse.json(result[0]);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not process candidate: ${msg}` }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        c.id, c.role_applied, c.status, c.error_message,
        c.total_score_pm::float8 AS total_score_pm, c.total_score_spm::float8 AS total_score_spm, c.created_at,
        p.name, p.email,
        e.kind AS email_kind, e.status AS email_status, e.sent_at,
        (CASE WHEN c.role_applied = 'pm' THEN c.total_score_pm ELSE c.total_score_spm END)::float8 AS applied_score
      FROM candidates c
      LEFT JOIN candidate_pii p ON p.candidate_id = c.id
      LEFT JOIN candidate_emails e ON e.candidate_id = c.id
      ORDER BY applied_score DESC NULLS LAST, c.created_at DESC
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load candidates: ${msg}` }, { status: 500 });
  }
}
