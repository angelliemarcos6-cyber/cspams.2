import { RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SchoolRecord } from "@/types";

export interface MonitorArchivedSchoolsProps {
  show: boolean;
  archivedRecords: SchoolRecord[];
  isLoading: boolean;
  isSaving: boolean;
  onRefresh: () => void | Promise<void>;
  onRestore: (record: SchoolRecord) => void | Promise<void>;
  onPermanentDelete: (record: SchoolRecord) => void | Promise<void>;
  formatDateTime: (value: string) => string;
}

export function MonitorArchivedSchools({
  show,
  archivedRecords,
  isLoading,
  isSaving,
  onRefresh,
  onRestore,
  onPermanentDelete,
  formatDateTime,
}: MonitorArchivedSchoolsProps) {
  const [pendingPermanentDeleteRecord, setPendingPermanentDeleteRecord] = useState<SchoolRecord | null>(null);
  const [pendingPermanentDeleteCountdownSeconds, setPendingPermanentDeleteCountdownSeconds] = useState(0);

  useEffect(() => {
    if (!pendingPermanentDeleteRecord || typeof window === "undefined") {
      setPendingPermanentDeleteCountdownSeconds(0);
      return;
    }

    setPendingPermanentDeleteCountdownSeconds(3);
    const intervalId = window.setInterval(() => {
      setPendingPermanentDeleteCountdownSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pendingPermanentDeleteRecord]);

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
                <th className="px-3 py-2 text-left">School Head</th>
                <th className="px-3 py-2 text-left">Last Updated</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {archivedRecords.map((record) => (
                <tr key={`archived-${record.id}`} className="align-top">
                  <td className="px-3 py-2 text-xs text-slate-700">{record.schoolId ?? record.schoolCode ?? "N/A"}</td>
                  <td className="px-3 py-2 text-xs text-slate-900">{record.schoolName}</td>
                  <td className="px-3 py-2 text-xs text-slate-700">
                    {record.schoolHeadAccount ? (
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-900">{record.schoolHeadAccount.name}</div>
                        <div className="break-all text-slate-600">{record.schoolHeadAccount.email}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {record.schoolHeadAccount.accountStatus}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">No account</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatDateTime(record.lastUpdated)}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onRestore(record)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1 rounded-sm border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700 transition hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingPermanentDeleteRecord(record)}
                        disabled={isSaving}
                        className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete permanently
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingPermanentDeleteRecord && (
        <>
          <div className="fixed inset-0 z-[90] bg-slate-950/35" />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Permanently delete archived school"
            className="fixed left-1/2 top-28 z-[91] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-sm border border-slate-200 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Permanently delete archived school</h3>
                <p className="mt-1 text-xs text-slate-600">
                  This permanently removes {pendingPermanentDeleteRecord.schoolName} and all linked school data. This cannot be undone.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingPermanentDeleteRecord(null)}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white p-1 text-slate-600 transition hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-sm border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
              <p className="font-semibold">Permanent delete scope</p>
              <p className="mt-1">
                The school record, linked School Head account, students, sections, submission histories, and indicator submissions for this school will be deleted permanently.
              </p>
              {pendingPermanentDeleteRecord.schoolHeadAccount ? (
                <p className="mt-2">
                  Linked School Head: {pendingPermanentDeleteRecord.schoolHeadAccount.name} ({pendingPermanentDeleteRecord.schoolHeadAccount.email})
                </p>
              ) : (
                <p className="mt-2">No School Head account is currently linked.</p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingPermanentDeleteRecord(null)}
                className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onPermanentDelete(pendingPermanentDeleteRecord);
                  setPendingPermanentDeleteRecord(null);
                }}
                disabled={isSaving || pendingPermanentDeleteCountdownSeconds > 0}
                className="inline-flex items-center gap-1 rounded-sm border border-rose-200 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving
                  ? "Deleting permanently..."
                  : pendingPermanentDeleteCountdownSeconds > 0
                    ? `Delete permanently (${pendingPermanentDeleteCountdownSeconds})`
                    : "Delete permanently"}
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
