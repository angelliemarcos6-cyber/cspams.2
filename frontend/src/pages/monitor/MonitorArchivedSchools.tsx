import { RefreshCw } from "lucide-react";
import type { SchoolRecord } from "@/types";

export interface MonitorArchivedSchoolsProps {
  show: boolean;
  archivedRecords: SchoolRecord[];
  isLoading: boolean;
  isSaving: boolean;
  onRefresh: () => void | Promise<void>;
  onRestore: (record: SchoolRecord) => void | Promise<void>;
  formatDateTime: (value: string) => string;
}

export function MonitorArchivedSchools({
  show,
  archivedRecords,
  isLoading,
  isSaving,
  onRefresh,
  onRestore,
  formatDateTime,
}: MonitorArchivedSchoolsProps) {
  if (!show) {
    return null;
  }

  return (
    <section className="border-t border-slate-200 bg-slate-50/60 px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Archived Schools</h3>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <p className="mt-2 text-xs text-slate-600">Loading archived records...</p>
      ) : archivedRecords.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">No archived school records.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-sm border border-slate-200 bg-white">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="px-3 py-2 text-left">School Code</th>
                <th className="px-3 py-2 text-left">School Name</th>
                <th className="px-3 py-2 text-left">Last Updated</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {archivedRecords.map((record) => (
                <tr key={`archived-${record.id}`}>
                  <td className="px-3 py-2 text-xs text-slate-700">{record.schoolId ?? record.schoolCode ?? "N/A"}</td>
                  <td className="px-3 py-2 text-xs text-slate-900">{record.schoolName}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(record.lastUpdated)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => void onRestore(record)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
