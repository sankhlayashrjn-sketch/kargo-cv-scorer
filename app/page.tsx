"use client";

import { useRef, useState } from "react";
import { ROLE_LABELS, Role, ScoreResult, InterviewBrief } from "@/lib/rubric";

interface Candidate {
  id: string;
  candidateName: string;
  role: Role;
  cvText: string;
  status: "scoring" | "done" | "error";
  result?: ScoreResult;
  error?: string;
  briefStatus?: "loading" | "done" | "error";
  brief?: InterviewBrief;
  briefError?: string;
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

function barColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

export default function Home() {
  const [candidateName, setCandidateName] = useState("");
  const [role, setRole] = useState<Role>("pm");
  const [cvText, setCvText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const data = await res.json();
        if (!res.ok) {
          setSubmitError(data.error || "Could not read that PDF.");
          return;
        }
        setCvText(data.text);
        if (!candidateName.trim()) {
          setCandidateName(file.name.replace(/\.[^/.]+$/, ""));
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Could not read that PDF.");
      } finally {
        setUploading(false);
      }
    } else {
      const text = await file.text();
      setCvText(text);
      if (!candidateName.trim()) {
        setCandidateName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function scoreCandidate(id: string, name: string, role: Role, cvText: string) {
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateName: name, role, cvText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCandidates((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "error", error: data.error || "Scoring failed." } : c))
        );
        return;
      }
      const result: ScoreResult = { role: data.role, criteria: data.criteria, totalScore: data.totalScore };
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "done", result, candidateName: data.candidateName || c.candidateName }
            : c
        )
      );
    } catch (err) {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "error", error: err instanceof Error ? err.message : "Network error" }
            : c
        )
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = cvText.trim();
    if (!trimmed) {
      setSubmitError("Paste or upload CV text first.");
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = candidateName.trim() || "Unnamed candidate";
    const newCandidate: Candidate = { id, candidateName: name, role, cvText: trimmed, status: "scoring" };
    setCandidates((prev) => [...prev, newCandidate]);
    setCandidateName("");
    setCvText("");
    void scoreCandidate(id, name, role, trimmed);
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function retryCandidate(c: Candidate) {
    setCandidates((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "scoring", error: undefined } : x)));
    void scoreCandidate(c.id, c.candidateName, c.role, c.cvText);
  }

  async function generateBrief(c: Candidate) {
    if (!c.result) return;
    setCandidates((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, briefStatus: "loading", briefError: undefined } : x))
    );
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: c.candidateName,
          role: c.role,
          cvText: c.cvText,
          criteria: c.result.criteria,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCandidates((prev) =>
          prev.map((x) =>
            x.id === c.id ? { ...x, briefStatus: "error", briefError: data.error || "Brief generation failed." } : x
          )
        );
        return;
      }
      setCandidates((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, briefStatus: "done", brief: data as InterviewBrief } : x))
      );
    } catch (err) {
      setCandidates((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? { ...x, briefStatus: "error", briefError: err instanceof Error ? err.message : "Network error" }
            : x
        )
      );
    }
  }

  const sorted = [...candidates].sort((a, b) => {
    const aScore = a.status === "done" ? a.result!.totalScore : -1;
    const bScore = b.status === "done" ? b.result!.totalScore : -1;
    return bScore - aScore;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Kargo CV Scorer</h1>
        <p className="mt-1 text-sm text-gray-400">
          Scores Product Manager and Senior Product Manager applications against Kargo&apos;s fixed hiring rubric.
        </p>
        <div className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          <strong className="font-medium">This is a recommendation tool, not a decision-maker.</strong> Every
          candidate stays visible below, regardless of score — a human makes the final call.
        </div>
      </header>

      <section className="mb-10 rounded-xl border border-border bg-surface-raised p-5">
        <h2 className="mb-4 text-base font-medium text-white">Add a candidate</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Candidate name (optional)
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="e.g. Jordan Lee"
                className="w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="pm">Product Manager</option>
                <option value="senior_pm">Senior Product Manager</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">CV text</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:cursor-not-allowed disabled:text-gray-500"
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
              rows={10}
              className="w-full rounded-md border border-border bg-surface-overlay px-3 py-2 font-mono text-sm text-gray-100 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {submitError && <p className="text-sm text-rose-400">{submitError}</p>}

          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-surface"
          >
            Score CV
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-base font-medium text-white">
          Shortlist {candidates.length > 0 && <span className="text-gray-500">({candidates.length})</span>}
        </h2>

        {sorted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-gray-500">
            No candidates scored yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-overlay text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Rank</th>
                  <th className="px-4 py-3 font-medium">Candidate</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Total score (out of 100)</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c, idx) => (
                  <CandidateRow
                    key={c.id}
                    rank={idx + 1}
                    candidate={c}
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    onRemove={() => removeCandidate(c.id)}
                    onRetry={() => retryCandidate(c)}
                    onGenerateBrief={() => generateBrief(c)}
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
  candidate,
  expanded,
  onToggle,
  onRemove,
  onRetry,
  onGenerateBrief,
}: {
  rank: number;
  candidate: Candidate;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onRetry: () => void;
  onGenerateBrief: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    if (!candidate.brief) return;
    const text = `Subject: ${candidate.brief.email.subject}\n\n${candidate.brief.email.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable; the draft is still visible on screen to copy manually
    }
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-3 text-gray-400">{rank}</td>
        <td className="px-4 py-3 font-medium text-gray-100">{candidate.candidateName}</td>
        <td className="px-4 py-3 text-gray-400">{ROLE_LABELS[candidate.role]}</td>
        <td className="px-4 py-3">
          {candidate.status === "done" && candidate.result ? (
            <span className={`text-base font-semibold ${scoreColor(candidate.result.totalScore)}`}>
              {candidate.result.totalScore.toFixed(1)}
              <span className="text-xs font-normal text-gray-500"> / 100</span>
            </span>
          ) : candidate.status === "scoring" ? (
            <span className="inline-flex items-center gap-2 text-gray-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Scoring…
            </span>
          ) : (
            <span className="text-rose-400">Failed</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-3">
            {candidate.status === "done" && (
              <button onClick={onToggle} className="text-xs font-medium text-blue-400 hover:text-blue-300">
                {expanded ? "Hide breakdown" : "View breakdown"}
              </button>
            )}
            {candidate.status === "done" && !candidate.brief && candidate.briefStatus !== "loading" && (
              <button onClick={onGenerateBrief} className="text-xs font-medium text-blue-400 hover:text-blue-300">
                Generate interview brief & email
              </button>
            )}
            {candidate.briefStatus === "loading" && (
              <span className="text-xs text-gray-500">Generating brief…</span>
            )}
            {candidate.status === "error" && (
              <button onClick={onRetry} className="text-xs font-medium text-blue-400 hover:text-blue-300">
                Retry
              </button>
            )}
            <button onClick={onRemove} className="text-xs font-medium text-gray-500 hover:text-gray-300">
              Remove
            </button>
          </div>
        </td>
      </tr>
      {candidate.status === "error" && (
        <tr className="border-t border-border bg-rose-950/20">
          <td colSpan={5} className="px-4 py-3 text-sm text-rose-300">
            {candidate.error}
          </td>
        </tr>
      )}
      {candidate.briefStatus === "error" && (
        <tr className="border-t border-border bg-rose-950/20">
          <td colSpan={5} className="px-4 py-3 text-sm text-rose-300">
            {candidate.briefError}
          </td>
        </tr>
      )}
      {expanded && candidate.status === "done" && candidate.result && (
        <tr className="border-t border-border bg-surface-overlay/50">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-3">
              {candidate.result.criteria.map((crit) => (
                <div key={crit.key} className="rounded-lg border border-border bg-surface-raised p-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium text-gray-100">{crit.label}</h3>
                    <div className="text-xs text-gray-400">
                      weight {crit.weight}% · score{" "}
                      <span className={`font-semibold ${scoreColor(crit.score)}`}>{crit.score}/100</span> ·
                      contributes <span className="font-semibold text-gray-200">{crit.weightedContribution}</span>{" "}
                      pts
                    </div>
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay">
                    <div
                      className={`h-full rounded-full ${barColor(crit.score)}`}
                      style={{ width: `${crit.score}%` }}
                    />
                  </div>
                  <blockquote className="mb-2 border-l-2 border-border pl-3 text-sm italic text-gray-300">
                    &ldquo;{crit.evidence}&rdquo;
                  </blockquote>
                  {crit.rationale && <p className="text-sm text-gray-400">{crit.rationale}</p>}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      {candidate.brief && (
        <tr className="border-t border-border bg-surface-overlay/50">
          <td colSpan={5} className="px-4 py-4">
            <div className="rounded-lg border border-border bg-surface-raised p-4">
              <h3 className="mb-3 font-medium text-gray-100">Interview prep</h3>

              <div className="mb-4">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Strengths</h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-gray-300">
                  {candidate.brief.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>

              <div className="mb-4">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Areas to probe
                </h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  {candidate.brief.probeAreas.map((p, i) => (
                    <li key={i} className="rounded-md border border-border bg-surface-overlay px-3 py-2">
                      <span className="text-xs font-medium text-gray-500">{p.area}</span>
                      <p>{p.question}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mb-4">
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Summary</h4>
                <p className="text-sm text-gray-300">{candidate.brief.summary}</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Draft outreach email
                  </h4>
                  <button
                    onClick={copyEmail}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    {copied ? "Copied!" : "Copy to clipboard"}
                  </button>
                </div>
                <div className="rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-gray-300">
                  <p className="mb-2 font-medium text-gray-200">{candidate.brief.email.subject}</p>
                  <p className="whitespace-pre-wrap">{candidate.brief.email.body}</p>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Draft only — review and send it yourself.
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
