import { NextRequest, NextResponse, after } from "next/server";
import { sql } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rows = await sql`
      UPDATE candidates SET status = 'processing', error_message = NULL, updated_at = now()
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    after(() => runPipeline(id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not retry candidate: ${msg}` }, { status: 500 });
  }
}
