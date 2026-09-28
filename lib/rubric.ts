export type Role = "pm" | "senior_pm";

export interface CriterionDef {
  key: string;
  label: string;
  weight: number; // percent, weights per role sum to 100
  description: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  pm: "Product Manager",
  senior_pm: "Senior Product Manager",
};

export const RUBRIC: Record<Role, CriterionDef[]> = {
  pm: [
    {
      key: "unplanned_problem_ownership",
      label: "Unplanned-Problem Ownership",
      weight: 30,
      description:
        'Strong candidate: Names one specific incident — a vendor changing something without notice, a system breaking, a client relationship going sideways — that wasn\'t part of a planned project, and states that the candidate personally drove the response (not "helped" or "was involved in").',
    },
    {
      key: "closure_discipline",
      label: "Closure Discipline",
      weight: 20,
      description:
        "Strong candidate: After the immediate problem is handled, shows what happened next — monitoring a result for a defined period, training someone, closing follow-up items, checking back later. A fix with no mention of the aftermath scores low.",
    },
    {
      key: "work_outlives_task",
      label: "Work That Outlives the Task",
      weight: 30,
      description:
        'Strong candidate: Names something concrete the candidate produced (document, tool, process, template, dashboard) that is still in use by people other than the candidate — "became the standard," "adopted by," "retained permanently." Adoption confined to the candidate\'s own small team scores lower than adoption reaching a different team, client, or company.',
    },
    {
      key: "written_candor_failure",
      label: "Written Candor About Failure",
      weight: 20,
      description:
        "Strong candidate: Contains a named artifact — a postmortem, bug report, loss writeup, audit finding — tied to a specific failed or lost outcome, written by the candidate, sent to someone who wasn't their own manager (a customer, another department, \"the team\"). A CV with only positive metrics and no such artifact scores lowest.",
    },
  ],
  senior_pm: [
    {
      key: "unplanned_problem_ownership",
      label: "Unplanned-Problem Ownership",
      weight: 35,
      description:
        "Strong candidate: Same test as PM, but the candidate must be shown as the only person handling it — no mention of escalating to someone more senior — and the stakes must be visible (a client relationship, revenue, a live customer-facing outage, a compliance deadline). Describing escalation scores lower than describing personal resolution.",
    },
    {
      key: "closure_discipline",
      label: "Closure Discipline",
      weight: 25,
      description:
        "Strong candidate: Shows responsibility for consequences over a longer window — weeks or months, not days — such as monitoring a migration's first 30 days, owning a renegotiation that followed a failure, or tracking a resolution to a defined end point. A same-day fix with no visible aftercare doesn't meet this bar.",
    },
    {
      key: "work_outlives_task",
      label: "Work That Outlives the Task",
      weight: 25,
      description:
        "Strong candidate: The reuse must reach outside the candidate's own company or direct reporting line — a different client, a different organization, or a team they don't belong to — not just their own immediate team.",
    },
    {
      key: "written_candor_failure",
      label: "Written Candor About Failure",
      weight: 15,
      description:
        "Strong candidate: The artifact must show the candidate naming their own decision or judgment as part of the cause — not just describing a system, vendor, or third party that failed on them. A writeup that only blames an external failure meets the PM bar but not this one.",
    },
  ],
};

export interface CriterionResult {
  key: string;
  label: string;
  weight: number;
  score: number; // 0-100
  weightedContribution: number; // 0-100 scale points contributed to total
  evidence: string;
  rationale: string;
}

export interface ScoreResult {
  role: Role;
  criteria: CriterionResult[];
  totalScore: number;
}

export interface ProbeArea {
  area: string;
  question: string;
}

export interface InterviewBrief {
  strengths: string[];
  probeAreas: ProbeArea[];
  summary: string;
  email: {
    subject: string;
    body: string;
  };
}
