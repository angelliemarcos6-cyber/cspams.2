import { useState, useCallback } from "react";
import { AlertTriangle, Eye, CheckCircle, X, Clock } from "lucide-react";
import { useLearnerCaseData } from "@/context/LearnerCaseData";
import type { LearnerCase, CaseSeverity, CaseStatus, CaseIssueType } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_LABELS: Record<CaseSeverity, string> = { low: "Low", medium: "Medium", high: "High" };
const SEVERITY_COLORS: Record<CaseSeverity, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};
const STATUS_LABELS: Record<CaseStatus, string> = { open: "Open", monitoring: "Monitoring", resolved: "Resolved" };
const STATUS_COLORS: Record<CaseStatus, string> = {
  open: "bg-orange-100 text-orange-800",
  monitoring: "bg-blue-100 text-blue-800",
  resolved: "bg-gray-100 text-gray-600",
};
const ISSUE_LABELS: Record<CaseIssueType, string> = {
  financial: "Financial", abuse: "Abuse", health: "Health",
  attendance: "Attendance", academic: "Academic", other: "Other",
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Case Detail Drawer (Monitor — read-only + acknowledge)
// ---------------------------------------------------------------------------

interface MonitorCaseDrawerProps {
  learnerCase: LearnerCase;
  onClose: () => void;
  onAcknowledge: (id: string) => Promise<void>;
  acknowledging: boolean;
}

function MonitorCaseDrawer({ learnerCase, onClose, onAcknowledge, acknowledging }: MonitorCaseDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Case Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto">
          {/* School */}
          <div className="bg-blue-50 rounded-lg px-4 py-2 text-sm text-blue-800">
            {learnerCase.school?.name ?? "Unknown School"} · {learnerCase.school?.schoolCode}
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge label={SEVERITY_LABELS[learnerCase.severity]} colorClass={SEVERITY_COLORS[learnerCase.severity]} />
            <Badge label={STATUS_LABELS[learnerCase.status]} colorClass={STATUS_COLORS[learnerCase.status]} />
            <Badge label={ISSUE_LABELS[learnerCase.issueType]} colorClass="bg-purple-100 text-purple-800" />
            {learnerCase.isOverdue && <Badge label="Overdue" colorClass="bg-red-100 text-red-700" />}
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

          <div className="text-xs text-gray-500 space-y-0.5">
            <p>Flagged: {learnerCase.flaggedAt ? new Date(learnerCase.flaggedAt).toLocaleDateString() : "—"}</p>
            {learnerCase.acknowledgedAt && (
              <p>Acknowledged: {new Date(learnerCase.acknowledgedAt).toLocaleDateString()}</p>
            )}
            {learnerCase.status !== "resolved" && (
              <p>Days open: {learnerCase.daysOpen}</p>
            )}
          </div>

          {/* Threads (read-only) */}
          {(learnerCase.threads?.length ?? 0) > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes / Discussion</span>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {learnerCase.threads!.map((t) => (
                  <div key={t.id} className="bg-gray-50 rounded-md p-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{t.userName ?? "Unknown"}</span>
                      <span className="text-xs text-gray-400">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{t.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Acknowledge action */}
        {learnerCase.status === "open" && (
          <div className="px-6 py-4 border-t">
            <button
              onClick={() => onAcknowledge(learnerCase.id)}
              disabled={acknowledging}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              {acknowledging ? "Acknowledging..." : "Acknowledge — Move to Monitoring"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Section
// ---------------------------------------------------------------------------

export default function MonitorCasesSection() {
  const { cases, loading, error, filters, setFilters, acknowledgeCase, fetchCase } = useLearnerCaseData();
  const [selectedCase, setSelectedCase] = useState<LearnerCase | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const handleAcknowledge = useCallback(async (id: string) => {
    setAcknowledging(true);
    try {
      const updated = await acknowledgeCase(id);
      setSelectedCase(updated);
    } finally {
      setAcknowledging(false);
    }
  }, [acknowledgeCase]);

  async function handleViewCase(c: LearnerCase) {
    try {
      const full = await fetchCase(c.id);
      setSelectedCase(full);
    } catch {
      setSelectedCase(c);
    }
  }

  // KPIs
  const totalOpen = cases.filter((c) => c.status === "open").length;
  const highSeverity = cases.filter((c) => c.severity === "high" && c.status !== "resolved").length;
  const overdue = cases.filter((c) => c.isOverdue).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Learner Cases — Division Overview</h2>
        <p className="text-sm text-gray-500 mt-0.5">All at-risk cases reported across schools</p>
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

      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilters({ ...filters, severity: filters.severity === "high" ? null : "high" })}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            filters.severity === "high"
              ? "bg-red-100 text-red-800 border-red-200"
              : "bg-white text-gray-600 border-gray-300 hover:border-red-300"
          }`}
        >
          High Severity Only
        </button>
        <button
          onClick={() => setFilters({ ...filters, status: filters.status === "open" ? null : "open" })}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            filters.status === "open"
              ? "bg-orange-100 text-orange-800 border-orange-200"
              : "bg-white text-gray-600 border-gray-300 hover:border-orange-300"
          }`}
        >
          Open Only
        </button>
        <button
          onClick={() => setFilters({ ...filters, overdue: !filters.overdue })}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            filters.overdue
              ? "bg-amber-100 text-amber-800 border-amber-200"
              : "bg-white text-gray-600 border-gray-300 hover:border-amber-300"
          }`}
        >
          Overdue (&gt;30d)
        </button>
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({})} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading cases...</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : cases.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">No cases match the current filters.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">School</th>
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
                    <p className="font-medium text-gray-900 text-xs">{c.school?.name ?? "—"}</p>
                    <p className="text-xs text-gray-400">{c.school?.schoolCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    {c.learnerName ? (
                      <div>
                        <p className="text-gray-900">{c.learnerName}</p>
                        {c.lrn && <p className="text-xs text-gray-400 font-mono">{c.lrn}</p>}
                      </div>
                    ) : (
                      <span className="text-gray-400 italic text-xs">Not specified</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.gradeLevel} — {c.section}</td>
                  <td className="px-4 py-3">
                    <Badge label={ISSUE_LABELS[c.issueType]} colorClass="bg-purple-100 text-purple-800" />
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
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {c.status === "resolved" ? "—" : c.daysOpen}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleViewCase(c)}
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

      {selectedCase && (
        <MonitorCaseDrawer
          learnerCase={selectedCase}
          onClose={() => setSelectedCase(null)}
          onAcknowledge={handleAcknowledge}
          acknowledging={acknowledging}
        />
      )}
    </div>
  );
}
