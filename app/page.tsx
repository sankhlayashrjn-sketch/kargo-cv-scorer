"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_LABELS, Role } from "@/lib/rubric";

interface CandidateListItem {
  id: string;
  role_applied: Role;
  status: "processing" | "ready" | "error";
  error_message: string | null;
  total_score_pm: number | null;
  total_score_spm: number | null;
  applied_score: number | null;
  name: string | null;
  email: string | null;
  email_kind: "invite" | "rejection" | null;
  email_status: "draft" | "sent" | null;
  sent_at: string | null;
  created_at: string;
}

interface ScoreRow {
  rubric_role: Role;
  criterion_key: string;
  score: number;
  evidence: string;
  rationale: string;
  weighted_contribution: number;
  label: string;
  weight: number;
  sort_order: number;
}

interface CandidateDetail {
  candidate: {
    id: string;
    role_applied: Role;
    status: string;
    error_message: string | null;
    total_score_pm: number | null;
    total_score_spm: number | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  scores: ScoreRow[];
  brief: { summary: string; generated_at: string } | null;
  email: { kind: "invite" | "rejection"; subject: string; body: string; status: "draft" | "sent"; sent_at: string | null } | null;
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text ? text.slice(0, 300) : `Request failed with status ${res.status}` };
  }
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

export default function Home() {
  const [role, setRole] = useState<Role>("pm");
  const [cvText, setCvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CandidateDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<Record<string, string>>({});

  const [thresholds, setThresholds] = useState({ invite_threshold_pm: "70", invite_threshold_senior_pm: "70" });
  const [savingThresholds, setSavingThresholds] = useState(false);

  async function loadCandidates(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoadingList(true);
    try {
      const res = await fetch("/api/candidates");
      const data = await safeJson(res);
      if (res.ok) setCandidates(data);
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  }

  async function loadSettings() {
    const res = await fetch("/api/settings");
    const data = await safeJson(res);
    if (res.ok) {
      setThresholds({
        invite_threshold_pm: data.invite_threshold_pm ?? "70",
        invite_threshold_senior_pm: data.invite_threshold_senior_pm ?? "70",
      });
    }
  }

  useEffect(() => {
    void loadCandidates();
    void loadSettings();
  }, []);

  // While any candidate is still being scored in the background (see
  // app/api/candidates/route.ts's use of `after()`), poll quietly until it's
  // done instead of leaving the row stuck on "Scoring…".
  useEffect(() => {
    const hasProcessing = candidates.some((c) => c.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      void loadCandidates({ silent: true });
    }, 3000);
    return () => clearInterval(interval);
  }, [candidates]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract-pdf", { method: "POST", body: formData });
        const data = await safeJson(res);
        if (!res.ok) {
          setSubmitError(data.error || "Could not read that PDF.");
          return;
        }
        setCvText(data.text);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Could not read that PDF.");
      } finally {
        setUploading(false);
      }
    } else {
      const text = await file.text();
      setCvText(text);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = cvText.trim();
    if (!trimmed) {
      setSubmitError("Paste or upload CV text first.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, cvText: trimmed }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setSubmitError(data.error || "Could not process this candidate.");
        return;
      }
      setCvText("");
      await loadCandidates();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailCache[id]) {
      setDetailLoading(id);
      try {
        const res = await fetch(`/api/candidates/${id}`);
        const data = await safeJson(res);
        if (res.ok) setDetailCache((prev) => ({ ...prev, [id]: data }));
      } finally {
        setDetailLoading(null);
      }
    }
  }

  async function handleSend(id: string) {
    setSendingId(id);
    setSendError((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/candidates/${id}/send`, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        setSendError((prev) => ({ ...prev, [id]: data.error || "Could not send email." }));
        return;
      }
      setDetailCache((prev) => {
        const existing = prev[id];
        if (!existing || !existing.email) return prev;
        return { ...prev, [id]: { ...existing, email: { ...existing.email, status: "sent", sent_at: new Date().toISOString() } } };
      });
      await loadCandidates();
    } catch (err) {
      setSendError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Network error" }));
    } finally {
      setSendingId(null);
    }
  }

  async function saveThresholds() {
    setSavingThresholds(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thresholds),
      });
      await loadCandidates();
    } finally {
      setSavingThresholds(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Kargo Hiring Dashboard</h1>
        <p className="mt-1 text-sm text-stone-400">
          Every CV is scored against both the PM and Senior PM rubric, and gets a drafted interview invite or
          rejection email. Nothing is sent until you click Confirm.
        </p>
      </header>

      <section className="mb-10 rounded-xl border border-border bg-surface-raised p-5">
        <h2 className="mb-4 text-base font-medium text-white">Add a candidate</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Role applied for
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full max-w-xs rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-stone-100 focus:border-accent-500 focus:outline-none"
            >
              <option value="pm">Product Manager</option>
              <option value="senior_pm">Senior Product Manager</option>
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wide text-stone-400">CV text</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-medium text-accent-400 hover:text-accent-300 disabled:cursor-not-allowed disabled:text-stone-500"
              >
                {uploading ? "Reading PDF…" : "Upload .txt or .pdf file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain,.pdf,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Paste the candidate's CV as plain text..."
              rows={8}
              className="w-full rounded-md border border-border bg-surface-overlay px-3 py-2 font-mono text-sm text-stone-100 placeholder:text-stone-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          {submitError && <p className="text-sm text-rose-400">{submitError}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-accent-800"
          >
            {submitting ? "Scoring against both rubrics…" : "Add candidate"}
          </button>
        </form>
      </section>

      <section className="mb-10 rounded-xl border border-border bg-surface-raised p-5">
        <h2 className="mb-4 text-base font-medium text-white">Invite thresholds</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              PM (score out of 100)
            </label>
            <input
              type="number"
              value={thresholds.invite_threshold_pm}
              onChange={(e) => setThresholds((t) => ({ ...t, invite_threshold_pm: e.target.value }))}
              className="w-28 rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-stone-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Senior PM (score out of 100)
            </label>
            <input
              type="number"
              value={thresholds.invite_threshold_senior_pm}
              onChange={(e) => setThresholds((t) => ({ ...t, invite_threshold_senior_pm: e.target.value }))}
              className="w-28 rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-stone-100 focus:border-accent-500 focus:outline-none"
            />
          </div>
          <button
            onClick={saveThresholds}
            disabled={savingThresholds}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-stone-200 hover:bg-surface-overlay disabled:cursor-not-allowed disabled:text-stone-500"
          >
            {savingThresholds ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Applies to new candidates going forward. A candidate's total score (against the rubric for the role they
          applied for) at or above this number gets an interview invite draft; below it gets a rejection draft.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-base font-medium text-white">
          Candidates {candidates.length > 0 && <span className="text-stone-500">({candidates.length})</span>}
        </h2>

        {loadingList ? (
          <p className="text-sm text-stone-500">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-stone-500">
            No candidates yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-overlay text-xs uppercase tracking-wide text-stone-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Applied for</th>
                  <th className="px-4 py-3 font-medium">PM score</th>
                  <th className="px-4 py-3 font-medium">SPM score</th>
                  <th className="px-4 py-3 font-medium">Decision</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, idx) => (
                  <CandidateRow
                    key={c.id}
                    rank={idx + 1}
                    item={c}
                    expanded={expandedId === c.id}
                    detail={detailCache[c.id]}
                    detailLoading={detailLoading === c.id}
                    sending={sendingId === c.id}
                    sendError={sendError[c.id]}
                    onToggle={() => toggleExpand(c.id)}
                    onSend={() => handleSend(c.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function CandidateRow({
  rank,
  item,
  expanded,
  detail,
  detailLoading,
  sending,
  sendError,
  onToggle,
  onSend,
}: {
  rank: number;
  item: CandidateListItem;
  expanded: boolean;
  detail?: CandidateDetail;
  detailLoading: boolean;
  sending: boolean;
  sendError?: string;
  onToggle: () => void;
  onSend: () => void;
}) {
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-3 text-stone-400">{rank}</td>
        <td className="px-4 py-3 font-medium text-stone-100">{item.name || "Unnamed candidate"}</td>
        <td className="px-4 py-3 text-stone-400">{ROLE_LABELS[item.role_applied]}</td>
        <td className="px-4 py-3">
          {item.total_score_pm != null ? (
            <span className={scoreColor(item.total_score_pm)}>{item.total_score_pm.toFixed(1)}</span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3">
          {item.total_score_spm != null ? (
            <span className={scoreColor(item.total_score_spm)}>{item.total_score_spm.toFixed(1)}</span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3">
          {item.status === "processing" ? (
            <span className="inline-flex items-center gap-2 text-stone-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-500" />
              Scoring…
            </span>
          ) : item.status === "error" ? (
            <span className="text-rose-400">Error</span>
          ) : item.email_kind === "invite" ? (
            <span className="rounded-full bg-emerald-950 px-2 py-0.5 text-xs font-medium text-emerald-400">
              Invite
            </span>
          ) : item.email_kind === "rejection" ? (
            <span className="rounded-full bg-stone-800 px-2 py-0.5 text-xs font-medium text-stone-400">Reject</span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3 text-stone-400">
          {item.email_status === "sent" ? (
            <span className="text-emerald-400">Sent</span>
          ) : item.email_status === "draft" ? (
            "Draft"
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {item.status === "ready" && (
            <button onClick={onToggle} className="text-xs font-medium text-accent-400 hover:text-accent-300">
              {expanded ? "Hide" : "View"}
            </button>
          )}
        </td>
      </tr>
      {item.status === "error" && (
        <tr className="border-t border-border bg-rose-950/20">
          <td colSpan={8} className="px-4 py-3 text-sm text-rose-300">
            {item.error_message}
          </td>
        </tr>
      )}
      {expanded && (
        <tr className="border-t border-border bg-surface-overlay/50">
          <td colSpan={8} className="px-4 py-4">
            {detailLoading || !detail ? (
              <p className="text-sm text-stone-500">Loading…</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <RubricBreakdown title="Product Manager rubric" rows={detail.scores.filter((s) => s.rubric_role === "pm")} />
                  <RubricBreakdown
                    title="Senior Product Manager rubric"
                    rows={detail.scores.filter((s) => s.rubric_role === "senior_pm")}
                  />
                </div>

                {detail.brief && (
                  <div className="rounded-lg border border-border bg-surface-raised p-4">
                    <h3 className="mb-2 font-medium text-stone-100">Interview brief</h3>
                    <p className="text-sm text-stone-300">{detail.brief.summary}</p>
                  </div>
                )}

                {detail.email && (
                  <div className="rounded-lg border border-border bg-surface-raised p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-stone-100">
                        Draft {detail.email.kind === "invite" ? "interview invite" : "rejection"} email
                      </h3>
                      {detail.email.status === "sent" ? (
                        <span className="text-xs font-medium text-emerald-400">
                          Sent {detail.email.sent_at ? new Date(detail.email.sent_at).toLocaleString() : ""}
                        </span>
                      ) : (
                        <button
                          onClick={onSend}
                          disabled={sending}
                          className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-accent-800"
                        >
                          {sending ? "Sending…" : "Confirm"}
                        </button>
                      )}
                    </div>
                    {sendError && <p className="mb-2 text-xs text-rose-400">{sendError}</p>}
                    <div className="rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-stone-300">
                      <p className="mb-2 font-medium text-stone-200">
                        {detail.email.subject.split("{{NAME}}").join(detail.candidate.name || "there")}
                      </p>
                      <p className="whitespace-pre-wrap">
                        {detail.email.body.split("{{NAME}}").join(detail.candidate.name || "there")}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">To: {detail.candidate.email || "no email on file"}</p>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RubricBreakdown({ title, rows }: { title: string; rows: ScoreRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <h3 className="mb-3 font-medium text-stone-100">{title}</h3>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.criterion_key} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-stone-200">{r.label}</span>
              <span className="text-xs text-stone-400">
                weight {r.weight}% · <span className={scoreColor(r.score)}>{r.score}/100</span> · {r.weighted_contribution} pts
              </span>
            </div>
            <blockquote className="border-l-2 border-border pl-3 text-xs italic text-stone-400">
              &ldquo;{r.evidence}&rdquo;
            </blockquote>
          </div>
        ))}
      </div>
    </div>
  );
}
