"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { RcFile } from "antd/es/upload";
import {
  DeleteOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { ROLE_LABELS, Role } from "@/lib/rubric";

const { Dragger } = Upload;
const { TextArea } = Input;
const { Text, Paragraph } = Typography;

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
  email: {
    kind: "invite" | "rejection";
    subject: string;
    body: string;
    status: "draft" | "sent";
    sent_at: string | null;
  } | null;
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
  if (score >= 70) return "#34d399";
  if (score >= 40) return "#fbbf24";
  return "#fb7185";
}

const STUCK_AFTER_MS = 3 * 60 * 1000;

function isStuck(item: { status: string; created_at: string }) {
  return item.status === "processing" && Date.now() - new Date(item.created_at).getTime() > STUCK_AFTER_MS;
}

function ScoreCell({ value }: { value: number | null }) {
  if (value == null) return <Text type="secondary">—</Text>;
  return <Text style={{ color: scoreColor(value), fontWeight: 600 }}>{value.toFixed(1)}</Text>;
}

function DecisionTag({ item }: { item: CandidateListItem }) {
  const stuck = isStuck(item);
  if (item.status === "processing" && stuck) return <Tag color="error">Stuck</Tag>;
  if (item.status === "processing") return <Tag color="processing">Scoring…</Tag>;
  if (item.status === "error") return <Tag color="error">Error</Tag>;
  if (item.email_kind === "invite") return <Tag color="green">Invite</Tag>;
  if (item.email_kind === "rejection") return <Tag>Reject</Tag>;
  return <Text type="secondary">—</Text>;
}

export default function Home() {
  const { message } = App.useApp();

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [role, setRole] = useState<Role>("pm");
  const [cvText, setCvText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholds, setThresholds] = useState({ invite_threshold_pm: 70, invite_threshold_senior_pm: 70 });
  const [savingThresholds, setSavingThresholds] = useState(false);

  const [demoOverrideEmail, setDemoOverrideEmail] = useState<string | null>(null);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CandidateDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        invite_threshold_pm: Number(data.invite_threshold_pm ?? 70),
        invite_threshold_senior_pm: Number(data.invite_threshold_senior_pm ?? 70),
      });
      setDemoOverrideEmail(data.resend_demo_override_email || null);
    }
  }

  useEffect(() => {
    void loadCandidates();
    void loadSettings();
  }, []);

  useEffect(() => {
    const hasProcessing = candidates.some((c) => c.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(() => void loadCandidates({ silent: true }), 3000);
    return () => clearInterval(interval);
  }, [candidates]);

  const stats = useMemo(() => {
    const total = candidates.length;
    const invited = candidates.filter((c) => c.email_kind === "invite").length;
    const rejected = candidates.filter((c) => c.email_kind === "rejection").length;
    const pending = candidates.filter((c) => c.status === "processing" || c.status === "error").length;
    return { total, invited, rejected, pending };
  }, [candidates]);

  async function processCvFile(file: File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract-pdf", { method: "POST", body: formData });
        const data = await safeJson(res);
        if (!res.ok) {
          message.error(data.error || "Could not read that PDF.");
          return;
        }
        setCvText(data.text);
      } catch (err) {
        message.error(err instanceof Error ? err.message : "Could not read that PDF.");
      } finally {
        setUploading(false);
      }
    } else {
      const text = await file.text();
      setCvText(text);
    }
  }

  async function handleAddCandidate() {
    const trimmed = cvText.trim();
    if (!trimmed) {
      message.warning("Paste or upload CV text first.");
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
        message.error(data.error || "Could not process this candidate.");
        return;
      }
      message.success(`${data.name || "Candidate"} added — scoring in the background.`);
      setCvText("");
      setAddOpen(false);
      await loadCandidates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openDrawer(id: string) {
    setDrawerId(id);
    if (!detailCache[id]) {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/candidates/${id}`);
        const data = await safeJson(res);
        if (res.ok) setDetailCache((prev) => ({ ...prev, [id]: data }));
        else message.error(data.error || "Could not load this candidate.");
      } finally {
        setDetailLoading(false);
      }
    }
  }

  async function handleConfirmSend(id: string) {
    setSending(true);
    try {
      const res = await fetch(`/api/candidates/${id}/send`, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        message.error(data.error || "Could not send email.");
        return;
      }
      if (data.demoOverride) {
        message.success(`Email sent to ${data.recipient} (demo mode — real candidate email is ${data.actualEmail}).`, 6);
      } else {
        message.success("Email sent.");
      }
      setDetailCache((prev) => {
        const existing = prev[id];
        if (!existing || !existing.email) return prev;
        return {
          ...prev,
          [id]: { ...existing, email: { ...existing.email, status: "sent", sent_at: new Date().toISOString() } },
        };
      });
      await loadCandidates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/candidates/${id}/retry`, { method: "POST" });
      const data = await safeJson(res);
      if (!res.ok) {
        message.error(data.error || "Could not retry this candidate.");
        return;
      }
      message.info("Retrying…");
      setDetailCache((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      await loadCandidates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (!res.ok) {
        message.error(data.error || "Could not remove this candidate.");
        return;
      }
      message.success("Candidate removed.");
      if (drawerId === id) setDrawerId(null);
      setDetailCache((prev) => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      await loadCandidates();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Network error");
    }
  }

  async function saveThresholds() {
    setSavingThresholds(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thresholds),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        message.error(data.error || "Could not save settings.");
        return;
      }
      message.success("Thresholds saved.");
      await loadCandidates();
    } finally {
      setSavingThresholds(false);
    }
  }

  const columns: ColumnsType<CandidateListItem> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string | null, item) => (
        <a onClick={() => item.status === "ready" && openDrawer(item.id)} style={{ fontWeight: 600 }}>
          {name || "Unnamed candidate"}
        </a>
      ),
    },
    {
      title: "Applied for",
      dataIndex: "role_applied",
      filters: [
        { text: "Product Manager", value: "pm" },
        { text: "Senior Product Manager", value: "senior_pm" },
      ],
      onFilter: (value, item) => item.role_applied === value,
      render: (role: Role) => ROLE_LABELS[role],
    },
    {
      title: "PM score",
      dataIndex: "total_score_pm",
      sorter: (a, b) => (a.total_score_pm ?? -1) - (b.total_score_pm ?? -1),
      render: (v: number | null) => <ScoreCell value={v} />,
    },
    {
      title: "SPM score",
      dataIndex: "total_score_spm",
      sorter: (a, b) => (a.total_score_spm ?? -1) - (b.total_score_spm ?? -1),
      render: (v: number | null) => <ScoreCell value={v} />,
    },
    {
      title: "Decision",
      key: "decision",
      filters: [
        { text: "Invite", value: "invite" },
        { text: "Reject", value: "rejection" },
      ],
      onFilter: (value, item) => item.email_kind === value,
      render: (_, item) => <DecisionTag item={item} />,
    },
    {
      title: "Email",
      dataIndex: "email_status",
      render: (status: string | null) =>
        status === "sent" ? (
          <Tag color="green">Sent</Tag>
        ) : status === "draft" ? (
          <Tag>Draft</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "",
      key: "actions",
      align: "right",
      render: (_, item) => (
        <Space>
          {(item.status === "error" || isStuck(item)) && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={retryingId === item.id}
              onClick={() => handleRetry(item.id)}
            >
              Retry
            </Button>
          )}
          <Popconfirm
            title="Remove this candidate?"
            description="This permanently deletes their record, scores, brief, and email draft."
            okText="Remove"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleRemove(item.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const sortedForDefault = [...candidates].sort(
    (a, b) => (b.applied_score ?? -1) - (a.applied_score ?? -1)
  );

  const drawerDetail = drawerId ? detailCache[drawerId] : undefined;
  const drawerItem = drawerId ? candidates.find((c) => c.id === drawerId) : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Kargo Hiring Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-400">
            Every CV is scored against both the PM and Senior PM rubric and gets a drafted interview invite or
            rejection email. Nothing is sent until you click Confirm.
          </p>
        </div>
        <Space>
          <Button icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)}>
            Thresholds
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add candidate
          </Button>
        </Space>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Candidates", value: stats.total },
          { label: "Invited", value: stats.invited, color: "#34d399" },
          { label: "Rejected", value: stats.rejected, color: "#a8a29e" },
          { label: "Needs attention", value: stats.pending, color: stats.pending ? "#fb7185" : undefined },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/10 bg-surface-raised/40 p-4 text-center shadow-lg shadow-black/20 backdrop-blur-xl"
          >
            <div className="text-2xl font-semibold" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="text-xs uppercase tracking-wide text-stone-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 shadow-xl shadow-black/20">
        <Table<CandidateListItem>
          rowKey="id"
          columns={columns}
          dataSource={sortedForDefault}
          loading={loadingList}
          pagination={sortedForDefault.length > 10 ? { pageSize: 10 } : false}
          locale={{ emptyText: <Empty description="No candidates yet" /> }}
        />
      </div>

      {/* Add candidate */}
      <Drawer
        title="Add a candidate"
        open={addOpen}
        onClose={() => setAddOpen(false)}
        size={480}
        extra={
          <Button type="primary" onClick={handleAddCandidate} loading={submitting}>
            Score candidate
          </Button>
        }
      >
        <Form layout="vertical">
          <Form.Item label="Role applied for">
            <Select<Role>
              value={role}
              onChange={setRole}
              options={[
                { value: "pm", label: "Product Manager" },
                { value: "senior_pm", label: "Senior Product Manager" },
              ]}
            />
          </Form.Item>
          <Form.Item label="CV">
            <Dragger
              multiple={false}
              showUploadList={false}
              accept=".txt,text/plain,.pdf,application/pdf"
              beforeUpload={(file: RcFile) => {
                void processCvFile(file);
                return false;
              }}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p>{uploading ? "Reading PDF…" : "Click or drag a .txt or .pdf file here"}</p>
            </Dragger>
          </Form.Item>
          <Form.Item label="Or paste CV text">
            <TextArea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              rows={12}
              placeholder="Paste the candidate's CV as plain text..."
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Settings */}
      <Drawer title="Invite thresholds" open={settingsOpen} onClose={() => setSettingsOpen(false)} size={360}>
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          A candidate's total score — against the rubric for the role they applied for — at or above this number
          gets an interview invite draft; below it gets a rejection draft. Applies to new candidates going forward.
        </Paragraph>
        <Form layout="vertical">
          <Form.Item label="Product Manager (score out of 100)">
            <InputNumber
              style={{ width: "100%" }}
              value={thresholds.invite_threshold_pm}
              onChange={(v) => setThresholds((t) => ({ ...t, invite_threshold_pm: Number(v ?? 70) }))}
            />
          </Form.Item>
          <Form.Item label="Senior Product Manager (score out of 100)">
            <InputNumber
              style={{ width: "100%" }}
              value={thresholds.invite_threshold_senior_pm}
              onChange={(v) => setThresholds((t) => ({ ...t, invite_threshold_senior_pm: Number(v ?? 70) }))}
            />
          </Form.Item>
          <Button type="primary" onClick={saveThresholds} loading={savingThresholds} block>
            Save
          </Button>
        </Form>
      </Drawer>

      {/* Candidate detail */}
      <Drawer
        title={drawerItem?.name || "Candidate"}
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        size={640}
      >
        {detailLoading || !drawerDetail ? (
          <div className="flex justify-center py-16">
            <Spin />
          </div>
        ) : (
          <CandidateDetailView
            detail={drawerDetail}
            sending={sending}
            demoOverrideEmail={demoOverrideEmail}
            onConfirmSend={() => drawerId && handleConfirmSend(drawerId)}
          />
        )}
      </Drawer>
    </main>
  );
}

function CandidateDetailView({
  detail,
  sending,
  demoOverrideEmail,
  onConfirmSend,
}: {
  detail: CandidateDetail;
  sending: boolean;
  demoOverrideEmail: string | null;
  onConfirmSend: () => void;
}) {
  const nameOrThere = detail.candidate.name || "there";

  const decisionPane = (
    <div className="space-y-4">
      {demoOverrideEmail && detail.email?.status !== "sent" && (
        <Alert
          type="warning"
          showIcon
          message="Demo mode is on"
          description={`Confirm will send to ${demoOverrideEmail} instead of ${detail.candidate.email || "the candidate's email"}. Remove RESEND_DEMO_OVERRIDE_EMAIL once a domain is verified in Resend.`}
        />
      )}
      {detail.brief && (
        <div>
          <Text strong>Interview brief</Text>
          <Paragraph style={{ marginTop: 8 }}>{detail.brief.summary}</Paragraph>
        </div>
      )}

      {detail.email && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Text strong>
              Draft {detail.email.kind === "invite" ? "interview invite" : "rejection"} email
            </Text>
            {detail.email.status === "sent" ? (
              <Tag color="green">
                Sent {detail.email.sent_at ? new Date(detail.email.sent_at).toLocaleString() : ""}
              </Tag>
            ) : (
              <Button type="primary" size="small" loading={sending} onClick={onConfirmSend}>
                Confirm
              </Button>
            )}
          </div>
          <div className="rounded-md border border-white/10 bg-surface-overlay/60 px-3 py-2 text-sm">
            <p className="mb-2 font-medium text-stone-200">
              {detail.email.subject.split("{{NAME}}").join(nameOrThere)}
            </p>
            <p className="whitespace-pre-wrap text-stone-300">
              {detail.email.body.split("{{NAME}}").join(nameOrThere)}
            </p>
          </div>
          <p className="mt-2 text-xs text-stone-500">To: {detail.candidate.email || "no email on file"}</p>
        </div>
      )}
    </div>
  );

  return (
    <Tabs
      defaultActiveKey="decision"
      items={[
        { key: "decision", label: "Brief & email", children: decisionPane },
        {
          key: "pm",
          label: "PM rubric",
          children: <RubricBreakdown rows={detail.scores.filter((s) => s.rubric_role === "pm")} />,
        },
        {
          key: "spm",
          label: "SPM rubric",
          children: <RubricBreakdown rows={detail.scores.filter((s) => s.rubric_role === "senior_pm")} />,
        },
      ]}
    />
  );
}

function RubricBreakdown({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.criterion_key} className="border-b border-white/10 pb-3 last:border-b-0">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <Text strong>{r.label}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              weight {r.weight}% · <span style={{ color: scoreColor(r.score) }}>{r.score}/100</span> ·{" "}
              {r.weighted_contribution} pts
            </Text>
          </div>
          <blockquote className="border-l-2 border-white/10 pl-3 text-xs italic text-stone-400">
            &ldquo;{r.evidence}&rdquo;
          </blockquote>
        </div>
      ))}
    </div>
  );
}
