import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, ArchiveRestore, ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Clock3, Eye, EyeOff, FileText, FileWarning, Inbox, LayoutDashboard, Mail, Minus, Pause, Play, Plus, RefreshCw, RotateCcw, Search, Send, Settings, Trash2, Upload, UserRound, Users } from "lucide-react";
import "./styles.css";

type ViewerData = {
  candidates: Candidate[];
};

type Candidate = {
  id: string;
  name: string;
  documentName: string;
  photoUrl?: string;
  email?: string;
  hrStage?: "interview" | "pending" | "rejected";
  parseStatus: string;
  totalScore?: number;
  rawScore?: number;
  scoreMode: "llm" | "rule" | "none";
  scoreReason?: string;
  scoreMissing?: string;
  scoreCaps?: string[];
  hardGaps?: string[];
  dimensions: Array<{ name: string; score: number; weightedScore: number }>;
  requirementEvaluations: Array<{
    id: string;
    description: string;
    status: string;
    featureKey: string;
    featureDisplayValue?: string;
    explanation: string;
    evidenceQuotes: string[];
  }>;
  reviewTasks: Array<{ id: string; type: string; severity: string; question: string; resolutionMode: string; status: string }>;
  reviewResolutions: Array<{ taskId: string; status: string; confidence: number; shouldAffectScoring: boolean; answer: string; suggestedAction: string }>;
  evidence: Array<{ id: string; text: string; pageNumber?: number; blockIndex?: number }>;
  profile: {
    education: string[];
    workExperience: string[];
    skills: string[];
    preference: string[];
  };
};

type Workspace = "home" | "job" | "candidates" | "interview-drafts" | "settings" | "usage" | "inbox";

type ScoreStandardDraft = {
  schemaVersion: "score-standard.v1";
  id: string;
  jobId: string;
  version: number;
  status: "draft" | "confirmed";
  totalScore: 100;
  dimensions: Array<{ key: string; name: string; maxScore: number; description: string; highScoreGuidance: string; lowScoreGuidance: string }>;
  hardRequirements: Array<{ key: string; label: string; description?: string; isHardGate: boolean; missingMeansFail: boolean; reviewOnlyWhenMissing: boolean }>;
  bonusSignals: Array<{ key: string; label: string; description: string }>;
  riskSignals: Array<{ key: string; label: string; severity: "low" | "medium" | "high"; affectsScore: boolean; description?: string }>;
  capRules: Array<{ key: string; label: string; maxFinalScore: number; condition: string; enabled: boolean }>;
  excludedSignals: Array<{ key: string; label: string; reason: string }>;
  createdAt: string;
  updatedAt: string;
};
type DimensionGuidance = { description: string; highScoreGuidance: string; lowScoreGuidance: string };

type JobDraft = { id: string; title: string; jdText: string; status: string; archivedAt?: string };
type JobPoolEntry = { job: JobDraft; standard: ScoreStandardDraft; candidateCount: number };
type ScoreProcess = {
  id: string;
  jobId: string;
  scoreStandardVersion: number;
  status: "queued" | "processing" | "paused" | "completed" | "partial_failed" | "failed";
  pauseRequested?: boolean;
  files: Array<{ id: string; fileName: string; status: "queued" | "parsing" | "scoring" | "completed" | "failed"; score?: number; error?: string; archiveStatus?: "saved" | "disabled" | "failed"; archivePath?: string; archiveError?: string }>;
  createdAt: string;
};

const defaultJd = `区域销售\n\n岗位职责：完成销售任务，负责环保工程、园林绿化工程、玻璃钢化粪池、不锈钢水箱等业务拓展，同时维护老客户。\n\n任职要求：专科及以上学历，持驾照，自带车，懂渠道销售；沟通能力好，能适应基本不出差的工作安排。`;

function App() {
  const [data, setData] = useState<ViewerData>({ candidates: [] });
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace>("home");
  const [jobs, setJobs] = useState<JobPoolEntry[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [removingJobId, setRemovingJobId] = useState("");
  const [jobPoolNotice, setJobPoolNotice] = useState("");
  const [archivedJobs, setArchivedJobs] = useState<JobPoolEntry[]>([]);
  const [showArchivedJobs, setShowArchivedJobs] = useState(false);
  const [restoringJobId, setRestoringJobId] = useState("");
  const [jdText, setJdText] = useState(defaultJd);

  React.useEffect(() => {
    fetch("/api/jobs")
      .then((response) => {
        if (!response.ok) throw new Error("读取岗位池失败。");
        return response.json() as Promise<JobPoolEntry[]>;
      })
      .then((items) => {
        setJobs(items);
        if (items[0]) setSelectedJobId(items[0].job.id);
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const candidates = useMemo(() => {
    const value = query.trim().toLowerCase();
    const sorted = [...data.candidates].sort((left, right) => (right.totalScore ?? -1) - (left.totalScore ?? -1));
    if (!value) return sorted;
    return sorted.filter((candidate) =>
      [candidate.name, candidate.documentName, candidate.parseStatus, candidate.scoreReason, String(candidate.totalScore ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [data.candidates, query]);

  async function removeJob(job: JobDraft) {
    if (!window.confirm(`将“${job.title}”移出岗位池？历史评分与简历文件会保留在本地，但岗位将不再显示在列表中。`)) return;
    setRemovingJobId(job.id);
    setJobPoolNotice("");
    try {
      await postJson<{ job: JobDraft }>(`/api/jobs/${encodeURIComponent(job.id)}`, {}, "DELETE");
      setJobs((current) => current.filter((entry) => entry.job.id !== job.id));
      if (selectedJobId === job.id) {
        setSelectedJobId("");
        setActiveWorkspace("job");
        setQuery("");
        setData((current) => ({ ...current, candidates: [] }));
      }
      setJobPoolNotice(`“${job.title}”已移出岗位池，历史数据已保留。`);
    } catch (error) {
      setJobPoolNotice(error instanceof Error ? error.message : "移出岗位失败。");
    } finally {
      setRemovingJobId("");
    }
  }

  async function toggleArchivedJobs() {
    if (showArchivedJobs) {
      setShowArchivedJobs(false);
      return;
    }
    try {
      const response = await fetch("/api/jobs/archived");
      if (!response.ok) throw new Error("读取已归档岗位失败。");
      setArchivedJobs(await response.json() as JobPoolEntry[]);
      setShowArchivedJobs(true);
    } catch (error) {
      setJobPoolNotice(error instanceof Error ? error.message : "读取已归档岗位失败。");
    }
  }

  async function restoreArchivedJob(job: JobDraft) {
    setRestoringJobId(job.id);
    setJobPoolNotice("");
    try {
      await postJson<{ job: JobDraft }>(`/api/jobs/${encodeURIComponent(job.id)}/restore`, {});
      const restored = archivedJobs.find((entry) => entry.job.id === job.id);
      if (restored) setJobs((current) => [restored, ...current.filter((entry) => entry.job.id !== job.id)]);
      setArchivedJobs((current) => current.filter((entry) => entry.job.id !== job.id));
      setJobPoolNotice(`“${job.title}”已恢复到岗位池，历史数据保持不变。`);
    } catch (error) {
      setJobPoolNotice(error instanceof Error ? error.message : "恢复岗位失败。");
    } finally {
      setRestoringJobId("");
    }
  }

  const isJobWorkspace = ["job", "candidates", "interview-drafts"].includes(activeWorkspace);

  if (loadError) {
    return <EmptyState title="本地结果查看器" text={loadError} />;
  }

  return (
    <main className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-brand">简历筛选 Agent</div>
        <nav className="app-primary-nav" aria-label="主导航">
          <button type="button" className={activeWorkspace === "home" ? "active" : ""} onClick={() => setActiveWorkspace("home")}><LayoutDashboard size={16} /><span>工作台</span></button>
          <button type="button" className={["job", "candidates", "interview-drafts"].includes(activeWorkspace) ? "active" : ""} onClick={() => setActiveWorkspace("job")}><BriefcaseBusiness size={16} /><span>岗位池</span></button>
          <button type="button" className={activeWorkspace === "settings" ? "active" : ""} onClick={() => setActiveWorkspace("settings")}><Settings size={16} /><span>设置</span></button>
        </nav>
        <nav className="app-topbar-tools" aria-label="工具">
          <button type="button" className={activeWorkspace === "inbox" ? "active" : ""} aria-label="邮件收件箱" title="邮件收件箱" onClick={() => setActiveWorkspace("inbox")}><Inbox size={16} /><span>邮件收件箱</span></button>
          <button type="button" className={activeWorkspace === "usage" ? "active" : ""} aria-label="用量统计" title="用量统计" onClick={() => setActiveWorkspace("usage")}><BarChart3 size={16} /><span>用量统计</span></button>
        </nav>
      </header>
      <div className={isJobWorkspace ? "workspace-layout with-job-sidebar" : "workspace-layout"}>
      {isJobWorkspace && <aside className="job-sidebar">
        <div className="job-sidebar-heading"><h2>岗位池</h2><div className="job-pool-heading-actions"><button type="button" title="查看已归档岗位" aria-label="查看已归档岗位" aria-expanded={showArchivedJobs} onClick={() => void toggleArchivedJobs()}><ArchiveRestore size={16} /></button><button type="button" title="新增岗位" aria-label="新增岗位" onClick={() => { setSelectedJobId(""); setData((current) => current ? { ...current, candidates: [] } : current); setActiveWorkspace("job"); }}><Plus size={17} /></button></div></div>
        {jobPoolNotice && <p className="job-pool-notice" role="status">{jobPoolNotice}</p>}
        <nav className="job-pool-list" aria-label="岗位池">
          {jobs.map(({ job }) => <div className="job-pool-item" key={job.id}>
            <div className="job-pool-job-row"><button type="button" aria-current={selectedJobId === job.id ? "page" : undefined} className={selectedJobId === job.id ? "job-pool-job active" : "job-pool-job"} onClick={() => { setSelectedJobId(job.id); setActiveWorkspace("job"); setData((current) => current ? { ...current, candidates: [] } : current); }}><BriefcaseBusiness size={15} /><span><strong>{job.title}</strong><small>{job.status === "confirmed" ? "已确认" : "待确认"}</small></span></button><button type="button" className="remove-job" title={`移出岗位池：${job.title}`} aria-label={`移出岗位池：${job.title}`} disabled={removingJobId === job.id} onClick={() => void removeJob(job)}><Minus size={16} /></button></div>
          </div>)}
          {jobs.length === 0 && <p className="job-pool-empty">暂无岗位</p>}
        </nav>
        {showArchivedJobs && <section className="archived-jobs" aria-label="已归档岗位"><h3>已归档岗位 <span>{archivedJobs.length}</span></h3>{archivedJobs.length ? archivedJobs.map(({ job }) => <div className="archived-job-row" key={job.id}><span title={job.title}>{job.title}</span><button type="button" disabled={restoringJobId === job.id} onClick={() => void restoreArchivedJob(job)}>{restoringJobId === job.id ? "恢复中" : "恢复"}</button></div>) : <p>暂无已归档岗位</p>}</section>}
      </aside>}
      <div className="workspace-main">
      {isJobWorkspace && selectedJobId && <div className="job-workspace-toolbar">
        <nav className="job-workflow-nav" aria-label="当前岗位工作区">
          <button type="button" className={activeWorkspace === "job" ? "active" : ""} onClick={() => setActiveWorkspace("job")}><FileText size={15} /><span>岗位配置</span></button>
          <button type="button" className={activeWorkspace === "candidates" ? "active" : ""} onClick={() => setActiveWorkspace("candidates")}><Users size={15} /><span>候选人</span></button>
          <button type="button" className={activeWorkspace === "interview-drafts" ? "active" : ""} onClick={() => setActiveWorkspace("interview-drafts")}><Mail size={15} /><span>邮件待发区</span></button>
        </nav>
        {activeWorkspace === "candidates" && <label className="job-context-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索候选人或状态" /></label>}
      </div>}
      <DashboardWorkspace hidden={activeWorkspace !== "home"} onOpenCandidates={(jobId) => { setSelectedJobId(jobId); setActiveWorkspace("candidates"); }} onOpenInterviews={(jobId) => { setSelectedJobId(jobId); setActiveWorkspace("interview-drafts"); }} onOpenInbox={() => setActiveWorkspace("inbox")} onCreateJob={() => { setSelectedJobId(""); setData((current) => ({ ...current, candidates: [] })); setActiveWorkspace("job"); }} onOpenJob={(jobId) => { setSelectedJobId(jobId); setActiveWorkspace("job"); }} />
      <JobWorkspace selectedJobId={selectedJobId} jdText={jdText} setJdText={setJdText} candidateCount={data.candidates.length} hidden={activeWorkspace !== "job"} onCandidatesChange={(items) => { setData((current) => ({ ...current, candidates: items })); setJobs((current) => current.map((entry) => entry.job.id === selectedJobId ? { ...entry, candidateCount: items.length } : entry)); }} onJobChange={(entry) => { setJobs((current) => [entry, ...current.filter((item) => item.job.id !== entry.job.id)]); setSelectedJobId(entry.job.id); }} onShowCandidates={() => setActiveWorkspace("candidates")} />
      <CandidateWorkspace jobId={selectedJobId} title={jobs.find((entry) => entry.job.id === selectedJobId)?.job.title ?? "候选人"} candidates={candidates} allCandidates={data.candidates} query={query} expandedId={expandedId} setExpandedId={setExpandedId} onCandidatesChange={(items) => { setData((current) => current ? { ...current, candidates: items } : current); setJobs((current) => current.map((entry) => entry.job.id === selectedJobId ? { ...entry, candidateCount: items.length } : entry)); }} onOpenInterviewDrafts={() => setActiveWorkspace("interview-drafts")} hidden={activeWorkspace !== "candidates"} />
      <InterviewDraftWorkspace jobId={selectedJobId} title={jobs.find((entry) => entry.job.id === selectedJobId)?.job.title ?? "候选人"} hidden={activeWorkspace !== "interview-drafts"} />
      <SettingsWorkspace hidden={activeWorkspace !== "settings"} />
      <EmailInboxWorkspace hidden={activeWorkspace !== "inbox"} jobs={jobs} />
      <UsageWorkspace hidden={activeWorkspace !== "usage"} />
      </div>
      </div>
    </main>
  );
}

type DashboardJobSummary = {
  job: { id: string; title: string; status: string };
  standardVersion: number;
  candidateCount: number;
  interviewCount: number;
  pendingCount: number;
  rejectedCount: number;
  reviewCount: number;
  parseReviewCount: number;
  emailTodoCount: number;
  latestBatch: { status: ScoreProcess["status"]; total: number; completed: number; failed: number; updatedAt: string } | null;
};

type DashboardSnapshot = {
  todos: { review: number; parseReview: number; pending: number; email: number };
  jobs: DashboardJobSummary[];
  activities: Array<{ id: string; kind: "mail" | "score" | "email"; title: string; detail: string; timestamp: string; jobId?: string }>;
};

function DashboardWorkspace({ hidden, onOpenCandidates, onOpenInterviews, onOpenInbox, onCreateJob, onOpenJob }: {
  hidden: boolean;
  onOpenCandidates: (jobId: string) => void;
  onOpenInterviews: (jobId: string) => void;
  onOpenInbox: () => void;
  onCreateJob: () => void;
  onOpenJob: (jobId: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refreshInFlight = useRef(false);

  async function refresh() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error("读取工作台数据失败。");
      setSnapshot(await response.json() as DashboardSnapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取工作台数据失败。");
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (hidden) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [hidden]);

  const jobs = snapshot?.jobs ?? [];
  const uploadJob = jobs.find((item) => item.job.status === "confirmed");
  const todoCards = [
    { key: "review", label: "待 HR 初审", value: snapshot?.todos.review ?? 0, icon: ClipboardCheck, tone: "teal" },
    { key: "parseReview", label: "解析需复核", value: snapshot?.todos.parseReview ?? 0, icon: FileWarning, tone: "amber" },
    { key: "pending", label: "待定候选人", value: snapshot?.todos.pending ?? 0, icon: Users, tone: "blue" },
    { key: "email", label: "邮件待发", value: snapshot?.todos.email ?? 0, icon: Mail, tone: "coral" },
  ] as const;

  function openTodo(key: typeof todoCards[number]["key"]) {
    const job = jobs.find((item) => key === "review" ? item.reviewCount > 0
      : key === "parseReview" ? item.parseReviewCount > 0
        : key === "pending" ? item.pendingCount > 0
          : item.emailTodoCount > 0);
    if (!job) return;
    if (key === "email") onOpenInterviews(job.job.id);
    else onOpenCandidates(job.job.id);
  }

  return <section className="content dashboard-workspace" hidden={hidden}>
    <header className="dashboard-header">
      <div><span className="folio">工作台</span><h2>招聘工作总览</h2><p>查看待处理事项与岗位进展。</p></div>
      <div className="dashboard-actions">
        <button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()} title="刷新工作台"><RefreshCw size={15} />刷新</button>
        <button type="button" className="secondary-button" onClick={onOpenInbox}><Inbox size={15} />邮件收件箱</button>
        <button type="button" className="secondary-button" disabled={!uploadJob} onClick={() => uploadJob && onOpenJob(uploadJob.job.id)}><Upload size={15} />上传简历</button>
        <button type="button" onClick={onCreateJob}><Plus size={16} />新增岗位</button>
      </div>
    </header>
    {error && <p className="dashboard-error" role="alert">{error}</p>}
    <section className="dashboard-todos" aria-label="待处理事项">
      {todoCards.map(({ key, label, value, icon: Icon, tone }) => <button type="button" className={`dashboard-todo ${tone}`} key={key} disabled={!value} onClick={() => openTodo(key)}>
        <span className="dashboard-todo-icon"><Icon size={18} /></span>
        <span className="dashboard-todo-copy"><span>{label}</span><strong>{snapshot ? value : "—"}</strong></span>
        <ArrowRight className="dashboard-todo-arrow" size={16} />
      </button>)}
    </section>
    <div className="dashboard-columns">
      <section className="panel dashboard-jobs">
        <div className="panel-heading"><h3>岗位进展</h3><span>{jobs.length} 个岗位</span></div>
        {!snapshot ? <div className="dashboard-activity-empty">正在读取岗位数据…</div> : jobs.length ? <div className="dashboard-job-list">
          <div className="dashboard-job-head"><span>招聘岗位</span><span>候选人</span><span>最新评分批次</span><span>HR 流程</span><span>操作</span></div>
          {jobs.map((item) => {
            const batch = item.latestBatch;
            const progress = batch && batch.total ? Math.round(batch.completed / batch.total * 100) : 0;
            return <article className="dashboard-job-row" key={item.job.id}>
              <div className="dashboard-job-title"><strong>{item.job.title}</strong><small>{item.job.status === "confirmed" ? `评分标准 v${item.standardVersion}` : "评分标准待确认"}</small></div>
              <div className="dashboard-candidate-count"><strong>{item.candidateCount}</strong><small>位已评分</small></div>
              <div className="dashboard-progress-cell">{batch ? <><div className="dashboard-progress-label"><span>{batch.completed}/{batch.total} 份</span><small>{processStatusLabel(batch.status)}</small></div><div className="dashboard-progress-track"><span style={{ width: `${progress}%` }} /></div></> : <span className="dashboard-muted">尚未开始</span>}</div>
              <div className="dashboard-stage-counts"><span>面试 {item.interviewCount}</span><span>待定 {item.pendingCount}</span><span>淘汰 {item.rejectedCount}</span></div>
              <button type="button" className="dashboard-open-job" onClick={() => onOpenJob(item.job.id)} title={`打开${item.job.title}`} aria-label={`打开${item.job.title}`}><ArrowRight size={17} /></button>
            </article>;
          })}
        </div> : <div className="dashboard-empty"><BriefcaseBusiness size={23} /><strong>暂无岗位</strong><span>新增岗位后，岗位进展会显示在这里。</span><button type="button" onClick={onCreateJob}><Plus size={15} />新增岗位</button></div>}
      </section>
      <section className="panel dashboard-activity">
        <div className="panel-heading"><h3>最近动态</h3><span>{snapshot?.activities.length ?? 0} 条</span></div>
        {!snapshot ? <div className="dashboard-activity-empty">正在读取动态…</div> : snapshot.activities.length ? <ol className="dashboard-activity-list">{snapshot.activities.map((activity) => <li key={activity.id}>
          <span className={`dashboard-activity-icon ${activity.kind}`}>{activity.kind === "mail" ? <Inbox size={15} /> : activity.kind === "email" ? <Mail size={15} /> : <Clock3 size={15} />}</span>
          <div><strong>{activity.title}</strong><span>{activity.detail}</span><time>{formatDashboardTime(activity.timestamp)}</time></div>
          {activity.kind === "mail" && <button type="button" onClick={onOpenInbox} title="查看邮件收件箱" aria-label="查看邮件收件箱"><ArrowRight size={15} /></button>}
          {activity.jobId && activity.kind !== "mail" && <button type="button" onClick={() => activity.kind === "email" ? onOpenInterviews(activity.jobId!) : onOpenJob(activity.jobId!)} title="打开岗位" aria-label="打开岗位"><ArrowRight size={15} /></button>}
        </li>)}</ol> : <div className="dashboard-activity-empty">暂无邮件或评分动态。</div>}
      </section>
    </div>
  </section>;
}

function formatDashboardTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return isToday
    ? `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type LlmSettings = {
  provider: "openai" | "deepseek" | "custom";
  model: string;
  baseURL: string;
  hasApiKey: boolean;
  langSmithTracing: boolean;
  langSmithEndpoint: string;
  langSmithProject: string;
  hasLangSmithApiKey: boolean;
  mailProvider: "qq" | "custom";
  mailAddress: string;
  hasMailAuthCode: boolean;
  mailEnabled: boolean;
  mailImapHost: string;
  mailImapPort: number;
  mailImapSecure: boolean;
  mailSmtpHost: string;
  mailSmtpPort: number;
  mailSmtpSecure: boolean;
};

type ResumeArchiveSettings = { enabled: boolean; directory: string; retentionDays: 30 | 90 | 180 | 365 | null };
type AvailableModel = { id: string; name?: string };

declare global {
  interface Window {
    resumeScreening?: {
      selectArchiveDirectory: () => Promise<string | undefined>;
      openArchiveDirectory: () => Promise<void>;
    };
  }
}

function SettingsWorkspace({ hidden }: { hidden: boolean }) {
  const [settings, setSettings] = useState<LlmSettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelFetchBusy, setModelFetchBusy] = useState(false);
  const [modelNotice, setModelNotice] = useState("");
  const [langSmithApiKey, setLangSmithApiKey] = useState("");
  const [mailProvider, setMailProvider] = useState<"qq" | "custom">("qq");
  const [mailAddress, setMailAddress] = useState("");
  const [mailAuthCode, setMailAuthCode] = useState("");
  const [mailEnabled, setMailEnabled] = useState(false);
  const [mailImapHost, setMailImapHost] = useState("imap.qq.com");
  const [mailImapPort, setMailImapPort] = useState(993);
  const [mailImapSecure, setMailImapSecure] = useState(true);
  const [mailSmtpHost, setMailSmtpHost] = useState("smtp.qq.com");
  const [mailSmtpPort, setMailSmtpPort] = useState(465);
  const [mailSmtpSecure, setMailSmtpSecure] = useState(true);
  const [showMailAuthCode, setShowMailAuthCode] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showLangSmithApiKey, setShowLangSmithApiKey] = useState(false);
  const [revealingKey, setRevealingKey] = useState<"llm" | "langsmith" | "mail" | "">("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mailNotice, setMailNotice] = useState("");
  const [archiveSettings, setArchiveSettings] = useState<ResumeArchiveSettings | null>(null);
  const [savedArchiveDirectory, setSavedArchiveDirectory] = useState("");
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveNotice, setArchiveNotice] = useState("");

  React.useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("读取模型 API 设置失败。");
        return response.json() as Promise<LlmSettings>;
      })
      .then((value) => {
        setSettings(value);
        setMailProvider(value.mailProvider);
        setMailAddress(value.mailAddress);
        setMailEnabled(value.mailEnabled);
        setMailImapHost(value.mailImapHost);
        setMailImapPort(value.mailImapPort);
        setMailImapSecure(value.mailImapSecure);
        setMailSmtpHost(value.mailSmtpHost);
        setMailSmtpPort(value.mailSmtpPort);
        setMailSmtpSecure(value.mailSmtpSecure);
      })
      .catch((error: Error) => setNotice(error.message));
    fetch("/api/archive/settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("读取简历归档设置失败。");
        const value = await response.json() as ResumeArchiveSettings;
        setArchiveSettings(value);
        setSavedArchiveDirectory(value.directory);
      })
      .catch((error: Error) => setArchiveNotice(error.message));
  }, []);

  async function chooseArchiveDirectory() {
    if (!archiveSettings) return;
    try {
      const directory = window.resumeScreening
        ? await window.resumeScreening.selectArchiveDirectory()
        : (await postJson<{ directory: string | null }>("/api/archive/select-directory", {})).directory ?? undefined;
      if (directory) setArchiveSettings({ ...archiveSettings, directory });
    } catch (error) {
      setArchiveNotice(error instanceof Error ? error.message : "选择归档文件夹失败。");
    }
  }

  async function saveArchiveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!archiveSettings) return;
    setArchiveBusy(true);
    setArchiveNotice("");
    try {
      const saved = await postJson<ResumeArchiveSettings>("/api/archive/settings", archiveSettings, "PUT");
      setArchiveSettings(saved);
      setSavedArchiveDirectory(saved.directory);
      setArchiveNotice("简历归档设置已保存。调整保留期限只影响之后收到的简历，已有文件的到期时间不变。");
    } catch (error) {
      setArchiveNotice(error instanceof Error ? error.message : "保存简历归档设置失败。");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function openArchiveDirectory() {
    try {
      await window.resumeScreening?.openArchiveDirectory();
    } catch (error) {
      setArchiveNotice(error instanceof Error ? error.message : "打开归档文件夹失败。");
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ saved: boolean; hasApiKey: boolean; hasLangSmithApiKey: boolean }>("/api/settings", {
        provider: settings.provider,
        model: settings.model,
        baseURL: settings.baseURL,
        apiKey,
        langSmithTracing: settings.langSmithTracing,
        langSmithEndpoint: settings.langSmithEndpoint,
        langSmithProject: settings.langSmithProject,
        langSmithApiKey,
      }, "PUT");
      setSettings({ ...settings, hasApiKey: result.hasApiKey, hasLangSmithApiKey: result.hasLangSmithApiKey });
      setApiKey("");
      setLangSmithApiKey("");
      setShowApiKey(false);
      setShowLangSmithApiKey(false);
      setNotice("API 设置已保存，新配置将用于后续调用。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存模型 API 设置失败。");
    } finally {
      setBusy(false);
    }
  }

  async function fetchModels() {
    if (!settings) return;
    setModelFetchBusy(true);
    setModelNotice("");
    try {
      const result = await postJson<{ models: AvailableModel[] }>("/api/settings/models", {
        provider: settings.provider,
        baseURL: settings.baseURL,
        apiKey,
      });
      setAvailableModels(result.models);
      setSettings((current) => current ? {
        ...current,
        model: current.model || result.models[0]?.id || "",
      } : current);
      setModelNotice(`已获取 ${result.models.length} 个模型；选择列表建议或手动输入模型名称。`);
    } catch (error) {
      setAvailableModels([]);
      setModelNotice(error instanceof Error ? error.message : "获取模型列表失败。");
    } finally {
      setModelFetchBusy(false);
    }
  }

  async function toggleKeyVisibility(kind: "llm" | "langsmith") {
    const visible = kind === "llm" ? showApiKey : showLangSmithApiKey;
    const configured = kind === "llm" ? settings?.hasApiKey : settings?.hasLangSmithApiKey;
    const currentKey = kind === "llm" ? apiKey : langSmithApiKey;
    if (visible) {
      kind === "llm" ? setShowApiKey(false) : setShowLangSmithApiKey(false);
      return;
    }
    if (configured && !currentKey) {
      setRevealingKey(kind);
      try {
        const result = await postJson<{ key: string }>("/api/settings/reveal-key", { kind });
        kind === "llm" ? setApiKey(result.key) : setLangSmithApiKey(result.key);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "读取 API Key 失败。");
        return;
      } finally {
        setRevealingKey("");
      }
    }
    kind === "llm" ? setShowApiKey(true) : setShowLangSmithApiKey(true);
  }

  async function saveMailSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMailNotice("");
    try {
      const result = await postJson<{ address: string; hasAuthCode: boolean; enabled: boolean }>("/api/settings/mail", {
        provider: mailProvider,
        address: mailAddress,
        authCode: mailAuthCode,
        enabled: mailEnabled,
        imapHost: mailImapHost,
        imapPort: Number(mailImapPort),
        imapSecure: mailImapSecure,
        smtpHost: mailSmtpHost,
        smtpPort: Number(mailSmtpPort),
        smtpSecure: mailSmtpSecure,
      }, "PUT");
      setSettings((current) => current ? { ...current, mailAddress: result.address, hasMailAuthCode: result.hasAuthCode, mailEnabled: result.enabled } : current);
      setMailAuthCode("");
      setShowMailAuthCode(false);
      setMailNotice("邮箱 IMAP 收件与 SMTP 发件连接成功，设置已保存。启用自动收件后会定时检查新邮件。");
    } catch (error) {
      setMailNotice(error instanceof Error ? error.message : "邮箱连接失败。");
    } finally {
      setBusy(false);
    }
  }

  async function revealMailAuthCode() {
    if (showMailAuthCode) {
      setShowMailAuthCode(false);
      return;
    }
    if (!mailAuthCode && settings?.hasMailAuthCode) {
      try {
        const result = await postJson<{ key: string }>("/api/settings/reveal-key", { kind: "mail" });
        setMailAuthCode(result.key);
      } catch (error) {
        setMailNotice(error instanceof Error ? error.message : "读取邮箱客户端密码失败。");
        return;
      }
    }
    setShowMailAuthCode(true);
  }

  return <section className="content settings-workspace" hidden={hidden}>
    <header className="settings-header"><div><span className="folio">系统配置</span><h2>设置</h2><p>管理模型服务接口与本地凭据。</p></div></header>
    <form className="settings-api-layout" onSubmit={(event) => void saveSettings(event)}>
      <section className="panel settings-form settings-api-section">
        <div className="panel-heading"><Settings size={17} /><h3>模型 API</h3><span>{settings?.hasApiKey ? "密钥已配置" : "需要配置密钥"}</span></div>
        {!settings ? <p className="settings-loading">正在读取配置…</p> : <div className="settings-fields">
          <label>服务商<select value={settings.provider} onChange={(event) => { setSettings({ ...settings, provider: event.target.value as LlmSettings["provider"] }); setAvailableModels([]); setModelNotice(""); }}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="custom">自定义兼容接口</option></select></label>
          <div className="settings-model-field"><label htmlFor="llm-model-name">模型名称</label><div className="model-discovery-control"><input id="llm-model-name" list="llm-model-options" required value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="例如 deepseek-flash" /><datalist id="llm-model-options">{availableModels.map((model) => <option key={model.id} value={model.id} label={model.name} />)}</datalist><button type="button" className="secondary-button" disabled={modelFetchBusy || (!apiKey.trim() && !settings.hasApiKey)} onClick={() => void fetchModels()} title={!apiKey.trim() && !settings.hasApiKey ? "请先填写 API Key" : "从服务商获取可用模型"}><RefreshCw size={14} />{modelFetchBusy ? "获取中" : "拉取模型"}</button></div><span className="model-discovery-notice" role={modelNotice ? "status" : undefined}>{modelNotice || "填写 API Key 后可拉取服务商模型；也可以手动输入模型名称。"}</span></div>
          <label className="settings-wide-field">接口地址<input type="url" value={settings.baseURL} onChange={(event) => { setSettings({ ...settings, baseURL: event.target.value }); setAvailableModels([]); setModelNotice(""); }} placeholder={settings.provider === "deepseek" ? "https://api.deepseek.com" : "留空使用服务商默认地址"} /></label>
          <label className="settings-wide-field">API Key<div className="secret-input-row"><input type={showApiKey || settings.hasApiKey ? "text" : "password"} autoComplete="new-password" readOnly={settings.hasApiKey && !showApiKey} value={settings.hasApiKey && !showApiKey ? "********" : apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? "已配置；留空则保持不变" : "请输入 API Key"} /><button type="button" aria-label={showApiKey ? "隐藏模型 API Key" : "显示模型 API Key"} title={showApiKey ? "隐藏 API Key" : revealingKey === "llm" ? "读取中" : "显示 API Key"} disabled={revealingKey === "llm"} onClick={() => void toggleKeyVisibility("llm")}>{showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        </div>}
      </section>
      {settings && <section className="panel settings-form settings-langsmith-section">
        <div className="panel-heading"><h3>LangSmith 追踪</h3><label className="settings-heading-toggle"><input type="checkbox" checked={settings.langSmithTracing} onChange={(event) => setSettings({ ...settings, langSmithTracing: event.target.checked })} />启用</label><span>{settings.hasLangSmithApiKey ? "密钥已配置" : "未配置密钥"}</span></div>
        <div className="settings-fields">
          <label className="settings-wide-field">项目名称<input required value={settings.langSmithProject} onChange={(event) => setSettings({ ...settings, langSmithProject: event.target.value })} /></label>
          <label className="settings-wide-field">接口地址<input type="url" value={settings.langSmithEndpoint} onChange={(event) => setSettings({ ...settings, langSmithEndpoint: event.target.value })} /></label>
          <label className="settings-wide-field">LangSmith API Key<div className="secret-input-row"><input type={showLangSmithApiKey || settings.hasLangSmithApiKey ? "text" : "password"} autoComplete="new-password" readOnly={settings.hasLangSmithApiKey && !showLangSmithApiKey} value={settings.hasLangSmithApiKey && !showLangSmithApiKey ? "********" : langSmithApiKey} onChange={(event) => setLangSmithApiKey(event.target.value)} placeholder={settings.hasLangSmithApiKey ? "已配置；留空则保持不变" : "请输入 LangSmith API Key"} /><button type="button" aria-label={showLangSmithApiKey ? "隐藏 LangSmith API Key" : "显示 LangSmith API Key"} title={showLangSmithApiKey ? "隐藏 API Key" : revealingKey === "langsmith" ? "读取中" : "显示 API Key"} disabled={revealingKey === "langsmith"} onClick={() => void toggleKeyVisibility("langsmith")}>{showLangSmithApiKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        </div>
      </section>}
      <div className="settings-footer settings-api-footer"><p>桌面版使用 Windows 用户账户加密保存 API Key；开发模式写入本机 .env。留空表示保留已有密钥。</p><button type="submit" disabled={!settings || busy}>{busy ? "保存中…" : "保存设置"}</button></div>
      {notice && <p className="settings-notice settings-api-notice" role="status">{notice}</p>}
    </form>
    <form className="panel settings-form settings-full-row email-settings-form" onSubmit={(event) => void saveMailSettings(event)}>
      <div className="panel-heading"><Mail size={17} /><h3>邮件收件与发送</h3><label className="settings-heading-toggle" title="每 2 分钟检查一次"><input type="checkbox" checked={mailEnabled} onChange={(event) => setMailEnabled(event.target.checked)} />自动收取</label><span>{settings?.hasMailAuthCode ? "已配置" : "未连接"}</span></div>
      <p className="email-settings-help">支持 QQ 预设及标准 IMAP/SMTP 邮箱。首次连接会跳过收件箱已有邮件；请让应聘者在邮件主题中写唯一岗位名称。仅支持服务商允许 IMAP/SMTP 密码或客户端授权码登录的账户；OAuth-only 账户暂不支持。</p>
      <div className="settings-fields">
        <label>邮箱接入方式<select value={mailProvider} onChange={(event) => {
          const next = event.target.value as "qq" | "custom";
          setMailProvider(next);
          if (next === "qq") { setMailImapHost("imap.qq.com"); setMailImapPort(993); setMailImapSecure(true); setMailSmtpHost("smtp.qq.com"); setMailSmtpPort(465); setMailSmtpSecure(true); }
          else { setMailImapHost(""); setMailImapPort(993); setMailImapSecure(true); setMailSmtpHost(""); setMailSmtpPort(465); setMailSmtpSecure(true); }
        }}><option value="qq">QQ 邮箱</option><option value="custom">其他邮箱（自定义 IMAP/SMTP）</option></select></label>
        <label>邮箱地址<input type="email" required value={mailAddress} onChange={(event) => setMailAddress(event.target.value)} placeholder="name@example.com" /></label>
        <label>客户端授权码 / 应用专用密码<div className="secret-input-row"><input type={showMailAuthCode ? "text" : "password"} autoComplete="new-password" value={mailAuthCode} onChange={(event) => setMailAuthCode(event.target.value)} placeholder={settings?.hasMailAuthCode ? "已配置；留空保持不变" : "请输入邮箱服务商提供的客户端凭据"} required={!settings?.hasMailAuthCode} /><button type="button" aria-label={showMailAuthCode ? "隐藏邮件客户端密码" : "显示邮件客户端密码"} title={showMailAuthCode ? "隐藏密码" : revealingKey === "mail" ? "读取中" : "显示密码"} disabled={revealingKey === "mail"} onClick={() => void revealMailAuthCode()}>{showMailAuthCode ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label>IMAP 服务器<input required value={mailImapHost} onChange={(event) => setMailImapHost(event.target.value)} placeholder="例如 imap.example.com" /></label>
        <label>IMAP 端口<input type="number" min={1} max={65535} required value={mailImapPort} onChange={(event) => setMailImapPort(Number(event.target.value))} /></label>
        <label className="settings-heading-toggle"><input type="checkbox" checked={mailImapSecure} onChange={(event) => setMailImapSecure(event.target.checked)} />IMAP 使用 TLS</label>
        <label>SMTP 服务器<input required value={mailSmtpHost} onChange={(event) => setMailSmtpHost(event.target.value)} placeholder="例如 smtp.example.com" /></label>
        <label>SMTP 端口<input type="number" min={1} max={65535} required value={mailSmtpPort} onChange={(event) => setMailSmtpPort(Number(event.target.value))} /></label>
        <label className="settings-heading-toggle"><input type="checkbox" checked={mailSmtpSecure} onChange={(event) => setMailSmtpSecure(event.target.checked)} />SMTP 使用 TLS</label>
      </div>
      <div className="settings-footer"><p>连接测试会分别验证 IMAP 收件和 SMTP 发件。邮件主题匹配不唯一时会进入收件箱等待人工分配。支持 PDF、DOCX、TXT 附件，单份不超过 20 MB。</p><button type="submit" disabled={busy}>{busy ? "测试连接中…" : settings?.hasMailAuthCode ? "测试并保存" : "测试并连接"}</button></div>
      {mailNotice && <p className="settings-notice" role="status">{mailNotice}</p>}
    </form>
    <form className="panel settings-form settings-full-row archive-settings-form" onSubmit={(event) => void saveArchiveSettings(event)}>
      <div className="panel-heading"><ArchiveRestore size={17} /><h3>简历本地归档</h3>{archiveSettings && <label className="settings-heading-toggle"><input type="checkbox" checked={archiveSettings.enabled} onChange={(event) => setArchiveSettings({ ...archiveSettings, enabled: event.target.checked })} />启用</label>}<span>{archiveSettings?.enabled ? "已启用" : "已关闭"}</span></div>
      {!archiveSettings ? <p className="settings-loading">正在读取归档设置…</p> : <>
        <div className="settings-fields">
          <div className="archive-directory-control"><span>归档文件夹</span><div><input aria-label="归档文件夹路径" readOnly value={archiveSettings.directory} placeholder="请选择本地文件夹" /><button type="button" className="secondary-button" onClick={() => void chooseArchiveDirectory()}>选择文件夹</button>{window.resumeScreening && archiveSettings.directory && archiveSettings.directory === savedArchiveDirectory && <button type="button" className="secondary-button" onClick={() => void openArchiveDirectory()}>打开文件夹</button>}</div></div>
          <label>保存时间<select value={archiveSettings.retentionDays ?? "forever"} onChange={(event) => setArchiveSettings({ ...archiveSettings, retentionDays: event.target.value === "forever" ? null : Number(event.target.value) as 30 | 90 | 180 | 365 })}><option value="forever">永久保留</option><option value="30">30 天</option><option value="90">90 天</option><option value="180">180 天</option><option value="365">365 天</option></select></label>
        </div>
        <div className="settings-footer"><p>邮件收取和手动上传的简历都会归档到“岗位名 / 年-月”；同名文件不会覆盖。关闭归档不删除已有文件。</p><button type="submit" disabled={archiveBusy}>{archiveBusy ? "保存中…" : "保存归档设置"}</button></div>
      </>}
      {archiveNotice && <p className="settings-notice" role="status">{archiveNotice}</p>}
    </form>
  </section>;
}

type EmailInboxItem = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  jobId?: string;
  jobTitle?: string;
  status: "needs_assignment" | "needs_download" | "queued" | "processing" | "completed" | "failed" | "ignored";
  attachmentNames: string[];
  cloudLinks?: string[];
  error?: string;
};

function EmailInboxWorkspace({ hidden, jobs }: { hidden: boolean; jobs: JobPoolEntry[] }) {
  const [items, setItems] = useState<EmailInboxItem[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const response = await fetch("/api/email/inbox");
    if (!response.ok) throw new Error("读取邮件收件箱失败。");
    setItems(await response.json() as EmailInboxItem[]);
  }

  React.useEffect(() => {
    if (!hidden) void refresh().catch((error: Error) => setNotice(error.message));
  }, [hidden]);

  async function pollNow() {
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ received: number; queued: number; needsAssignment: number; needsDownload: number; errors: string[] }>("/api/email/poll", {});
      await refresh();
      setNotice(`本次收到 ${result.received} 封邮件，已进入评分 ${result.queued} 封，待分配 ${result.needsAssignment} 封，疑似云附件待下载 ${result.needsDownload} 封${result.errors.length ? `；失败 ${result.errors.length} 封` : ""}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "收取邮件失败。");
    } finally {
      setBusy(false);
    }
  }

  async function assign(itemId: string) {
    const jobId = assignments[itemId];
    if (!jobId) return;
    setBusy(true);
    try {
      await postJson("/api/email/assign", { itemId, jobId });
      await refresh();
      setNotice("邮件已分配到岗位并加入评分流程。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "分配岗位失败。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="content email-inbox-workspace" hidden={hidden}>
    <header className="settings-header"><div><span className="folio">邮件自动收件</span><h2>邮件收件箱</h2><p>按主题中的岗位名称分流简历附件。</p></div><button type="button" className="secondary-button" disabled={busy} onClick={() => void pollNow()}><RefreshCw size={15} />{busy ? "处理中…" : "立即收取"}</button></header>
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    <div className="email-inbox-list">{items.length ? items.map((item) => <article className="email-inbox-item" key={item.id}>
      <div className="email-inbox-heading"><strong>{item.subject}</strong><span className={`email-inbox-status ${item.status}`}>{emailStatusLabel(item.status)}</span></div>
      <p>{item.from} · {new Date(item.receivedAt).toLocaleString()}</p>
      <p>附件：{item.attachmentNames.length ? item.attachmentNames.join("、") : "无可处理附件"}</p>
      {item.jobTitle && <p>岗位：{item.jobTitle}</p>}
      {item.error && <p className="email-inbox-error">{item.error}</p>}
      {item.cloudLinks?.map((link) => <p className="email-cloud-link" key={link}><a href={link} target="_blank" rel="noopener noreferrer">打开附件链接</a> <span>{link}</span></p>)}
      {item.status === "needs_assignment" && <div className="email-assign-row"><select aria-label="分配岗位" value={assignments[item.id] ?? ""} onChange={(event) => setAssignments({ ...assignments, [item.id]: event.target.value })}><option value="">选择岗位</option>{jobs.filter((entry) => entry.job.status === "confirmed").map((entry) => <option key={entry.job.id} value={entry.job.id}>{entry.job.title}</option>)}</select><button type="button" className="secondary-button" disabled={busy || !assignments[item.id]} onClick={() => void assign(item.id)}>分配并评分</button></div>}
    </article>) : <p className="email-inbox-empty">暂无邮件记录。配置邮箱 IMAP/SMTP 后，可立即收取或开启自动收件。</p>}</div>
  </section>;
}

function emailStatusLabel(status: EmailInboxItem["status"]): string {
  return ({ needs_assignment: "待分配", needs_download: "云附件待下载", queued: "已排队", processing: "评分中", completed: "已完成", failed: "失败", ignored: "已忽略" })[status];
}

function isInterviewDraftSendable(draft: InterviewDraft): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) && Boolean(draft.subject.trim() && draft.body.trim());
}

type InterviewDraft = {
  candidateId: string;
  name: string;
  documentName: string;
  email: string;
  emailSource: "manual" | "resume" | "inbox" | "missing";
  subject: string;
  body: string;
  updatedAt?: string;
  sendStatus?: "sending" | "sent" | "failed" | "unknown";
  lastSendAttemptAt?: string;
  sentAt?: string;
  lastSendError?: string;
};

type InterviewEmailTemplate = {
  subject: string;
  opening: string;
  interviewTime: string;
  location: string;
  format: string;
  additionalInfo: string;
  closing: string;
  updatedAt?: string;
};

function defaultInterviewEmailTemplate(title: string): InterviewEmailTemplate {
  return {
    subject: `面试邀请 - ${title}`,
    opening: `感谢您应聘${title}。我们希望邀请您参加面试。`,
    interviewTime: "",
    location: "",
    format: "",
    additionalInfo: "",
    closing: "请回复确认是否参加。\n\nHR",
  };
}

function renderInterviewEmail(template: InterviewEmailTemplate, name: string): string {
  const schedule = [
    template.interviewTime.trim() ? `面试时间：${template.interviewTime.trim()}` : "",
    template.location.trim() ? `面试地点：${template.location.trim()}` : "",
    template.format.trim() ? `面试方式：${template.format.trim()}` : "",
  ].filter(Boolean).join("\n");
  return [
    `${name}，您好：`,
    template.opening.trim(),
    schedule,
    template.additionalInfo.trim(),
    template.closing.trim(),
  ].filter(Boolean).join("\n\n");
}

function InterviewDraftWorkspace({ jobId, title, hidden }: { jobId: string; title: string; hidden: boolean }) {
  const [drafts, setDrafts] = useState<InterviewDraft[]>([]);
  const [emailTemplate, setEmailTemplate] = useState<InterviewEmailTemplate>(() => defaultInterviewEmailTemplate(title));
  const [templateExpanded, setTemplateExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const allSelected = drafts.length > 0 && drafts.every((draft) => selectedIds.includes(draft.candidateId));
  const templatePreviewDraft = drafts.find((draft) => selectedIds.includes(draft.candidateId)) ?? drafts[0];

  async function refresh() {
    if (!jobId) {
      setDrafts([]);
      return;
    }
    const response = await fetch(`/api/jobs/interview-drafts?jobId=${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error("读取邮件待发区失败。");
    setDrafts(await response.json() as InterviewDraft[]);
  }

  async function refreshTemplate() {
    if (!jobId) return;
    const response = await fetch(`/api/jobs/interview-template?jobId=${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error("读取邮件模板失败。");
    setEmailTemplate(await response.json() as InterviewEmailTemplate);
  }

  React.useEffect(() => {
    setSelectedIds([]);
    setEditingId("");
    setNotice("");
    setEmailTemplate(defaultInterviewEmailTemplate(title));
    if (!hidden) {
      void refresh().catch((error: Error) => setNotice(error.message));
      void refreshTemplate().catch((error: Error) => setNotice(error.message));
    }
  }, [hidden, jobId, title]);

  function updateDraft(candidateId: string, patch: Partial<InterviewDraft>) {
    setDrafts((current) => current.map((draft) => draft.candidateId === candidateId ? { ...draft, ...patch } : draft));
  }

  async function saveDrafts(items: InterviewDraft[], showNotice = true): Promise<boolean> {
    if (!items.length) return false;
    setBusy(true);
    if (showNotice) setNotice("");
    try {
      await postJson("/api/jobs/interview-drafts", { jobId, drafts: items.map(({ candidateId, email, subject, body }) => ({ candidateId, email, subject, body })) }, "PUT");
      await refresh();
      if (showNotice) setNotice(items.length === 1 ? "草稿已保存。" : `已为 ${items.length} 位候选人保存独立草稿。`);
      return true;
    } catch (error) {
      if (showNotice) setNotice(error instanceof Error ? error.message : "保存草稿失败。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createSelectedDrafts() {
    const items = drafts.filter((draft) => selectedIds.includes(draft.candidateId)).map((draft) => ({
      ...draft,
      subject: draft.subject || emailTemplate.subject,
      body: draft.body || renderInterviewEmail(emailTemplate, draft.name),
    }));
    await saveDrafts(items);
  }

  async function saveTemplate() {
    setBusy(true);
    setNotice("");
    try {
      await postJson("/api/jobs/interview-template", { jobId, template: emailTemplate }, "PUT");
      setNotice("邮件模板已保存。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存邮件模板失败。");
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate() {
    const eligible = drafts.filter((draft) => !draft.sentAt && !["sending", "sent", "failed", "unknown"].includes(draft.sendStatus ?? ""));
    if (!eligible.length) {
      setNotice("没有可应用模板的未发送草稿；已发送、发送失败或状态待核实的邮件不会被覆盖。");
      return;
    }
    if (!window.confirm(`将更新 ${eligible.length} 位候选人的邮件主题和正文，覆盖这些未发送草稿中已有的编辑内容。已发送、失败或状态待核实的邮件不会更改。继续吗？`)) return;

    setBusy(true);
    setNotice("");
    try {
      await postJson("/api/jobs/interview-template", { jobId, template: emailTemplate }, "PUT");
      const items = eligible.map((draft) => ({
        ...draft,
        subject: emailTemplate.subject,
        body: renderInterviewEmail(emailTemplate, draft.name),
      }));
      if (!await saveDrafts(items, false)) {
        setNotice("模板已保存，但应用到候选人草稿失败。请重试应用。");
        return;
      }
      setNotice(`模板已保存，并应用到 ${items.length} 位候选人的独立草稿。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "应用邮件模板失败。");
    } finally {
      setBusy(false);
    }
  }

  async function sendCandidates(candidateIds: string[]) {
    const selected = drafts.filter((draft) => candidateIds.includes(draft.candidateId));
    const sendable = selected.filter((draft) => !draft.sentAt && !["sending", "sent", "unknown"].includes(draft.sendStatus ?? "") && isInterviewDraftSendable(draft));
    const skippedCount = selected.length - sendable.length;
    if (!sendable.length) {
      const hasUnverified = selected.some((draft) => draft.sendStatus === "unknown" || draft.sendStatus === "sending");
      setNotice(hasUnverified
        ? "有邮件的发送结果待核实。请先检查已配置邮箱的已发送邮件；确认未发送后，再点击候选人状态下方的“确认未发送”。"
        : "所选候选人没有可发送的草稿。请检查有效邮箱、主题和正文，并先保存草稿。");
      return;
    }
    const unverifiedCount = selected.filter((draft) => draft.sendStatus === "unknown" || draft.sendStatus === "sending").length;
    const retryCount = sendable.filter((draft) => draft.sendStatus === "failed").length;
    const recipients = sendable.map((draft) => `${draft.name} <${draft.email}>`).join("\n");
    const warning = skippedCount ? `\n另有 ${skippedCount} 位未发送：${unverifiedCount ? `${unverifiedCount} 位状态待核实，其余信息不完整或已发送` : "信息不完整或已发送"}。` : "";
    const retryWarning = retryCount ? `\n其中 ${retryCount} 位为失败重试。若错误是超时或连接中断，邮件可能已经到达，请先核对邮箱已发送记录。` : "";
    if (!window.confirm(`即将分别向以下 ${sendable.length} 位候选人发送邮件：\n\n${recipients}${warning}${retryWarning}\n\n确认发送？`)) return;
    if (!await saveDrafts(sendable, false)) {
      setNotice("保存草稿失败，未发送邮件。");
      return;
    }

    setBusy(true);
    setSendingIds(sendable.map((draft) => draft.candidateId));
    setNotice("");
    try {
      const result = await postJson<{ results: Array<{ candidateId: string; success: boolean; error?: string }> }>("/api/jobs/send-interview-drafts", { jobId, candidateIds: sendable.map((draft) => draft.candidateId) });
      await refresh();
      const succeeded = result.results.filter((item) => item.success).length;
      const failed = result.results.filter((item) => !item.success);
      const failureDetails = failed.slice(0, 3).map((item) => {
        const name = selected.find((draft) => draft.candidateId === item.candidateId)?.name ?? item.candidateId;
        return `${name}：${item.error ?? "发送失败"}`;
      }).join("；");
      setNotice(`发送处理完成：成功 ${succeeded} 位，未成功 ${failed.length} 位${skippedCount ? `，跳过 ${skippedCount} 位` : ""}。${failureDetails ? `失败详情：${failureDetails}${failed.length > 3 ? "；其余请查看对应候选人状态" : ""}` : ""}`);
    } catch (error) {
      await refresh().catch(() => undefined);
      setNotice(`发送请求未能确认：${error instanceof Error ? error.message : "网络或服务异常"}。请查看每位候选人的发送状态；状态待核实时，先核对邮箱的已发送邮件，不要直接重复发送。`);
    } finally {
      setSendingIds([]);
      setBusy(false);
    }
  }

  async function confirmNotSent(draft: InterviewDraft) {
    if (!window.confirm(`请先在已配置邮箱“已发送”中核对 ${draft.email}。确认没有发送给该候选人后，才解锁重试。现在确认未发送吗？`)) return;
    setBusy(true);
    try {
      await postJson("/api/jobs/interview-drafts/confirm-not-sent", { jobId, candidateId: draft.candidateId });
      await refresh();
      setNotice(`已为${draft.name}解锁重试；请确认收件人和邮件内容后再发送。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "核实发送状态失败。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="content interview-drafts-workspace" hidden={hidden}>
    <header className="settings-header"><div><span className="folio">{title}</span><h2>邮件待发区</h2><p>面试候选人的邮件地址与独立邀请草稿。</p></div><span className="status-pill">{drafts.length} 位面试候选人</span></header>
    {notice && <p className="settings-notice" role="status">{notice}</p>}
    <div className="interview-drafts-layout">
    <aside className="interview-template-panel" aria-label="统一面试邮件编辑区">
      <div className="interview-template-heading"><h3>统一邮件编辑区</h3><div className="interview-template-heading-actions"><button type="button" className="icon-button" aria-label={templateExpanded ? "收起邮件编辑区" : "展开邮件编辑区"} aria-expanded={templateExpanded} title={templateExpanded ? "收起" : "展开"} onClick={() => setTemplateExpanded((expanded) => !expanded)}>{templateExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button>{templateExpanded && <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveTemplate()}>保存模板</button>}</div></div>
      {templateExpanded && <>
      <div className="interview-template-grid">
        <label className="wide">邮件主题<input value={emailTemplate.subject} onChange={(event) => setEmailTemplate((current) => ({ ...current, subject: event.target.value }))} /></label>
        <label className="wide">面试时间<input value={emailTemplate.interviewTime} placeholder="例如：9月28日 14:00" onChange={(event) => setEmailTemplate((current) => ({ ...current, interviewTime: event.target.value }))} /></label>
        <label className="wide">面试地点<input value={emailTemplate.location} placeholder="地址或会议链接" onChange={(event) => setEmailTemplate((current) => ({ ...current, location: event.target.value }))} /></label>
        <label className="wide">面试方式<input value={emailTemplate.format} placeholder="现场、视频或电话" onChange={(event) => setEmailTemplate((current) => ({ ...current, format: event.target.value }))} /></label>
        <label className="full-row">邮件开场<textarea rows={2} value={emailTemplate.opening} onChange={(event) => setEmailTemplate((current) => ({ ...current, opening: event.target.value }))} /></label>
        <label className="wide">补充说明<textarea rows={2} value={emailTemplate.additionalInfo} onChange={(event) => setEmailTemplate((current) => ({ ...current, additionalInfo: event.target.value }))} placeholder="需要候选人准备的材料等" /></label>
        <label className="wide">邮件结尾<textarea rows={2} value={emailTemplate.closing} onChange={(event) => setEmailTemplate((current) => ({ ...current, closing: event.target.value }))} /></label>
      </div>
      <div className="interview-template-preview"><strong>邮件预览 · {templatePreviewDraft?.name ?? "候选人姓名"}</strong><pre>{renderInterviewEmail(emailTemplate, templatePreviewDraft?.name ?? "候选人姓名")}</pre></div>
      <div className="interview-template-actions"><span>应用仅覆盖未发送草稿；每位候选人的邮件仍可单独修改。</span><button type="button" className="send-interview-button" disabled={busy || drafts.every((draft) => draft.sentAt || ["sending", "sent", "failed", "unknown"].includes(draft.sendStatus ?? ""))} onClick={() => void applyTemplate()}>应用到未发送草稿</button></div>
      </>}
    </aside>
    <section className="interview-drafts-list" aria-label="候选人邮件">
    <div className="interview-draft-toolbar">
      <label><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? drafts.map((draft) => draft.candidateId) : [])} />全选</label>
      <span>已选择 {selectedIds.length} 位</span>
      <button type="button" className="secondary-button" disabled={busy || selectedIds.length === 0} onClick={() => void createSelectedDrafts()}><Mail size={15} />为所选创建草稿</button>
      <button type="button" className="send-interview-button" disabled={busy || selectedIds.length === 0} onClick={() => void sendCandidates(selectedIds)}><Send size={15} />发送所选</button>
    </div>
    <div className="interview-draft-table-wrap"><table className="interview-draft-table"><thead><tr><th aria-label="选择" /><th>姓名</th><th>邮箱</th><th>发送状态</th><th>操作</th></tr></thead><tbody>
      {drafts.map((draft) => {
        const sending = sendingIds.includes(draft.candidateId) || draft.sendStatus === "sending";
        const status = sending ? "sending" : draft.sentAt ? "sent" : draft.sendStatus ?? (draft.lastSendError ? "failed" : "draft");
        const statusLabel = ({ draft: "未发送", sending: "发送中", sent: "已发送", failed: "发送失败", unknown: "状态待核实" } as const)[status];
        const statusTime = draft.sentAt ?? draft.lastSendAttemptAt;
        return <React.Fragment key={draft.candidateId}>
        <tr>
          <td><input type="checkbox" aria-label={`选择${draft.name}`} checked={selectedIds.includes(draft.candidateId)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, draft.candidateId])] : current.filter((id) => id !== draft.candidateId))} /></td>
          <td><strong>{draft.name}</strong><small>{draft.documentName}</small></td>
          <td><div className="interview-email-field"><input type="email" value={draft.email} placeholder="未找到有效邮箱" aria-label={`${draft.name}邮箱`} onChange={(event) => updateDraft(draft.candidateId, { email: event.target.value, emailSource: "manual" })} onBlur={() => void saveDrafts([draft])} /><small>{draft.email ? `来源：${({ manual: "手动填写", resume: "简历", inbox: "收件箱", missing: "未找到" })[draft.emailSource]}` : "未找到有效邮箱"}</small></div></td>
          <td><span className={`interview-send-status ${status}`} title={status === "unknown" ? draft.lastSendError : status === "failed" ? "重试前请注意：若错误发生在 SMTP 超时或断连阶段，邮件可能已经送达。" : undefined}>{statusLabel}</span>{statusTime && <small className="interview-send-time">{new Date(statusTime).toLocaleString()}</small>}{status === "failed" && draft.lastSendError && <small className="interview-send-error">{draft.lastSendError}</small>}{status === "unknown" && <><small className="interview-send-error">发送结果不确定，先核对邮箱已发送。</small><button type="button" className="interview-confirm-unsent" disabled={busy} onClick={() => void confirmNotSent(draft)}>确认未发送</button></>}</td>
          <td><div className="interview-row-actions"><button type="button" className="secondary-button" onClick={() => setEditingId(editingId === draft.candidateId ? "" : draft.candidateId)}><FileText size={15} />{draft.body ? "编辑草稿" : "编写草稿"}</button><button type="button" className="send-interview-button" disabled={busy || status === "sent" || status === "sending" || status === "unknown" || !isInterviewDraftSendable(draft)} title={status === "sent" ? "该邀请已发送，不可重复发送" : undefined} onClick={() => void sendCandidates([draft.candidateId])}>{status === "sent" ? "已发送" : status === "sending" ? "发送中" : status === "unknown" ? "待核实" : status === "failed" ? <><RotateCcw size={14} />重试发送</> : <><Send size={15} />发送</>}</button></div></td>
        </tr>
        {editingId === draft.candidateId && <tr className="interview-editor-row"><td colSpan={5}><div className="interview-draft-editor">
          <label>邮件主题<input value={draft.subject} onChange={(event) => updateDraft(draft.candidateId, { subject: event.target.value })} /></label>
          <label>邮件正文<textarea rows={7} value={draft.body} onChange={(event) => updateDraft(draft.candidateId, { body: event.target.value })} placeholder="编辑发给该候选人的面试邀请草稿" /></label>
          <div><span>{draft.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) ? `收件人：${draft.email}` : "请补充有效邮箱；草稿仍可先保存"}{draft.sentAt ? ` · 已于 ${new Date(draft.sentAt).toLocaleString()} 发送` : ""}</span><button type="button" disabled={busy || !draft.body.trim()} onClick={() => void saveDrafts([draft])}>保存草稿</button></div>
        </div></td></tr>}
        </React.Fragment>;
      })}
      {drafts.length === 0 && <tr><td colSpan={5} className="candidate-empty">当前岗位还没有标记为面试的候选人。</td></tr>}
    </tbody></table></div>
    </section>
    </div>
  </section>;
}

type UsageRecord = {
  id: string;
  timestamp: string;
  durationMs: number;
  operation: string;
  provider: string;
  model: string;
  status: "success" | "failed";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  estimatedCostUsd?: number;
  pricingSource?: string;
  pricingPeriod?: "peak" | "off_peak";
};

type UsageStats = {
  period: "7d" | "30d" | "all";
  callCount: number;
  successfulCalls: number;
  failedCalls: number;
  pricedCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  exchangeRate?: { date: string; rate: number; source: string };
  byOperation: Array<{ operation: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>;
  byDay: Array<{ date: string; calls: number; tokens: number; pricedCalls: number; estimatedCostUsd: number }>;
  records: UsageRecord[];
};

function UsageWorkspace({ hidden }: { hidden: boolean }) {
  const [period, setPeriod] = useState<UsageStats["period"]>("30d");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  React.useEffect(() => {
    if (hidden) return;
    setLoading(true);
    setError("");
    fetch(`/api/usage?period=${period}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("读取用量统计失败。");
        return response.json() as Promise<UsageStats>;
      })
      .then(setStats)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [period, hidden, refreshVersion]);

  const dailyPeak = Math.max(1, ...(stats?.byDay.map((item) => item.tokens) ?? []));
  return <section className="content usage-workspace" hidden={hidden}>
    <header className="usage-header"><div><span className="folio">模型调用</span><h2>用量统计</h2><p>本地记录的模型调用、Token 用量与费用估算。</p></div><div className="usage-header-actions"><div className="usage-period" role="group" aria-label="统计周期">{([ ["7d", "近 7 天"], ["30d", "近 30 天"], ["all", "全部"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}</div><button type="button" className="usage-refresh" aria-label="刷新用量统计" title="刷新用量统计" disabled={loading} onClick={() => setRefreshVersion((value) => value + 1)}><RotateCcw size={16} /></button></div></header>
    {error ? <section className="panel usage-empty" role="alert">{error}</section> : loading && !stats ? <section className="panel usage-empty">正在读取用量…</section> : stats && <>
      <div className="usage-metrics">
        <div className="usage-metric"><span>模型调用</span><strong>{formatCount(stats.callCount)}</strong><small>{stats.successfulCalls} 次成功 · {stats.failedCalls} 次失败</small></div>
        <div className="usage-metric"><span>输入 Token</span><strong>{formatCount(stats.inputTokens)}</strong></div>
        <div className="usage-metric"><span>输出 Token</span><strong>{formatCount(stats.outputTokens)}</strong></div>
        <div className="usage-metric"><span>费用估算 · CNY</span><strong>{stats.exchangeRate ? formatCny(stats.estimatedCostUsd * stats.exchangeRate.rate) : "汇率暂不可用"}</strong><small>{stats.pricedCalls} 次已计价 · {stats.unpricedCalls} 次暂无价格</small></div>
      </div>
      {stats.callCount === 0 ? <section className="panel usage-empty">所选周期内暂无模型调用记录。新调用会从现在开始统计，历史调用不会补算。</section> : <>
        <section className="usage-panels">
          <div className="panel usage-panel"><div className="panel-heading"><h3>按操作统计</h3><span>{formatCount(stats.totalTokens)} Token</span></div><div className="usage-operation-list">{stats.byOperation.map((item) => <div className="usage-operation-row" key={item.operation}><span>{usageOperationLabel(item.operation)}</span><strong>{formatCount(item.tokens)}</strong><small>{item.calls} 次 · {item.pricedCalls ? stats.exchangeRate ? formatCny(item.estimatedCostUsd * stats.exchangeRate.rate) : "汇率暂不可用" : "暂无价格"}</small></div>)}</div></div>
          <div className="panel usage-panel"><div className="panel-heading"><h3>每日 Token</h3><span>{stats.byDay.length} 天</span></div><div className="usage-day-list">{stats.byDay.slice(-14).map((item) => <div className="usage-day-row" key={item.date} title={`${item.date}：${formatCount(item.tokens)} Token`}><time>{item.date.slice(5)}</time><span className="usage-bar-track"><span className="usage-bar" style={{ width: `${Math.max(1, item.tokens / dailyPeak * 100)}%` }} /></span><strong>{formatCount(item.tokens)}</strong></div>)}</div></div>
        </section>
        <section className="panel usage-panel usage-history"><div className="panel-heading"><h3>最近调用</h3><span>最多显示 250 条</span></div><div className="usage-table-wrap"><table className="usage-table"><thead><tr><th>时间</th><th>操作</th><th>模型</th><th>输入 Token</th><th>输出 Token</th><th>费用估算</th><th>状态</th></tr></thead><tbody>{stats.records.map((record) => <tr key={record.id}><td>{new Date(record.timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>{usageOperationLabel(record.operation)}</td><td>{record.provider} / {record.model}</td><td>{formatCount(record.inputTokens ?? 0)}</td><td>{formatCount(record.outputTokens ?? 0)}</td><td title={record.pricingSource}>{record.estimatedCostUsd === undefined ? "暂无价格" : stats.exchangeRate ? formatCny(record.estimatedCostUsd * stats.exchangeRate.rate) : "汇率暂不可用"}</td><td><span className={record.status === "success" ? "usage-status-success" : "usage-status-failed"}>{record.status === "success" ? "成功" : "失败"}</span></td></tr>)}</tbody></table></div></section>
      </>}
      <p className="usage-disclaimer">{stats.exchangeRate ? `按 ${stats.exchangeRate.date} USD/CNY ${stats.exchangeRate.rate}（${stats.exchangeRate.source}）折算。` : "USD/CNY 汇率暂不可用，费用暂不折算。"}仅官方 DeepSeek API 且模型价格已知时估算费用；价格依请求时段计算，缓存 Token 明细缺失时按未命中估算。自定义代理及其他服务商显示“暂无价格”。人民币金额为参考汇率折算估算，不是账单实扣值，请以服务商账单为准。</p>
    </>}
  </section>;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCny(value: number): string {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
}

function usageOperationLabel(operation: string): string {
  return ({ resume_extraction: "简历信息提取", resume_scoring: "简历评分", score_standard_generation: "评分标准生成", review_resolution: "复核任务处理", slug_suggestion: "技能名词映射", pdf_vision_ocr: "PDF 视觉识别" })[operation] ?? operation;
}

function JobWorkspace({ selectedJobId, jdText, setJdText, candidateCount, hidden, onCandidatesChange, onJobChange, onShowCandidates }: { selectedJobId: string; jdText: string; setJdText: (value: string) => void; candidateCount: number; hidden: boolean; onCandidatesChange: (candidates: Candidate[]) => void; onJobChange: (entry: JobPoolEntry) => void; onShowCandidates: () => void }) {
  const [title, setTitle] = useState("区域销售");
  const [job, setJob] = useState<JobDraft | null>(null);
  const [standard, setStandard] = useState<ScoreStandardDraft | null>(null);
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const total = standard?.dimensions.reduce((sum, dimension) => sum + Number(dimension.maxScore || 0), 0) ?? 0;
  const jobStatus = standard?.status === "confirmed" ? "已确认" : standard ? "待确认" : "未生成";
  const jobStatusClass = standard?.status === "confirmed" ? "confirmed" : standard ? "draft" : "new";

  React.useEffect(() => {
    if (!selectedJobId) {
      setJob(null);
      setStandard(null);
      setTitle("");
      setJdText("");
      setActiveStep(1);
      onCandidatesChange([]);
      return;
    }
    setBusy(true);
    fetch(`/api/jobs/${encodeURIComponent(selectedJobId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("读取岗位失败。");
        return response.json() as Promise<{ job: JobDraft; standard: ScoreStandardDraft } | null>;
      })
      .then(async (latest) => {
        if (!latest) return;
        setJob(latest.job);
        setTitle(latest.job.title);
        setJdText(latest.job.jdText);
        setStandard(latest.standard);
        setActiveStep(latest.standard.status === "confirmed" ? 3 : 2);
        const candidatesResponse = await fetch(`/api/jobs/candidates?jobId=${encodeURIComponent(latest.job.id)}`);
        if (candidatesResponse.ok) onCandidatesChange(await candidatesResponse.json() as Candidate[]);
      })
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setBusy(false));
  }, [selectedJobId]);

  async function generate() {
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ job: JobDraft; standard: ScoreStandardDraft }>("/api/jobs/generate-standard", { title, jdText });
      setJob(result.job);
      onJobChange({ job: result.job, standard: result.standard, candidateCount: 0 });
      setStandard(result.standard);
      setActiveStep(2);
      setNotice("评分标准草稿已生成并保存。请核对后手动确认。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!job || !standard) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ standard: ScoreStandardDraft }>("/api/jobs/save-standard-draft", { jobId: job.id, standard }, "PUT");
      setStandard(result.standard);
      setNotice("草稿已保存，尚未用于正式评分。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function confirmStandard() {
    if (!job || !standard) return;
    if (total !== 100) {
      setNotice(`维度权重合计为 ${total}，需要调整到 100 分后才能确认。`);
      return;
    }
    if (!window.confirm("确认此评分标准？确认后将保存为正式版本。")) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ job: JobDraft; standard: ScoreStandardDraft }>("/api/jobs/confirm-standard", { jobId: job.id, standard });
      setJob(result.job);
      onJobChange({ job: result.job, standard: result.standard, candidateCount });
      setStandard(result.standard);
      setActiveStep(3);
      setNotice("评分标准已确认并保存为正式版本。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "确认失败。");
    } finally {
      setBusy(false);
    }
  }

  async function createRevision() {
    if (!job || standard?.status !== "confirmed") return;
    setBusy(true);
    setNotice("");
    try {
      const result = await postJson<{ standard: ScoreStandardDraft }>("/api/jobs/create-standard-revision", { jobId: job.id });
      setStandard(result.standard);
      setActiveStep(2);
      setNotice(`已创建评分标准 v${result.standard.version} 草稿。当前评分仍使用已确认版本 v${standard.version}。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建修改版本失败。");
    } finally {
      setBusy(false);
    }
  }

  function updateStandard(update: (current: ScoreStandardDraft) => ScoreStandardDraft) {
    if (!standard) return;
    const updated = update(standard);
    setStandard(updated);
  }

  return (
    <section className="content" hidden={hidden}>
      <header className="topbar job-topbar">
        <div>
          <span className="label">岗位流程</span>
          <h2>{job?.title ?? (title.trim() || "新增岗位")}</h2>
          <p>{["填写 JD", "审核评分标准", "确认创建", "简历评分"][activeStep - 1]}</p>
        </div>
        {activeStep !== 1 && <>
          <div className="score-tile">
            <span>当前候选人</span>
            <strong>{candidateCount}</strong>
          </div>
          <StatusPill status={standard?.status === "confirmed" ? "confirmed" : standard ? "draft" : "new"} />
        </>}
      </header>

      <section className="workflow-strip">
        <WorkflowStep index="01" title="填写 JD" active={activeStep === 1} onClick={() => setActiveStep(1)} />
        <WorkflowStep index="02" title="审核评分标准" active={activeStep === 2} disabled={!standard} onClick={() => setActiveStep(2)} />
        <WorkflowStep index="03" title="确认创建" active={activeStep === 3} disabled={!standard} onClick={() => setActiveStep(3)} />
        <WorkflowStep index="04" title="简历评分" active={activeStep === 4} disabled={standard?.status !== "confirmed"} onClick={() => setActiveStep(4)} />
      </section>

      {activeStep === 1 && <section className="job-config-layout">
        <section className="panel job-basic-panel">
          <div className="panel-heading"><h3>岗位基本信息</h3></div>
          <div className="job-basic-fields">
            <label className="job-title-field">岗位名称<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(standard)} /></label>
            <div className="job-config-fact"><span>候选人数</span><strong>{candidateCount}</strong></div>
            <div className="job-config-fact"><span>岗位状态</span><span className={`status-pill ${jobStatusClass}`}>{jobStatus}</span></div>
          </div>
        </section>
        <section className="panel jd-panel job-description-panel">
          <div className="panel-heading"><h3>职位描述（JD）</h3></div>
          <div className="job-description-body">
            <p>填写岗位职责与任职要求，作为后续生成评分标准的依据。</p>
            <label className="visually-hidden" htmlFor="job-description">职位描述（JD）</label>
            <textarea id="job-description" value={jdText} onChange={(event) => setJdText(event.target.value)} disabled={Boolean(standard)} />
          </div>
        </section>
        <div className="job-config-actionbar">
          <div className="job-config-action-status">
            {notice && <p className="job-notice" role="status">{notice}</p>}
            {!notice && <span>{standard ? `评分标准 v${standard.version} · ${jobStatus}` : "填写岗位信息后生成评分标准"}</span>}
          </div>
          <div className="job-config-action-buttons">
            {!standard ? <button className="confirm-action" disabled={busy || !title.trim() || !jdText.trim()} onClick={generate}>{busy ? "正在生成…" : "生成评分标准"}</button> : <>
              <button disabled={busy} onClick={() => { setJob(null); setStandard(null); setTitle(""); setJdText(""); setNotice(""); setActiveStep(1); }}>新建岗位</button>
              <button className="confirm-action" onClick={() => setActiveStep(standard.status === "confirmed" ? 3 : 2)}>{standard.status === "confirmed" ? "查看岗位状态" : "继续审核评分标准"}</button>
            </>}
          </div>
        </div>
      </section>}

      {activeStep === 2 && standard && <>
        <div className="step-actions">
          <div><strong>评分标准 v{standard.version}</strong><span>{standard.status === "confirmed" ? "当前生效版本" : "HR 审核草稿"}</span></div>
          {standard.status === "confirmed" ? <button disabled={busy} onClick={createRevision}>修改并创建新版本</button> : <>
            <button disabled={busy} onClick={saveDraft}>保存草稿</button>
            <button className="confirm-action" onClick={() => setActiveStep(3)}>下一步：确认创建</button>
          </>}
        </div>
        {standard.status === "draft" && standard.version > 1 && <p className="job-notice">当前评分继续使用已确认版本 v{standard.version - 1}；新版本确认后切换。</p>}
        <p className={total === 100 ? "weight-total" : "weight-total invalid"}>维度权重合计：{total}/100</p>
        <ScoreStandardEditor standard={standard} updateStandard={updateStandard} />
      </>}

      {activeStep === 3 && standard && <section className="confirmation-view">
        <section className="panel">
          <div className="panel-heading"><span className="section-number">03</span><h3>岗位与评分标准确认</h3></div>
          <div className="confirmation-body">
            <dl className="job-summary"><div><dt>岗位</dt><dd>{job?.title}</dd></div><div><dt>评分标准版本</dt><dd>v{standard.version}</dd></div><div><dt>总分</dt><dd>{standard.totalScore} 分</dd></div><div><dt>状态</dt><dd>{standard.status === "confirmed" ? "已确认" : "待 HR 确认"}</dd></div></dl>
            <h4>评分维度</h4>
            <div className="confirmation-dimensions">{standard.dimensions.map((dimension) => <div key={dimension.key}><span>{dimension.name}</span><strong>{dimension.maxScore} 分</strong></div>)}</div>
            <StandardCompletenessChecklist standard={standard} total={total} />
            <p>确认后，该版本将用于此岗位后续的正式评分；以后修改会创建新版本。</p>
            {notice && <p className="job-notice" role="status">{notice}</p>}
            <div className="step-actions">
              <button onClick={() => setActiveStep(2)}>返回修改</button>
              {standard.status === "draft" ? <button className="confirm-action" disabled={busy || total !== 100} onClick={confirmStandard}>{busy ? "正在确认…" : "确认创建岗位"}</button> : <button className="confirm-action" onClick={() => setActiveStep(4)}>进入简历评分</button>}
            </div>
          </div>
        </section>
      </section>}

      {standard?.status === "confirmed" && job && <ResumeScoringPanel jobId={job.id} candidateCount={candidateCount} scoreReady scoreStandardVersion={standard.version} onCandidatesChange={onCandidatesChange} hidden={activeStep !== 4} />}

    </section>
  );
}

function StandardCompletenessChecklist({ standard, total }: { standard: ScoreStandardDraft; total: number }) {
  const missingGuidance = standard.dimensions.filter((item) => !item.name.trim() || !item.description.trim() || !item.highScoreGuidance.trim() || !item.lowScoreGuidance.trim());
  const hardGates = standard.hardRequirements.filter((item) => item.isHardGate);
  const incompleteHardRequirements = standard.hardRequirements.filter((item) => !item.label.trim() || !item.description?.trim());
  const ambiguousMissing = standard.hardRequirements.filter((item) => !item.reviewOnlyWhenMissing && !(item.isHardGate && item.missingMeansFail));
  const failOnUnmentioned = hardGates.filter((item) => item.missingMeansFail);
  const incompleteRules = [
    ...standard.bonusSignals.filter((item) => !item.label.trim() || !item.description.trim()).map((item) => item.label || "未命名优先项"),
    ...standard.riskSignals.filter((item) => !item.label.trim() || !item.description?.trim()).map((item) => item.label || "未命名风险提示"),
    ...standard.capRules.filter((item) => item.enabled && (!item.label.trim() || !item.condition.trim())).map((item) => item.label || "未命名封顶规则"),
  ];
  const checks: Array<{ label: string; detail: string; status: "pass" | "warning" | "info" }> = [
    {
      label: "评分权重合计 100 分",
      detail: total === 100 ? "评分维度权重合计为 100 分。" : `当前合计 ${total} 分，请返回评分标准页调整。`,
      status: total === 100 ? "pass" : "warning",
    },
    {
      label: "硬性条件已明确",
      detail: standard.hardRequirements.length === 0
        ? "未配置必备条件；请确认岗位是否确实没有硬性要求。"
        : incompleteHardRequirements.length
          ? `${standard.hardRequirements.length} 项必备条件中，${incompleteHardRequirements.length} 项缺少名称或明确描述；其中 ${hardGates.length} 项设为硬性淘汰。`
          : `${standard.hardRequirements.length} 项必备条件均有描述，其中 ${hardGates.length} 项设为硬性淘汰。`,
      status: standard.hardRequirements.length === 0 || incompleteHardRequirements.length > 0 ? "warning" : "pass",
    },
    {
      label: "评分项可依据简历判断",
      detail: missingGuidance.length ? `${missingGuidance.map((item) => item.name || "未命名维度").join("、")}缺少名称或评分说明/依据。` : "所有评分维度均包含范围说明、高分依据和低分依据。",
      status: missingGuidance.length ? "warning" : "pass",
    },
    {
      label: "评分规则描述完整",
      detail: incompleteRules.length ? `以下规则缺少名称或判断依据：${incompleteRules.join("、")}。` : "优先项、风险提示及启用中的封顶规则均有判断描述。",
      status: incompleteRules.length ? "warning" : "pass",
    },
    {
      label: "简历信息缺失的处理方式",
      detail: failOnUnmentioned.length
        ? `有 ${failOnUnmentioned.length} 项硬性条件设置为简历未提及时直接不通过（${failOnUnmentioned.map((item) => item.label).join("、")}）；请确认这是有意设置。`
        : ambiguousMissing.length
          ? `${ambiguousMissing.length} 项非硬性条件未设置“未体现时仅复核”；请确认缺少简历证据时的处理方式。`
          : "硬性条件未体现时按当前配置处理；普通条件未体现时会进入人工复核。",
      status: failOnUnmentioned.length || ambiguousMissing.length ? "warning" : "pass",
    },
    {
      label: "人工复核 / 面试分数阈值",
      detail: "当前版本只展示评分，不按分数自动划分复核或面试状态；由 HR 结合实际流程判断。",
      status: "info",
    },
  ];
  const warningCount = checks.filter((item) => item.status === "warning").length;

  return <section className="standard-checklist" aria-label="评分标准完整性检查">
    <header><div><h4>评分标准完整性检查</h4><p>{warningCount ? `${warningCount} 项需要 HR 留意，确认前建议核对。` : "未发现结构完整性问题，请结合岗位实际复核内容。"}</p></div><span>{checks.length} 项检查</span></header>
    <ul>{checks.map((item) => <li className={`standard-check ${item.status}`} key={item.label}>
      {item.status === "pass" ? <CheckCircle2 size={17} aria-hidden="true" /> : item.status === "warning" ? <AlertTriangle size={17} aria-hidden="true" /> : <ClipboardCheck size={17} aria-hidden="true" />}
      <div><strong>{item.label}</strong><span>{item.detail}</span></div>
      <em>{item.status === "pass" ? "已通过" : item.status === "warning" ? "需核对" : "提示"}</em>
    </li>)}</ul>
  </section>;
}

function ScoreStandardEditor({ standard, updateStandard }: { standard: ScoreStandardDraft; updateStandard: (update: (current: ScoreStandardDraft) => ScoreStandardDraft) => void }) {
  const disabled = standard.status === "confirmed";
  return (
    <section className="draft-editor" aria-label="评分标准草稿编辑器">
      <header className="editor-heading">
        <div><span className="label">HR 审核</span><h3>评分标准 v{standard.version}</h3><p>{standard.dimensions.length} 个维度 · {standard.hardRequirements.length} 项必备条件 · 权重 {standard.dimensions.reduce((sum, item) => sum + item.maxScore, 0)}/100</p></div>
        <div className="editor-heading-actions"><strong>{standard.status === "confirmed" ? "当前生效版本" : "待确认草稿"}</strong></div>
      </header>
      <div className="editor-sections">
        <DimensionEditorSection standard={standard} disabled={disabled} updateStandard={updateStandard} />
        <EditableSignalList
          title="必备条件"
          entries={standard.hardRequirements}
          disabled={disabled}
          summary={`${standard.hardRequirements.length} 项`}
          onAdd={() => updateStandard((current) => ({ ...current, hardRequirements: [...current.hardRequirements, { key: nextEntryKey("requirement", current.hardRequirements), label: "新必备条件", description: "", isHardGate: false, missingMeansFail: false, reviewOnlyWhenMissing: true }] }))}
          onRemove={(index) => updateStandard((current) => ({ ...current, hardRequirements: current.hardRequirements.filter((_, itemIndex) => itemIndex !== index) }))}
          update={(entries) => updateStandard((current) => ({ ...current, hardRequirements: entries as ScoreStandardDraft["hardRequirements"] }))}
        />
        <EditableSignalList
          title="优先项"
          entries={standard.bonusSignals}
          disabled={disabled}
          summary={`${standard.bonusSignals.length} 项`}
          onAdd={() => updateStandard((current) => ({ ...current, bonusSignals: [...current.bonusSignals, { key: nextEntryKey("bonus", current.bonusSignals), label: "新优先项", description: "请填写岗位相关的优先经验" }] }))}
          onRemove={(index) => updateStandard((current) => ({ ...current, bonusSignals: current.bonusSignals.filter((_, itemIndex) => itemIndex !== index) }))}
          update={(entries) => updateStandard((current) => ({ ...current, bonusSignals: entries as ScoreStandardDraft["bonusSignals"] }))}
        />
        <EditableSignalList
          title="风险提示"
          entries={standard.riskSignals}
          disabled={disabled}
          summary={`${standard.riskSignals.length} 项`}
          onAdd={() => updateStandard((current) => ({ ...current, riskSignals: [...current.riskSignals, { key: nextEntryKey("risk", current.riskSignals), label: "新风险提示", severity: "medium", affectsScore: false, description: "请填写风险判断依据" }] }))}
          onRemove={(index) => updateStandard((current) => ({ ...current, riskSignals: current.riskSignals.filter((_, itemIndex) => itemIndex !== index) }))}
          update={(entries) => updateStandard((current) => ({ ...current, riskSignals: entries as ScoreStandardDraft["riskSignals"] }))}
        />
        <EditableSignalList
          title="分数封顶规则"
          entries={standard.capRules}
          disabled={disabled}
          summary={`${standard.capRules.length} 项`}
          onAdd={() => updateStandard((current) => ({ ...current, capRules: [...current.capRules, { key: nextEntryKey("cap", current.capRules), label: "新封顶规则", maxFinalScore: 70, condition: "请填写触发条件", enabled: true }] }))}
          onRemove={(index) => updateStandard((current) => ({ ...current, capRules: current.capRules.filter((_, itemIndex) => itemIndex !== index) }))}
          update={(entries) => updateStandard((current) => ({ ...current, capRules: entries as ScoreStandardDraft["capRules"] }))}
        />
        <EditableSignalList
          title="不参与评分的信息"
          entries={standard.excludedSignals}
          disabled={disabled}
          summary={`${standard.excludedSignals.length} 项`}
          onAdd={() => updateStandard((current) => ({ ...current, excludedSignals: [...current.excludedSignals, { key: nextEntryKey("excluded", current.excludedSignals), label: "新排除项", reason: "请填写不纳入评分的原因" }] }))}
          onRemove={(index) => updateStandard((current) => ({ ...current, excludedSignals: current.excludedSignals.filter((_, itemIndex) => itemIndex !== index) }))}
          update={(entries) => updateStandard((current) => ({ ...current, excludedSignals: entries as ScoreStandardDraft["excludedSignals"] }))}
        />
      </div>
    </section>
  );
}

function DimensionEditorSection({ standard, disabled, updateStandard }: { standard: ScoreStandardDraft; disabled: boolean; updateStandard: (update: (current: ScoreStandardDraft) => ScoreStandardDraft) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [autoGuidanceKeys, setAutoGuidanceKeys] = useState<string[]>([]);
  const [generatingKeys, setGeneratingKeys] = useState<string[]>([]);
  const [guidanceSuggestions, setGuidanceSuggestions] = useState<Record<string, DimensionGuidance>>({});
  const [guidanceMessages, setGuidanceMessages] = useState<Record<string, string>>({});
  const nameInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  React.useEffect(() => {
    const pendingKey = autoGuidanceKeys[autoGuidanceKeys.length - 1];
    if (pendingKey) nameInputRefs.current[pendingKey]?.focus();
  }, [autoGuidanceKeys, standard.dimensions.length]);

  function addDimension() {
    const key = nextEntryKey("dimension", standard.dimensions);
    updateStandard((current) => ({
      ...current,
      dimensions: [...current.dimensions, {
        key,
        name: "",
        maxScore: 1,
        description: "",
        highScoreGuidance: "",
        lowScoreGuidance: "",
      }],
    }));
    setAutoGuidanceKeys((current) => [...current, key]);
    setGuidanceMessages((current) => ({ ...current, [key]: "填写维度名称后自动生成依据。" }));
    setExpanded(true);
  }

  async function generateGuidance(dimension: ScoreStandardDraft["dimensions"][number], applyImmediately: boolean) {
    if (!dimension.name.trim() || generatingKeys.includes(dimension.key)) return;
    setGeneratingKeys((current) => [...current, dimension.key]);
    setGuidanceMessages((current) => ({ ...current, [dimension.key]: "正在根据岗位要求生成依据…" }));
    try {
      const result = await postJson<{ guidance: DimensionGuidance }>("/api/jobs/generate-dimension-guidance", {
        jobId: standard.jobId,
        dimensionName: dimension.name,
      });
      if (applyImmediately) {
        updateStandard((current) => ({
          ...current,
          dimensions: current.dimensions.map((item) => item.key === dimension.key && item.name === dimension.name ? { ...item, ...result.guidance } : item),
        }));
        setGuidanceMessages((current) => ({ ...current, [dimension.key]: "依据已生成，可继续手动调整。" }));
        setAutoGuidanceKeys((current) => current.filter((key) => key !== dimension.key));
      } else {
        setGuidanceSuggestions((current) => ({ ...current, [dimension.key]: result.guidance }));
        setGuidanceMessages((current) => ({ ...current, [dimension.key]: "建议已生成，当前依据尚未更改。" }));
      }
    } catch (error) {
      setGuidanceMessages((current) => ({ ...current, [dimension.key]: error instanceof Error ? error.message : "生成评分依据失败。" }));
      if (applyImmediately) setAutoGuidanceKeys((current) => current.filter((key) => key !== dimension.key));
    } finally {
      setGeneratingKeys((current) => current.filter((key) => key !== dimension.key));
    }
  }

  function acceptGuidance(dimensionKey: string) {
    const guidance = guidanceSuggestions[dimensionKey];
    if (!guidance) return;
    updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item) => item.key === dimensionKey ? { ...item, ...guidance } : item) }));
    setGuidanceSuggestions((current) => { const next = { ...current }; delete next[dimensionKey]; return next; });
    setGuidanceMessages((current) => ({ ...current, [dimensionKey]: "已采用生成建议，可继续手动调整。" }));
  }

  function removeDimension(dimensionKey: string) {
    updateStandard((current) => ({ ...current, dimensions: current.dimensions.filter((item) => item.key !== dimensionKey) }));
    setAutoGuidanceKeys((current) => current.filter((key) => key !== dimensionKey));
    setGuidanceSuggestions((current) => { const next = { ...current }; delete next[dimensionKey]; return next; });
    setGuidanceMessages((current) => { const next = { ...current }; delete next[dimensionKey]; return next; });
  }

  return <section className="panel editor-section">
    <div className="signal-section-heading dimension-section-heading">
      <EditorSectionHeading title="评分维度" summary={`${standard.dimensions.length} 项 · ${standard.dimensions.reduce((sum, item) => sum + item.maxScore, 0)}/100 分`} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      <button className="add-entry" type="button" disabled={disabled} aria-label="增加评分维度" title="增加评分维度" onClick={addDimension}><Plus size={17} /></button>
    </div>
    <div hidden={!expanded}>
          {standard.dimensions.map((dimension, index) => <div className="dimension-editor" key={dimension.key}>
            <label>维度名称<input id={`dimension-name-${dimension.key}`} ref={(element) => { nameInputRefs.current[dimension.key] = element; }} placeholder={autoGuidanceKeys.includes(dimension.key) ? "输入维度名称" : undefined} value={dimension.name} disabled={disabled} onChange={(event) => updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item, i) => i === index ? { ...item, name: event.target.value } : item) }))} onBlur={(event) => { if (autoGuidanceKeys.includes(dimension.key)) void generateGuidance({ ...dimension, name: event.target.value }, true); }} />{autoGuidanceKeys.includes(dimension.key) && <small>输入名称后离开此栏，将自动生成三项评分依据。</small>}</label>
            <label>分值<input type="number" min="1" max="100" value={dimension.maxScore} disabled={disabled} onChange={(event) => updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item, i) => i === index ? { ...item, maxScore: Number(event.target.value) } : item) }))} /></label>
            <label className="wide-field">评分范围说明<input value={dimension.description} disabled={disabled} onChange={(event) => updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item, i) => i === index ? { ...item, description: event.target.value } : item) }))} /></label>
            <label className="wide-field">高分依据<input value={dimension.highScoreGuidance} disabled={disabled} onChange={(event) => updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item, i) => i === index ? { ...item, highScoreGuidance: event.target.value } : item) }))} /></label>
            <label className="wide-field">低分依据<input value={dimension.lowScoreGuidance} disabled={disabled} onChange={(event) => updateStandard((current) => ({ ...current, dimensions: current.dimensions.map((item, i) => i === index ? { ...item, lowScoreGuidance: event.target.value } : item) }))} /></label>
            <div className="dimension-guidance-actions wide-field">
              <span role="status">{guidanceMessages[dimension.key] ?? ""}</span>
              {!autoGuidanceKeys.includes(dimension.key) && <button type="button" disabled={disabled || generatingKeys.includes(dimension.key) || !dimension.name.trim()} onClick={() => void generateGuidance(dimension, false)}><RefreshCw size={14} />{generatingKeys.includes(dimension.key) ? "生成中…" : "重新生成依据"}</button>}
            </div>
            {guidanceSuggestions[dimension.key] && <div className="dimension-guidance-suggestion wide-field">
              <strong>生成建议（尚未替换当前依据）</strong>
              <p><b>评分范围：</b>{guidanceSuggestions[dimension.key]!.description}</p>
              <p><b>高分依据：</b>{guidanceSuggestions[dimension.key]!.highScoreGuidance}</p>
              <p><b>低分依据：</b>{guidanceSuggestions[dimension.key]!.lowScoreGuidance}</p>
              <div><button type="button" onClick={() => acceptGuidance(dimension.key)}>采用建议</button><button type="button" className="secondary-button" onClick={() => setGuidanceSuggestions((current) => { const next = { ...current }; delete next[dimension.key]; return next; })}>取消</button></div>
            </div>}
            <button className="remove-entry" type="button" disabled={disabled || standard.dimensions.length <= 1} aria-label={`删除评分维度：${dimension.name || "未命名"}`} title={`删除${dimension.name || "未命名维度"}`} onClick={() => removeDimension(dimension.key)}><Trash2 size={16} /></button>
          </div>)}
          <p className="dimension-total-note">增加或删除维度后，请重新分配各项分值，维度总分必须为 100 分。</p>
    </div>
  </section>;
}

function EditorSectionHeading({ title, summary, expanded, onToggle }: { title: string; summary: string; expanded: boolean; onToggle: () => void }) {
  return <div className="panel-heading editor-accordion-heading">
    <h3>{title}</h3>
    <span>{summary}</span>
    <button className="expand-standard" type="button" aria-expanded={expanded} onClick={onToggle} aria-label={`${expanded ? "收起" : "展开"}${title}`} title={`${expanded ? "收起" : "展开"}${title}`}>
      {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
    </button>
  </div>;
}

type EditableSignal = { key: string; label: string; description?: string; reason?: string; condition?: string; maxFinalScore?: number; severity?: "low" | "medium" | "high"; isHardGate?: boolean; missingMeansFail?: boolean; reviewOnlyWhenMissing?: boolean; affectsScore?: boolean; enabled?: boolean };

function nextEntryKey(prefix: string, entries: Array<{ key: string }>): string {
  let index = entries.length + 1;
  while (entries.some((entry) => entry.key === `${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function EditableSignalList({ title, entries, disabled, summary, onAdd, onRemove, update }: { title: string; entries: EditableSignal[]; disabled: boolean; summary: string; onAdd?: () => void; onRemove?: (index: number) => void; update: (entries: EditableSignal[]) => void }) {
  const [expanded, setExpanded] = useState(false);
  function patch(index: number, values: Partial<EditableSignal>) {
    update(entries.map((entry, currentIndex) => currentIndex === index ? { ...entry, ...values } : entry));
  }
  return <section className="panel editor-section">
    <div className="signal-section-heading">
      <EditorSectionHeading title={title} summary={summary} expanded={expanded} onToggle={() => setExpanded((value) => !value)} />
      {onAdd && <button className="add-entry" type="button" disabled={disabled} aria-label={`增加${title}`} title={`增加${title}`} onClick={onAdd}><Plus size={17} /></button>}
    </div>
    <div hidden={!expanded}>
      {entries.map((entry, index) => <div className="signal-editor" key={entry.key}>
        <label>名称<input value={entry.label} disabled={disabled} onChange={(event) => patch(index, { label: event.target.value })} /></label>
        {entry.maxFinalScore !== undefined && <label>最高分<input type="number" min="0" max="100" value={entry.maxFinalScore} disabled={disabled} onChange={(event) => patch(index, { maxFinalScore: Number(event.target.value) })} /></label>}
        {entry.severity !== undefined && <label>严重程度<select value={entry.severity} disabled={disabled} onChange={(event) => patch(index, { severity: event.target.value as EditableSignal["severity"] })}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>}
        <label className="wide-field">说明<input value={entry.description ?? entry.reason ?? entry.condition ?? ""} disabled={disabled} onChange={(event) => patch(index, entry.reason !== undefined ? { reason: event.target.value } : entry.condition !== undefined ? { condition: event.target.value } : { description: event.target.value })} /></label>
        {entry.isHardGate !== undefined && <label className="check-field"><input type="checkbox" checked={entry.isHardGate} disabled={disabled} onChange={(event) => patch(index, { isHardGate: event.target.checked })} />硬性淘汰</label>}
        {entry.reviewOnlyWhenMissing !== undefined && <label className="check-field"><input type="checkbox" checked={entry.reviewOnlyWhenMissing} disabled={disabled} onChange={(event) => patch(index, { reviewOnlyWhenMissing: event.target.checked })} />未体现时仅复核</label>}
        {entry.affectsScore !== undefined && <label className="check-field"><input type="checkbox" checked={entry.affectsScore} disabled={disabled} onChange={(event) => patch(index, { affectsScore: event.target.checked })} />影响分数</label>}
        {entry.enabled !== undefined && <label className="check-field"><input type="checkbox" checked={entry.enabled} disabled={disabled} onChange={(event) => patch(index, { enabled: event.target.checked })} />启用</label>}
        {onRemove && <button className="remove-entry" type="button" disabled={disabled} aria-label={`删除${title}：${entry.label}`} title={`删除${entry.label}`} onClick={() => onRemove(index)}><Trash2 size={16} /></button>}
      </div>)}
      {entries.length === 0 && <p className="panel-empty">暂无项目，可使用加号添加。</p>}
    </div>
  </section>;
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "请求失败。");
  return payload;
}

function processStatusLabel(status: ScoreProcess["status"]): string {
  return ({ queued: "排队中", processing: "处理中", paused: "已暂停", completed: "已完成", partial_failed: "部分失败", failed: "失败" })[status];
}

function fileStatusLabel(status: ScoreProcess["files"][number]["status"]): string {
  return ({ queued: "待处理", parsing: "解析中", scoring: "评分中", completed: "已完成", failed: "失败" })[status];
}

function candidateStageLabel(stage: Candidate["hrStage"]): string {
  if (stage === "interview") return "面试";
  if (stage === "pending") return "待定";
  if (stage === "rejected") return "淘汰";
  return "未处理";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return reject(new Error(`读取文件失败：${file.name}`));
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function ResumeScoringPanel({ jobId, candidateCount, scoreReady, scoreStandardVersion, onCandidatesChange, hidden }: { jobId: string; candidateCount: number; scoreReady: boolean; scoreStandardVersion?: number; onCandidatesChange: (items: Candidate[]) => void; hidden: boolean }) {
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [scoreProcesses, setScoreProcesses] = useState<ScoreProcess[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedRetryFileKeys, setSelectedRetryFileKeys] = useState<string[]>([]);
  const [retryingProcessId, setRetryingProcessId] = useState("");
  const [controllingProcessId, setControllingProcessId] = useState("");
  const onCandidatesChangeRef = useRef(onCandidatesChange);
  const hadActiveProcessRef = useRef(false);

  useEffect(() => { onCandidatesChangeRef.current = onCandidatesChange; }, [onCandidatesChange]);

  useEffect(() => {
    setResumeFiles([]);
    setScoreProcesses([]);
    setSelectedRetryFileKeys([]);
    setNotice("");
    hadActiveProcessRef.current = false;
    if (!jobId) return;
    fetch(`/api/jobs/score-processes?jobId=${encodeURIComponent(jobId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("读取评分进程失败。");
        setScoreProcesses(await response.json() as ScoreProcess[]);
      })
      .catch((error: Error) => setNotice(error.message));
  }, [jobId]);

  useEffect(() => {
    const hasActive = scoreProcesses.some((process) => process.status === "queued" || process.status === "processing");
    if (hasActive) hadActiveProcessRef.current = true;
    if (!jobId || !hasActive) {
      if (hadActiveProcessRef.current && jobId) {
        hadActiveProcessRef.current = false;
        fetch(`/api/jobs/candidates?jobId=${encodeURIComponent(jobId)}`)
          .then((response) => response.ok ? response.json() as Promise<Candidate[]> : null)
          .then((items) => { if (items) onCandidatesChangeRef.current(items); });
      }
      return;
    }
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/jobs/score-processes?jobId=${encodeURIComponent(jobId)}`);
      if (response.ok) setScoreProcesses(await response.json() as ScoreProcess[]);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [jobId, scoreProcesses]);

  async function scoreResumes() {
    if (!jobId || !scoreReady || resumeFiles.length === 0) return;
    setBusy(true);
    setNotice("");
    try {
      const files = await Promise.all(resumeFiles.map(async (file) => ({ name: file.name, data: await fileToBase64(file) })));
      const process = await postJson<ScoreProcess>("/api/jobs/start-scoring", { jobId, files });
      setScoreProcesses((current) => [process, ...current]);
      setNotice(`已创建评分进程，包含 ${process.files.length} 份简历。`);
      setResumeFiles([]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "简历评分失败。");
    } finally {
      setBusy(false);
    }
  }

  async function controlScoreProcess(process: ScoreProcess, action: "pause" | "resume") {
    setControllingProcessId(process.id);
    setNotice("");
    try {
      const updated = await postJson<ScoreProcess>("/api/jobs/control-score-process", { jobId, processId: process.id, action });
      setScoreProcesses((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "评分进程操作失败。");
    } finally {
      setControllingProcessId("");
    }
  }

  function toggleFailedFileSelection(process: ScoreProcess, fileId: string, selected: boolean) {
    const key = `${process.id}:${fileId}`;
    setSelectedRetryFileKeys((current) => selected ? [...new Set([...current, key])] : current.filter((item) => item !== key));
  }

  function toggleAllFailedFiles(process: ScoreProcess, selected: boolean) {
    const keys = process.files.filter((file) => file.status === "failed").map((file) => `${process.id}:${file.id}`);
    setSelectedRetryFileKeys((current) => selected ? [...new Set([...current, ...keys])] : current.filter((key) => !keys.includes(key)));
  }

  async function retrySelectedScoreFiles(process: ScoreProcess) {
    const fileIds = process.files.filter((file) => file.status === "failed" && selectedRetryFileKeys.includes(`${process.id}:${file.id}`)).map((file) => file.id);
    if (fileIds.length === 0) return;
    setRetryingProcessId(process.id);
    setNotice("");
    try {
      const updated = await postJson<ScoreProcess>("/api/jobs/retry-score-files", { jobId, processId: process.id, fileIds });
      setScoreProcesses((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedRetryFileKeys((current) => current.filter((key) => !fileIds.some((id) => key === `${process.id}:${id}`)));
      setNotice(`已重新提交 ${fileIds.length} 份失败简历。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重新解析失败。");
    } finally {
      setRetryingProcessId("");
    }
  }

  return <section className="panel resume-step-panel candidates-scoring-panel" hidden={hidden}>
    <div className="panel-heading"><h3>简历评分与处理</h3><span>{scoreReady ? `评分标准 v${scoreStandardVersion}` : "评分标准未确认"}</span></div>
    <div className="resume-step-body">
      <div className="resume-stat"><span>当前评分标准</span><strong>{scoreReady ? `v${scoreStandardVersion}` : "未确认"}</strong></div>
      <div className="resume-stat"><span>已评分候选人</span><strong>{candidateCount}</strong></div>
      {!scoreReady && <p className="job-notice">请先在岗位配置中确认评分标准，再上传简历并开始评分。</p>}
      <div className="resume-workbench">
        <div className="resume-upload-pane">
          <h4>上传与待评分</h4>
          <p>支持 PDF、DOCX、TXT，单份不超过 20 MB。</p>
          <label className={`resume-upload-control${!scoreReady ? " disabled" : ""}`}>
            <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple disabled={busy || !scoreReady} onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              const invalid = selected.find((file) => file.size > 20 * 1024 * 1024);
              if (invalid) setNotice(`${invalid.name} 超过 20 MB，未加入。`);
              else { setResumeFiles((current) => [...current, ...selected.filter((file) => !current.some((item) => item.name === file.name && item.size === file.size))]); setNotice(""); }
              event.target.value = "";
            }} />
            <Upload size={17} /><span>上传简历</span>
          </label>
          <div className="selected-resumes"><strong>待评分：{resumeFiles.length} 份</strong>
            {resumeFiles.length > 0 ? <ul>{resumeFiles.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><button type="button" title={`移除${file.name}`} aria-label={`移除${file.name}`} onClick={() => setResumeFiles((current) => current.filter((item) => item !== file))}><Trash2 size={14} /></button></li>)}</ul> : <p className="empty-queue">上传的简历会显示在这里。</p>}
          </div>
          <div className="resume-step-actions"><button className="confirm-action" disabled={busy || !scoreReady || resumeFiles.length === 0} onClick={() => void scoreResumes()}>{busy ? "正在提交…" : "开始评分"}</button></div>
        </div>
        <div className="score-process-pane">
          <header><h4>评分进程</h4><span>{scoreProcesses.length} 个批次</span></header>
          {scoreProcesses.length > 0 ? <div className="score-process-list">{scoreProcesses.map((process) => <article className="score-process" key={process.id}>
            <div className="score-process-heading"><strong>{process.files.length} 份简历 · 标准 v{process.scoreStandardVersion}</strong><span className={`process-status ${process.status}`}>{process.pauseRequested ? "正在暂停" : processStatusLabel(process.status)}</span></div>
            <time>{new Date(process.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
            {!["queued", "processing", "paused"].includes(process.status) && process.files.some((file) => file.status === "failed") && <div className="process-retry-toolbar">
              <label><input type="checkbox" checked={process.files.filter((file) => file.status === "failed").every((file) => selectedRetryFileKeys.includes(`${process.id}:${file.id}`))} onChange={(event) => toggleAllFailedFiles(process, event.target.checked)} />全选失败项（{process.files.filter((file) => file.status === "failed").length}）</label>
              <button type="button" className="process-retry-button" disabled={retryingProcessId === process.id || !process.files.some((file) => file.status === "failed" && selectedRetryFileKeys.includes(`${process.id}:${file.id}`))} title="仅重新解析所选失败简历，成功后继续评分" onClick={() => void retrySelectedScoreFiles(process)}><RotateCcw size={13} />{retryingProcessId === process.id ? "提交中" : `重新解析所选（${process.files.filter((file) => file.status === "failed" && selectedRetryFileKeys.includes(`${process.id}:${file.id}`)).length}）`}</button>
            </div>}
            {(["queued", "processing", "paused"] as const).includes(process.status as "queued" | "processing" | "paused") && <button type="button" className="process-control-button" disabled={controllingProcessId === process.id || process.pauseRequested} title={process.status === "paused" ? "继续评分" : "当前简历处理结束后暂停"} onClick={() => void controlScoreProcess(process, process.status === "paused" ? "resume" : "pause")}>{process.status === "paused" ? <><Play size={14} />继续</> : <><Pause size={14} />{process.pauseRequested ? "正在暂停" : "暂停"}</>}</button>}
            <ul>{process.files.map((file) => <li key={file.id}><span className="process-file-select-slot">{file.status === "failed" && !["queued", "processing", "paused"].includes(process.status) && <input type="checkbox" aria-label={`选择重新解析：${file.fileName}`} checked={selectedRetryFileKeys.includes(`${process.id}:${file.id}`)} onChange={(event) => toggleFailedFileSelection(process, file.id, event.target.checked)} />}</span><span className="process-file-name" title={file.fileName}>{file.fileName}</span><span className="process-file-meta"><span className={`process-file-status ${file.status}`}>{fileStatusLabel(file.status)}</span>{file.score !== undefined && <strong>{file.score} 分</strong>}{file.archiveStatus === "saved" && <span className="archive-file-status" title={file.archivePath}>已归档</span>}{file.archiveStatus === "failed" && <span className="archive-file-error" title={file.archiveError}>归档失败</span>}{file.error && <span className="process-file-error" title={file.error}>{file.error}</span>}</span></li>)}</ul>
          </article>)}</div> : <p className="empty-process">{candidateCount > 0 ? `当前已有 ${candidateCount} 位已评分候选人；这些结果产生于进程记录启用前，无法还原逐份处理状态。新提交的简历会在这里显示实时进度。` : "提交简历后，这里会显示逐份处理状态。"}</p>}
        </div>
      </div>
      {notice && <p className="job-notice" role="status">{notice}</p>}
    </div>
  </section>;
}

function CandidateWorkspace({ jobId, title, candidates, allCandidates, query, expandedId, setExpandedId, onCandidatesChange, onOpenInterviewDrafts, hidden }: { jobId: string; title: string; candidates: Candidate[]; allCandidates: Candidate[]; query: string; expandedId: string; setExpandedId: (value: string) => void; onCandidatesChange: (items: Candidate[]) => void; onOpenInterviewDrafts: () => void; hidden: boolean }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updatingCandidateIds, setUpdatingCandidateIds] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [stageNotice, setStageNotice] = useState("");
  const scoredCount = candidates.filter((candidate) => candidate.totalScore !== undefined).length;
  const reviewCount = candidates.filter(needsHumanReview).length;
  const visibleIds = candidates.map((candidate) => candidate.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedCandidates = allCandidates.filter((candidate) => selectedIds.includes(candidate.id));

  React.useEffect(() => setSelectedIds([]), [jobId]);

  async function setCandidateStage(candidate: Candidate, stage: Candidate["hrStage"]) {
    if (batchBusy || updatingCandidateIds.includes(candidate.id)) return;
    setUpdatingCandidateIds((current) => [...current, candidate.id]);
    setStageNotice("");
    try {
      await postJson<{ candidateId: string; stage: Candidate["hrStage"] | null }>("/api/jobs/candidate-stage", {
        jobId,
        candidateId: candidate.id,
        stage: stage ?? null,
      }, "PUT");
      onCandidatesChange(allCandidates.map((item) => item.id === candidate.id ? { ...item, hrStage: stage } : item));
      setStageNotice(`${candidate.name}的 HR 流程状态已更新。`);
      if (stage === "interview") onOpenInterviewDrafts();
    } catch (error) {
      setStageNotice(error instanceof Error ? error.message : "更新候选人状态失败。");
    } finally {
      setUpdatingCandidateIds((current) => current.filter((id) => id !== candidate.id));
    }
  }

  async function setSelectedCandidatesStage(stage: NonNullable<Candidate["hrStage"]>) {
    if (batchBusy || selectedCandidates.length === 0) return;
    setBatchBusy(true);
    setStageNotice("");
    const results = await Promise.allSettled(selectedCandidates.map((candidate) => postJson(
      "/api/jobs/candidate-stage",
      { jobId, candidateId: candidate.id, stage },
      "PUT",
    )));
    const succeededIds = new Set(selectedCandidates.filter((_, index) => results[index]?.status === "fulfilled").map((candidate) => candidate.id));
    onCandidatesChange(allCandidates.map((candidate) => succeededIds.has(candidate.id) ? { ...candidate, hrStage: stage } : candidate));
    const failedCount = results.length - succeededIds.size;
    setStageNotice(failedCount ? `已更新 ${succeededIds.size} 位，${failedCount} 位更新失败，请重试。` : `已将所选 ${succeededIds.size} 位候选人设为${candidateStageLabel(stage)}。`);
    setBatchBusy(false);
    if (stage === "interview" && succeededIds.size > 0) onOpenInterviewDrafts();
  }

  function toggleVisibleSelection(checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id)));
  }

  return (
    <section className="content" hidden={hidden}>
      <header className="topbar candidate-topbar">
        <div>
          <span className="label">{title}</span>
          <h2>候选人评分</h2>
          <p>共 {candidates.length} 位候选人 · 可批量更新 HR 流程状态</p>
        </div>
        <div className="score-tile">
          <span>已评分</span>
          <strong>{scoredCount}</strong>
        </div>
        <span className="status-pill needs_review">{reviewCount} 位待复核</span>
      </header>

      <div className="candidate-bulkbar">
        <label className="select-visible"><input type="checkbox" checked={allVisibleSelected} ref={(element) => { if (element) element.indeterminate = partiallySelected; }} onChange={(event) => toggleVisibleSelection(event.target.checked)} />选择当前结果</label>
        <span>已选择 {selectedIds.length} 位</span>
        <div>
          <button type="button" className="candidate-stage-button interview" disabled={selectedCandidates.length === 0 || batchBusy || updatingCandidateIds.length > 0} onClick={() => void setSelectedCandidatesStage("interview")}>面试</button>
          <button type="button" className="candidate-stage-button pending" disabled={selectedCandidates.length === 0 || batchBusy || updatingCandidateIds.length > 0} onClick={() => void setSelectedCandidatesStage("pending")}>待定</button>
          <button type="button" className="candidate-stage-button rejected" disabled={selectedCandidates.length === 0 || batchBusy || updatingCandidateIds.length > 0} onClick={() => void setSelectedCandidatesStage("rejected")}>淘汰</button>
        </div>
      </div>
      {stageNotice && <p className="settings-notice" role="status">{stageNotice}</p>}

      <div className="candidate-table-wrap">
        <table className="candidate-table">
          <thead><tr>
            <th aria-label="选择" />
            <th>#</th>
            <th>候选人 / 评分理由</th>
            <th>评分</th>
            <th>AI 复核</th>
            <th>HR 流程</th>
            <th>详情</th>
          </tr></thead>
          <tbody>
            {candidates.map((candidate, index) => <CandidateSummary
              candidate={candidate}
              index={index}
              key={candidate.id}
              selected={selectedIds.includes(candidate.id)}
              onSelect={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, candidate.id])] : current.filter((id) => id !== candidate.id))}
              stageBusy={batchBusy || updatingCandidateIds.includes(candidate.id)}
              onSetStage={(stage) => void setCandidateStage(candidate, candidate.hrStage === stage ? undefined : stage)}
              expanded={candidate.id === expandedId}
              onToggle={() => setExpandedId(candidate.id === expandedId ? "" : candidate.id)}
            />)}
            {candidates.length === 0 && <tr><td colSpan={7} className="candidate-empty">{query ? "没有符合搜索条件的候选人。" : "当前岗位还没有候选人评分结果。"}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CandidateSummary({ candidate, index, selected, onSelect, stageBusy, onSetStage, expanded, onToggle }: { candidate: Candidate; index: number; selected: boolean; onSelect: (checked: boolean) => void; stageBusy: boolean; onSetStage: (stage: NonNullable<Candidate["hrStage"]>) => void; expanded: boolean; onToggle: () => void }) {
  const needsReview = needsHumanReview(candidate);
  return (
    <>
      <tr className={selected ? "candidate-row selected" : "candidate-row"}>
        <td><input type="checkbox" aria-label={`选择${candidate.name}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} /></td>
        <td className="candidate-rank">{String(index + 1).padStart(2, "0")}</td>
        <td className="candidate-identity"><div className="candidate-identity-layout"><CandidateAvatar name={candidate.name} photoUrl={candidate.photoUrl} /><div className="candidate-identity-copy"><strong>{candidate.name}</strong><span title={candidate.scoreReason ?? "暂无评分理由"}>{candidate.scoreReason ?? "暂无评分理由"}</span><small>{candidate.documentName}</small></div></div></td>
        <td className="candidate-score">{candidate.totalScore ?? "未评分"}<small>{candidate.totalScore !== undefined ? "/ 100" : ""}</small></td>
        <td><span className={`candidate-review-status ${needsReview ? "pending" : "done"}`}>{needsReview ? "待复核" : "已评分"}</span></td>
        <td><div className="candidate-stage-actions" aria-label={`${candidate.name} HR 流程状态`}>
          {([ ["interview", "面试"], ["pending", "待定"], ["rejected", "淘汰"] ] as const).map(([stage, label]) => <button type="button" key={stage} className={`candidate-stage-button ${stage}${candidate.hrStage === stage ? " active" : ""}`} aria-pressed={candidate.hrStage === stage} title={candidate.hrStage === stage ? `当前状态：${label}，再次点击可清除` : `设为${label}`} disabled={stageBusy} onClick={() => onSetStage(stage)}>{label}</button>)}
        </div></td>
        <td><button type="button" className="candidate-detail-toggle" aria-label={`${expanded ? "收起" : "查看"}${candidate.name}详情`} title={`${expanded ? "收起" : "查看详情"}`} onClick={onToggle}>{expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}</button></td>
      </tr>
      {expanded && <tr className="candidate-detail-row"><td colSpan={7}><CandidateDetails candidate={candidate} /></td></tr>}
    </>
  );
}

function CandidateAvatar({ name, photoUrl }: { name: string; photoUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  useEffect(() => {
    if (!zoomed) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomed(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [zoomed]);

  return (
    <>
      {photoUrl && !failed
        ? <button type="button" className="candidate-avatar-button" aria-label={`放大查看${name}的简历照片`} onClick={() => setZoomed(true)}><img className="candidate-avatar" src={photoUrl} alt="" onError={() => setFailed(true)} /></button>
        : <span className="candidate-avatar-fallback" aria-hidden="true"><UserRound size={19} /></span>}
      {zoomed && photoUrl && !failed && <div className="candidate-photo-lightbox" role="presentation" onClick={() => setZoomed(false)}>
        <div className="candidate-photo-dialog" role="dialog" aria-modal="true" aria-label={`${name}的简历照片`} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="candidate-photo-close" aria-label="关闭照片" onClick={() => setZoomed(false)}>×</button>
          <img src={photoUrl} alt={`${name}的简历照片`} />
          <span>{name}</span>
        </div>
      </div>}
    </>
  );
}

function CandidateDetails({ candidate }: { candidate: Candidate }) {
  const strengths = buildStrengths(candidate);
  const risks = buildRisks(candidate);

  return (
    <div className="candidate-detail">
      <div className="detail-column">
        <h4>主要优势</h4>
        {strengths.map((strength) => (
          <span className="signal-line positive" key={strength}>{strength}</span>
        ))}
      </div>
      <div className="detail-column">
        <h4>关键风险</h4>
        {risks.map((risk) => (
          <span className="signal-line risk" key={risk}>{risk}</span>
        ))}
      </div>
      <div className="detail-column">
        <h4>维度分</h4>
        <div className="mini-dimensions">
          {candidate.dimensions.map((dimension) => (
            <span key={dimension.name}>{dimension.name} {dimension.score}/{dimension.weightedScore}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildStrengths(candidate: Candidate): string[] {
  const sourceText = [
    candidate.scoreReason,
    candidate.profile.workExperience.join("；"),
    candidate.profile.education.join("；"),
  ].join("；");
  const strengths: string[] = [];

  if (/销售|业务拓展|客户开发|客户维护|获客|成交|订单|销售额/.test(sourceText)) {
    strengths.push("有直接销售或客户拓展经历，能支撑区域销售的客户开发与维护工作。");
  }
  if (/招商|品牌|商务谈判|BD|渠道|经销商|客户资源/.test(sourceText)) {
    strengths.push("招商、渠道或商务谈判经验可迁移，适合进一步确认客户资源和拓展方式。");
  }
  if (/业绩|销售额|招商率|入驻率|续费|转化|签约|落地|达成/.test(sourceText)) {
    strengths.push("简历中有结果或项目落地证据，比单纯自我评价更有参考价值。");
  }
  if (/珠海|广东|本地/.test(sourceText)) {
    strengths.push("区域或本地经验较贴近岗位，沟通成本和到岗匹配度可重点确认。");
  }
  if (/本科|专科|大专|硕士/.test(sourceText)) {
    strengths.push("学历信息对 JD 基础门槛有支撑，可减少硬性条件不确定性。");
  }

  if (candidate.scoreReason) {
    strengths.push(candidate.scoreReason);
  }

  return dedupe(strengths).slice(0, 3);
}

function buildRisks(candidate: Candidate): string[] {
  const risks = [
    candidate.scoreMissing,
    ...(candidate.hardGaps ?? []),
    ...(candidate.scoreCaps ?? []).map((cap) => `触发封顶：${cap}`),
  ].filter(Boolean) as string[];

  return risks.length > 0 ? risks.slice(0, 4) : ["暂无明确风险"];
}

function dedupe(values: string[]): string[] {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function WorkflowStep({ index, title, active = false, disabled = false, onClick }: { index: string; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={active ? "workflow-step active" : "workflow-step"} type="button" aria-current={active ? "step" : undefined} disabled={disabled} onClick={onClick}>
      <span>{index}</span>
      <strong>{title}</strong>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{status}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <main className="empty">
      <h1>{title}</h1>
      <p>{text}</p>
    </main>
  );
}

function needsHumanReview(candidate: Candidate): boolean {
  return (candidate.scoreCaps ?? []).length > 0 ||
    (candidate.hardGaps ?? []).length > 0 ||
    candidate.reviewTasks.some((task) => task.status === "open") ||
    candidate.requirementEvaluations.some((item) => item.status === "needs_review");
}

createRoot(document.getElementById("root")!).render(<App />);
