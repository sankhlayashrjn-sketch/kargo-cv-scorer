# Kargo CV Scorer

Scores Product Manager and Senior Product Manager CVs against Kargo's fixed hiring
rubric (see `Claude outputs/rubric.txt`), using Claude to read each CV for evidence
per criterion. This is a recommendation tool — it never hides or auto-rejects a
candidate; a human makes the final call.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your API keys. Open `.env.local` (already created from
   `.env.local.example`) and set:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   GEMINI_API_KEY=...
   ```

   Get an Anthropic key from [console.anthropic.com](https://console.anthropic.com/)
   and a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey).
   Both keys are only read on the server (`app/api/score/route.ts` and
   `app/api/brief/route.ts`) and are never sent to the browser.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Restart the dev server after changing `.env.local`.

## How it works

- Paste a CV, or upload a `.txt` or `.pdf` file, pick Product Manager or Senior
  Product Manager, and click "Score CV". PDFs are parsed server-side
  (`app/api/extract-pdf/route.ts`, via `unpdf`) into plain text; scanned/image-only
  PDFs with no selectable text will return an error asking you to paste the text
  instead.
- The server sends the CV text plus that role's 4 weighted criteria (from
  `lib/rubric.ts`) to Claude, forcing a structured tool-call response so each
  criterion comes back with a 0–100 score, a supporting quote (or "no matching
  evidence"), and a short rationale.
- Weighted contributions and the total score are computed in code (not by the
  model) from the returned per-criterion scores, so the math is always exact.
- Multiple candidates can be added; the shortlist table ranks them by total score,
  with an expandable per-criterion breakdown for each.
- For a scored candidate, "Generate interview brief & email" calls Gemini
  (`app/api/brief/route.ts`) with the CV and the per-criterion scoring to produce:
  strengths, targeted interview questions (weighted toward criteria that scored
  low or had no evidence), a neutral prep summary, and a draft outreach email —
  all for the founder to review, edit, and send themselves. Nothing is sent
  automatically.

## Notes for v1

- Candidate state lives in browser memory for the session only (no persistence
  wired up yet), though a Neon Postgres database is linked and ready
  (`DATABASE_URL` in `.env.local`, config in `neon.ts`) for when that's needed.
- Scoring is strict: if a CV doesn't address a criterion, it should score low, not
  a middling default.
- To change models, set `ANTHROPIC_MODEL` (defaults to `claude-sonnet-5`) or
  `GEMINI_MODEL` (defaults to `gemini-2.5-flash`) in `.env.local`.
