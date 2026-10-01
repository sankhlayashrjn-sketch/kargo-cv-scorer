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

    // DEMO MODE: while RESEND_FROM_EMAIL is still an unverified sandbox sender
    // (onboarding@resend.dev), Resend can only deliver to the account's own
    // email, and never to reserved domains like @example.com no matter what.
    // RESEND_DEMO_OVERRIDE_EMAIL redirects every send to one real inbox so
    // demos work regardless of what's in candidate_pii.email. Remove this env
    // var once a real domain is verified in Resend.
    const demoOverride = process.env.RESEND_DEMO_OVERRIDE_EMAIL;
    const recipient = demoOverride || email;

    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: recipient,
      subject: demoOverride ? `[Demo — actual recipient: ${email}] ${finalSubject}` : finalSubject,
      text: demoOverride
        ? `(Demo mode: this would normally be sent to ${email}, redirected here for testing.)\n\n${finalBody}`
        : finalBody,
    });

    if (error) {
      return NextResponse.json({ error: `Resend error: ${error.message}` }, { status: 502 });
    }

    await sql`UPDATE candidate_emails SET status = 'sent', sent_at = now() WHERE candidate_id = ${id}`;

    return NextResponse.json({ ok: true, demoOverride: !!demoOverride, recipient, actualEmail: email });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not send email: ${msg}` }, { status: 500 });
  }
}
