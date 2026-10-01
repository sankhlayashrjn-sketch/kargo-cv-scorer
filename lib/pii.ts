export interface ExtractedPii {
  name: string;
  email: string | null;
  phone: string | null;
  redactedText: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Matches common phone formats: +1 555-123-4567, (555) 123-4567, 555.123.4567, etc.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function guessName(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) {
      EMAIL_RE.lastIndex = 0;
      PHONE_RE.lastIndex = 0;
      continue;
    }
    // A name line is short, has no digits, and isn't a section header like "RESUME" or "CURRICULUM VITAE"
    if (trimmed.length <= 60 && !/\d/.test(trimmed) && !/^(resume|curriculum vitae|cv)$/i.test(trimmed)) {
      return trimmed;
    }
  }
  return "Unnamed candidate";
}

/**
 * Deterministically extracts name/email/phone from CV text (no AI call, since
 * this data must never reach an LLM) and returns the CV with those exact
 * occurrences replaced by placeholder tokens.
 */
export function extractPii(cvText: string): ExtractedPii {
  const lines = cvText.split("\n");
  const name = guessName(lines);

  const emailMatch = cvText.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[0] : null;

  const phoneMatch = cvText.match(PHONE_RE);
  const phone = phoneMatch ? phoneMatch[0] : null;

  let redacted = cvText;
  if (email) redacted = redacted.split(email).join("[EMAIL]");
  if (phone) redacted = redacted.split(phone).join("[PHONE]");
  if (name && name !== "Unnamed candidate") {
    const nameRe = new RegExp(escapeRegExp(name), "g");
    redacted = redacted.replace(nameRe, "[CANDIDATE]");
  }

  return { name, email, phone, redactedText: redacted };
}
