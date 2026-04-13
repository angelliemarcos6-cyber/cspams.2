import { useState, useCallback } from "react";
import { Plus, AlertTriangle, Clock, CheckCircle, Eye, MessageSquare, Paperclip, ChevronDown, Filter, X } from "lucide-react";
import { useLearnerCaseData } from "@/context/LearnerCaseData";
import { useAuth } from "@/context/Auth";
import type { LearnerCase, CaseSeverity, CaseStatus, CaseIssueType, LearnerCasePayload } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_LABELS: Record<CaseSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const SEVERITY_COLORS: Record<CaseSeverity, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const STATUS_COLORS: Record<CaseStatus, string> = {
  open: "bg-orange-100 text-orange-800",
  monitoring: "bg-blue-100 text-blue-800",
  resolved: "bg-gray-100 text-gray-600",
};

const ISSUE_TYPE_LABELS: Record<CaseIssueType, string> = {
  financial: "Financial",
  abuse: "Abuse",
  health: "Health",
  attendance: "Attendance",
  academic: "Academic",
  other: "Other",
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// New Case Form
// ---------------------------------------------------------------------------

interface NewCaseFormProps {
  onSubmit: (payload: LearnerCasePayload) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

function NewCaseForm({ onSubmit, onCancel, submitting }: NewCaseFormProps) {
  const [form, setForm] = useState<LearnerCasePayload>({
    lrn: "",
    learnerName: "",
    gradeLevel: "",
    section: "",
    issueType: "other",
    severity: "low",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.gradeLevel.trim()) errs.gradeLevel = "Grade level is required.";
    if (!form.section.trim()) errs.section = "Section is required.";
    if (!form.description.trim()) errs.description = "Description is required.";
    if (form.description.length > 2000) errs.description = "Description must be 2000 characters or less.";
    if (form.lrn && form.lrn.length > 12) errs.lrn = "LRN must be 12 characters or less.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">LRN (optional)</label>
          <input
            type="text"
            maxLength={12}
            value={form.lrn ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, lrn: e.target.value }))}
            placeholder="e.g. 100234567890"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.lrn && <p className="text-red-500 text-xs mt-1">{errors.lrn}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Learner Name (optional)</label>
          <input
            type="text"
            value={form.learnerName ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, learnerName: e.target.value }))}
            placeholder="e.g. Juan Dela Cruz"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.gradeLevel}
            onChange={(e) => setForm((f) => ({ ...f, gradeLevel: e.target.value }))}
            placeholder="e.g. Grade 5"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.gradeLevel && <p className="text-red-500 text-xs mt-1">{errors.gradeLevel}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Section <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
            placeholder="e.g. Masigasig"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.section && <p className="text-red-500 text-xs mt-1">{errors.section}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type <span className="text-red-500">*</span></label>
          <select
            value={form.issueType}
            onChange={(e) => setForm((f) => ({ ...f, issueType: e.target.value as CaseIssueType }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {(Object.keys(ISSUE_TYPE_LABELS) as CaseIssueType[]).map((type) => (
              <option key={type} value={type}>{ISSUE_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Severity <span className="text-red-500">*</span></label>
          <select
            value={form.severity}
            onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as CaseSeverity }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Case Notes <span className="text-red-500">*</span>
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={4}
          maxLength={2000}
          placeholder="Describe the concern, background, and any interventions already attempted..."
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex justify-between mt-1">
          {errors.description
            ? <p className="text-red-500 text-xs">{errors.description}</p>
            : <span />}
          <span className="text-xs text-gray-400">{form.description.length}/2000</span>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Create Case"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Case Detail Drawer
// ---------------------------------------------------------------------------

interface CaseDetailDrawerProps {
  learnerCase: LearnerCase;
  onClose: () => void;
  onResolve: (id: string) => Promise<void>;
  isSchoolHead: boolean;
  resolving: boolean;
}

function CaseDetailDrawer({ learnerCase, onClose, onResolve, isSchoolHead, resolving }: CaseDetailDrawerProps) {
  const [newMessage, setNewMessage] = useState("");
  const { addThread } = useLearnerCaseData();
  const [threads, setThreads] = useState(learnerCase.threads ?? []);
  const [posting, setPosting] = useState(false);

  async function handlePostThread() {
    if (!newMessage.trim()) return;
    setPosting(true);
    try {
      const thread = await addThread(learnerCase.id, newMessage.trim());
      setThreads((prev) => [...prev, thread]);
      setNewMessage("");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Case Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
          {/* Header badges */}
          <div className="flex flex-wrap gap-2">
            <Badge label={SEVERITY_LABELS[learnerCase.severity]} colorClass={SEVERITY_COLORS[learnerCase.severity]} />
            <Badge label={STATUS_LABELS[learnerCase.status]} colorClass={STATUS_COLORS[learnerCase.status]} />
            <Badge label={ISSUE_TYPE_LABELS[learnerCase.issueType]} colorClass="bg-purple-100 text-purple-800" />
            {learnerCase.isOverdue && (
              <Badge label="Overdue" colorClass="bg-red-100 text-red-700" />
            )}
          </div>

          {/* Learner info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            {learnerCase.learnerName && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Learner</span>
                <p className="text-sm text-gray-900 mt-0.5">{learnerCase.learnerName}</p>
              </div>
            )}
            {learnerCase.lrn && (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">LRN</span>
                <p className="text-sm text-gray-900 mt-0.5 font-mono">{learnerCase.lrn}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Grade</span>
                <p className="text-sm text-gray-900 mt-0.5">{learnerCase.gradeLevel}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Section</span>
                <p className="text-sm text-gray-900 mt-0.5">{learnerCase.section}</p>
              </div>
            </div>
          </div>

          {/* Case notes */}
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Case Notes</span>
            <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{learnerCase.description}</p>
          </div>

          {/* Timeline */}
          <div className="text-xs text-gray-500 space-y-0.5">
            <p>Flagged: {learnerCase.flaggedAt ? new Date(learnerCase.flaggedAt).toLocaleDateString() : "—"}</p>
            {learnerCase.acknowledgedAt && (
              <p>Acknowledged: {new Date(learnerCase.acknowledgedAt).toLocaleDateString()}</p>
            )}
            {learnerCase.resolvedAt && (
              <p>Resolved: {new Date(learnerCase.resolvedAt).toLocaleDateString()}</p>
            )}
            {learnerCase.status !== "resolved" && (
              <p>Days open: {learnerCase.daysOpen}</p>
            )}
          </div>

          {/* Attachments */}
          {(learnerCase.attachments?.length ?? 0) > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Attachments
              </span>
              <ul className="mt-1 space-y-1">
                {learnerCase.attachments!.map((a) => (
                  <li key={a.id} className="text-sm text-blue-600 hover:underline cursor-pointer">
                    {a.originalFilename}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Discussion thread */}
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Discussion
            </span>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {threads.length === 0 && (
                <p className="text-sm text-gray-400 italic">No messages yet.</p>
              )}
              {threads.map((t) => (
                <div key={t.id} className="bg-gray-50 rounded-md p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-700">{t.userName ?? "Unknown"}</span>
                    <span className="text-xs text-gray-400">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{t.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handlePostThread(); }}
                placeholder="Add a note..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handlePostThread}
                disabled={posting || !newMessage.trim()}
                className="px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        {isSchoolHead && learnerCase.status !== "resolved" && (
          <div className="px-6 py-4 border-t">
            <button
              onClick={() => onResolve(learnerCase.id)}
              disabled={resolving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {resolving ? "Resolving..." : "Mark as Resolved"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function LearnerCasesPanel() {
  const { user } = useAuth();
  const { cases, loading, error, filters, setFilters, createCase, resolveCase, refresh } = useLearnerCaseData();
  const [showNewForm, setShowNewForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCase, setSelectedCase] = useState<LearnerCase | null>(null);
  const [resolving, setResolving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isSchoolHead = user?.role === "school_head";

  const handleCreate = useCallback(async (payload: LearnerCasePayload) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await createCase(payload);
      setShowNewForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create case.");
    } finally {
      setSubmitting(false);
    }
  }, [createCase]);

  const handleResolve = useCallback(async (id: string) => {
    setResolving(true);
    try {
      await resolveCase(id);
      setSelectedCase((prev) => prev ? { ...prev, status: "resolved" } : prev);
    } finally {
      setResolving(false);
    }
  }, [resolveCase]);

  // KPIs
  const totalOpen = cases.filter((c) => c.status === "open").length;
  const highSeverity = cases.filter((c) => c.severity === "high" && c.status !== "resolved").length;
  const overdue = cases.filter((c) => c.isOverdue).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Learner Cases</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track and manage at-risk learner interventions</p>
        </div>
        {isSchoolHead && (
          <button
            onClick={() => { setShowNewForm(true); setFormError(null); }}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Case
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
          <p className="text-xs text-orange-700 font-medium">Open Cases</p>
          <p className="text-2xl font-bold text-orange-800 mt-0.5">{totalOpen}</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-xs text-red-700 font-medium">High Severity</p>
          <p className="text-2xl font-bold text-red-800 mt-0.5">{highSeverity}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
          <p className="text-xs text-amber-700 font-medium">Overdue (&gt;30d)</p>
          <p className="text-2xl font-bold text-amber-800 mt-0.5">{overdue}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status ?? ""}
          onChange={(e) => setFilters({ ...filters, status: (e.target.value as CaseStatus) || null })}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="monitoring">Monitoring</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={filters.severity ?? ""}
          onChange={(e) => setFilters({ ...filters, severity: (e.target.value as CaseSeverity) || null })}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filters.issueType ?? ""}
          onChange={(e) => setFilters({ ...filters, issueType: e.target.value || null })}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Issue Types</option>
          {(Object.keys(ISSUE_TYPE_LABELS) as CaseIssueType[]).map((t) => (
            <option key={t} value={t}>{ISSUE_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search learner..."
          value={filters.search ?? ""}
          onChange={(e) => setFilters({ ...filters, search: e.target.value || null })}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {(filters.status || filters.severity || filters.issueType || filters.search) && (
          <button
            onClick={() => setFilters({})}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* New case form modal */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Create New Learner Case</h3>
            {formError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{formError}</div>
            )}
            <NewCaseForm
              onSubmit={handleCreate}
              onCancel={() => setShowNewForm(false)}
              submitting={submitting}
            />
          </div>
        </div>
      )}

      {/* Case list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading cases...</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : cases.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {Object.values(filters).some(Boolean) ? "No cases match the current filters." : "No learner cases recorded yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Learner</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Grade / Section</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Issue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Days Open</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    {c.learnerName ? (
                      <div>
                        <p className="font-medium text-gray-900">{c.learnerName}</p>
                        {c.lrn && <p className="text-xs text-gray-400 font-mono">{c.lrn}</p>}
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Not specified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.gradeLevel} — {c.section}</td>
                  <td className="px-4 py-3">
                    <Badge label={ISSUE_TYPE_LABELS[c.issueType]} colorClass="bg-purple-100 text-purple-800" />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={SEVERITY_LABELS[c.severity]} colorClass={SEVERITY_COLORS[c.severity]} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Badge label={STATUS_LABELS[c.status]} colorClass={STATUS_COLORS[c.status]} />
                      {c.isOverdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.status === "resolved" ? "—" : c.daysOpen}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedCase(c)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Case detail drawer */}
      {selectedCase && (
        <CaseDetailDrawer
          learnerCase={selectedCase}
          onClose={() => setSelectedCase(null)}
          onResolve={handleResolve}
          isSchoolHead={isSchoolHead}
          resolving={resolving}
        />
      )}
    </div>
  );
}
