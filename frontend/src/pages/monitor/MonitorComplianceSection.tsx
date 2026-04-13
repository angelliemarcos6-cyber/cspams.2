import { useState } from "react";
import { CheckCircle, Clock, AlertCircle, Filter, Bell } from "lucide-react";
import { useReportSubmissionData } from "@/context/ReportSubmissionData";
import type { ReportStatus, ReportType } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<ReportStatus | "pending", { label: string; icon: React.ReactNode; colorClass: string }> = {
  pending: {
    label: "Pending",
    icon: <Clock className="w-3.5 h-3.5" />,
    colorClass: "text-gray-500 bg-gray-100",
  },
  submitted: {
    label: "Submitted",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    colorClass: "text-blue-700 bg-blue-100",
  },
  approved: {
    label: "Approved",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    colorClass: "text-green-700 bg-green-100",
  },
};

function StatusBadge({ status }: { status: ReportStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.colorClass}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SchoolComplianceRow {
  schoolId: string;
  schoolCode: string | null;
  schoolName: string;
  bmefStatus: ReportStatus;
  targetsMetStatus: ReportStatus;
  isFullyCompliant: boolean;
}

export default function MonitorComplianceSection() {
  const { submissions, loading, error } = useReportSubmissionData();
  const [showNonCompliantOnly, setShowNonCompliantOnly] = useState(false);

  // Group submissions by school
  const schoolMap = new Map<string, SchoolComplianceRow>();

  for (const sub of submissions) {
    const id = sub.schoolId;
    if (!schoolMap.has(id)) {
      schoolMap.set(id, {
        schoolId: id,
        schoolCode: sub.school?.schoolCode ?? null,
        schoolName: sub.school?.name ?? "Unknown School",
        bmefStatus: "pending",
        targetsMetStatus: "pending",
        isFullyCompliant: false,
      });
    }
    const row = schoolMap.get(id)!;
    if (sub.reportType === "bmef") row.bmefStatus = sub.status;
    if (sub.reportType === "targets_met") row.targetsMetStatus = sub.status;
  }

  // Compute isFullyCompliant
  for (const row of schoolMap.values()) {
    row.isFullyCompliant = row.bmefStatus === "approved" && row.targetsMetStatus === "approved";
  }

  let rows = Array.from(schoolMap.values()).sort((a, b) => a.schoolName.localeCompare(b.schoolName));

  if (showNonCompliantOnly) {
    rows = rows.filter((r) => !r.isFullyCompliant);
  }

  const totalSchools = schoolMap.size;
  const compliantCount = Array.from(schoolMap.values()).filter((r) => r.isFullyCompliant).length;
  const pendingBmef = Array.from(schoolMap.values()).filter((r) => r.bmefStatus === "pending").length;
  const pendingTargetsMet = Array.from(schoolMap.values()).filter((r) => r.targetsMetStatus === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Submission Compliance</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Track BMEF and TARGETS-MET file report status across all schools
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium">Schools Tracked</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalSchools}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg p-3">
          <p className="text-xs text-green-700 font-medium">Fully Compliant</p>
          <p className="text-2xl font-bold text-green-800 mt-0.5">{compliantCount}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
          <p className="text-xs text-orange-700 font-medium">BMEF Pending</p>
          <p className="text-2xl font-bold text-orange-800 mt-0.5">{pendingBmef}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
          <p className="text-xs text-orange-700 font-medium">Targets-Met Pending</p>
          <p className="text-2xl font-bold text-orange-800 mt-0.5">{pendingTargetsMet}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showNonCompliantOnly}
            onChange={(e) => setShowNonCompliantOnly(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded"
          />
          Show non-compliant only
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading compliance data...</div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-red-500">{error}</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {showNonCompliantOnly ? "All schools are fully compliant." : "No submission data yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">School</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">BMEF</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">TARGETS-MET</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map((row) => (
                <tr key={row.schoolId} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.schoolName}</p>
                    {row.schoolCode && (
                      <p className="text-xs text-gray-400">{row.schoolCode}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.bmefStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.targetsMetStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {row.isFullyCompliant ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Compliant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-700 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" /> Incomplete
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
