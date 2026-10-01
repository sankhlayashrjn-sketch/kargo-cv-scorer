import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rows = await sql`
      SELECT e.subject, e.body, e.status, p.name, p.email
      FROM candidate_emails e
      JOIN candidate_pii p ON p.candidate_id = e.candidate_id
      WHERE e.candidate_id = ${id}
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "No draft email found for this candidate." }, { status: 404 });
    }
    const { subject, body, status, name, email } = rows[0];

    if (status === "sent") {
      return NextResponse.json({ error: "This email was already sent." }, { status: 409 });
    }
    if (!email) {
      return NextResponse.json({ error: "No email address on file for this candidate." }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromAddress) {
      return NextResponse.json(
        {
          error:
            "RESEND_API_KEY and/or RESEND_FROM_EMAIL is not configured on the server. Add them to .env.local and restart.",
        },
        { status: 500 }
      );
    }

    const finalBody = (body as string).split("{{NAME}}").join(name || "there");
    const finalSubject = (subject as string).split("{{NAME}}").join(name || "there");

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: finalSubject,
      text: finalBody,
    });

    if (error) {
      return NextResponse.json({ error: `Resend error: ${error.message}` }, { status: 502 });
    }

    await sql`UPDATE candidate_emails SET status = 'sent', sent_at = now() WHERE candidate_id = ${id}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not send email: ${msg}` }, { status: 500 });
  }
}
