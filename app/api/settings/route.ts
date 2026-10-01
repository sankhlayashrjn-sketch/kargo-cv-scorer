import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await sql`SELECT key, value FROM settings`;
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key as string] = r.value as string;
    return NextResponse.json(settings);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not load settings: ${msg}` }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Array<[string, string]> = [];
    if (body.invite_threshold_pm !== undefined) {
      updates.push(["invite_threshold_pm", String(Number(body.invite_threshold_pm))]);
    }
    if (body.invite_threshold_senior_pm !== undefined) {
      updates.push(["invite_threshold_senior_pm", String(Number(body.invite_threshold_senior_pm))]);
    }
    if (!updates.length) {
      return NextResponse.json({ error: "No valid settings provided" }, { status: 400 });
    }
    await Promise.all(
      updates.map(([key, value]) => sql`UPDATE settings SET value = ${value} WHERE key = ${key}`)
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Could not update settings: ${msg}` }, { status: 500 });
  }
}
