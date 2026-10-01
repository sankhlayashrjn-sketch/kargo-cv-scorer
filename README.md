# Kargo Hiring Dashboard

A pipeline that takes an uploaded CV and turns it into a ranked, reviewable
hiring decision for one founder to act on. This is a recommendation and
drafting tool — nothing is ever auto-sent; a human clicks Confirm.

## What it does

1. The founder uploads a CV (`.txt` or `.pdf`) and picks the role applied for.
2. Gemini Flash extracts name/email/phone with structured output and returns
   a redacted version of the CV with those fields stripped out. This is the
   only AI call that ever sees the raw CV.
3. The redacted CV is scored against **both** the PM and Senior PM rubric
   (regardless of which role was applied for), via Gemini Flash with a forced
   structured response: a 0–100 score, a supporting quote, and a rationale
   per criterion.
4. The candidate's score against the rubric for the role they applied for is
   compared to a configurable threshold. At or above it → a three-sentence
   interview brief plus a drafted interview-invite email. Below it → a
   drafted rejection email. Either way, the real name is substituted back
   into the draft after generation — the LLM never sees it, only a
   `{{NAME}}` placeholder.
5. The founder reviews every candidate's breakdown, brief, and draft email on
   the dashboard, and clicks Confirm to send via Resend, one candidate at a
   time.

Every AI step (extraction, scoring, brief, email drafting) runs on Gemini
Flash — see `lib/generate.ts`.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API keys to `.env.local` (already created from
   `.env.local.example`):

   ```
   GEMINI_API_KEY=...
   DATABASE_URL=...          # Neon Postgres, already linked via `neon link`
   RESEND_API_KEY=...
   RESEND_FROM_EMAIL=you@yourverifieddomain.com
   ```

   `RESEND_FROM_EMAIL` must be a sender address on a domain verified in your
   Resend account — `onboarding@resend.dev` works with no setup but Resend
   restricts it to only deliver to your own account's email.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Restart the dev server after changing `.env.local`.

## Data model (Neon Postgres)

- `rubric_criteria` — the PM/Senior PM rubric (weights, descriptions), seeded
  once; scoring always reads from here, not from code.
- `candidates` — role applied, pipeline status, the **redacted** CV text, and
  both total scores.
- `candidate_pii` — name/email/phone, kept in its own table and only ever
  joined back in for display or email sending, never passed to an LLM.
- `candidate_scores` — per-criterion score/evidence/rationale, for both
  rubrics, for every candidate.
- `candidate_briefs` — the three-sentence interview brief (invited candidates
  only).
- `candidate_emails` — the drafted subject/body (with a `{{NAME}}` placeholder
  until sent), its `draft`/`sent` status, and when it was sent.
- `settings` — `invite_threshold_pm` / `invite_threshold_senior_pm`, editable
  from the dashboard.

## Key files

- `lib/generate.ts` — the single Gemini Flash structured-JSON call every AI
  step runs through.
- `lib/pii.ts` — name/email/phone extraction + CV redaction (Gemini Flash).
- `lib/scoring.ts` — scoring against a given rubric's criteria (Gemini Flash).
- `lib/email.ts` — brief and invite/rejection email drafting (Gemini Flash).
- `lib/pipeline.ts` — orchestrates the above for one candidate and persists
  everything.
- `app/api/candidates/route.ts` — create a candidate (runs the full pipeline)
  and list all candidates.
- `app/api/candidates/[id]/send/route.ts` — sends the stored draft via Resend;
  only ever triggered by an explicit Confirm click.
- `app/api/extract-pdf/route.ts` — PDF → text, via `unpdf`.

## Notes

- Scoring is strict: if a CV doesn't address a criterion, it scores low, not a
  middling default.
- To change the model, set `GEMINI_MODEL` (defaults to `gemini-3.8-flash`) in
  `.env.local`.
- The original `Claude outputs/rubric.txt` is kept as the human-readable
  reference; the live rubric used for scoring is the `rubric_criteria` table.
