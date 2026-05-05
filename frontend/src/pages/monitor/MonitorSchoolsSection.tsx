import type { ChangeEvent, ComponentProps, RefObject } from "react";
import {
  Building2,
  ChevronDown,
  Database,
  GraduationCap,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { MonitorArchivedSchools, type MonitorArchivedSchoolsProps } from "@/pages/monitor/MonitorArchivedSchools";
import {
  MonitorSchoolHeadAccountsPanel,
  type MonitorSchoolHeadAccountsPanelProps,
} from "@/pages/monitor/MonitorSchoolHeadAccountsPanel";
import { MonitorSchoolMessages, type MonitorSchoolMessagesProps } from "@/pages/monitor/MonitorSchoolMessages";
import { MonitorSchoolRecordForm, type MonitorSchoolRecordFormProps } from "@/pages/monitor/MonitorSchoolRecordForm";
import { MonitorSchoolRecordsList, type MonitorSchoolRecordsListProps } from "@/pages/monitor/MonitorSchoolRecordsList";
import { MonitorQuickJumpChips, type MonitorQuickJumpBindings } from "@/pages/monitor/MonitorQuickJumpChips";
import { SchoolScopeSelector } from "@/pages/monitor/SchoolScopeSelector";
import { StudentLookupSelector } from "@/pages/monitor/StudentLookupSelector";
import { TeacherLookupSelector } from "@/pages/monitor/TeacherLookupSelector";
import type { MonitorRadarTotals } from "@/pages/monitor/useMonitorRadarTotals";

interface MonitorSchoolsSectionProps {
  sectionFocusClass: (targetId: string) => string;
  isMobileViewport: boolean;
  quickJumpBindings: MonitorQuickJumpBindings;
  totalSchoolsInScope: number;
  monitorRadarTotals: MonitorRadarTotals;
  schoolScopeRadarSelectorProps: ComponentProps<typeof SchoolScopeSelector>;
  studentRadarSelectorProps: ComponentProps<typeof StudentLookupSelector>;
  teacherRadarSelectorProps: ComponentProps<typeof TeacherLookupSelector>;
  paginatedCompactSchoolRowsCount: number;
  compactSchoolRowsCount: number;
  schoolActionsMenuRef: RefObject<HTMLDivElement>;
  bulkImportInputRef: RefObject<HTMLInputElement>;
  onBulkImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onOpenCreateRecordForm: () => void;
  onToggleAccountsPanel: () => void;
  showSchoolHeadAccountsPanel: boolean;
  onToggleActionsMenu: () => void;
  isSchoolActionsMenuOpen: boolean;
  onOpenBulkImportPicker: () => void;
  isBulkImporting: boolean;
  onToggleArchivedRecords: () => void;
  showArchivedRecords: boolean;
  onShowMfaResetApprovals: () => void;
  schoolHeadAccountsPanelProps: MonitorSchoolHeadAccountsPanelProps | null;
  messages: MonitorSchoolMessagesProps;
  schoolRecordFormProps: MonitorSchoolRecordFormProps;
  schoolRecordsListProps: MonitorSchoolRecordsListProps;
  archivedSchoolsProps: MonitorArchivedSchoolsProps;
}

export function MonitorSchoolsSection({
  sectionFocusClass,
  isMobileViewport,
  quickJumpBindings,
  totalSchoolsInScope,
  monitorRadarTotals,
  schoolScopeRadarSelectorProps,
  studentRadarSelectorProps,
  teacherRadarSelectorProps,
  paginatedCompactSchoolRowsCount,
  compactSchoolRowsCount,
  schoolActionsMenuRef,
  bulkImportInputRef,
  onBulkImportFileChange,
  onOpenCreateRecordForm,
  onToggleAccountsPanel,
  showSchoolHeadAccountsPanel,
  onToggleActionsMenu,
  isSchoolActionsMenuOpen,
  onOpenBulkImportPicker,
  isBulkImporting,
  onToggleArchivedRecords,
  showArchivedRecords,
  onShowMfaResetApprovals,
  schoolHeadAccountsPanelProps,
  messages,
  schoolRecordFormProps,
  schoolRecordsListProps,
  archivedSchoolsProps,
}: MonitorSchoolsSectionProps) {
  return (
    <>
      <div id="monitor-school-radar" className={`bg-white p-3 ${sectionFocusClass("monitor-school-radar")}`}>
        <div className="grid gap-3 lg:grid-cols-3">
          <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Schools</p>
                <p className="mt-1 text-3xl font-bold leading-none text-slate-900">{totalSchoolsInScope.toLocaleString()}</p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                <Building2 className="h-5 w-5" />
              </span>
            </div>
            <SchoolScopeSelector {...schoolScopeRadarSelectorProps} />
          </article>

          <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Students</p>
                <p className="mt-1 text-3xl font-bold leading-none text-slate-900">
                  {monitorRadarTotals.isLoading
                    ? "..."
                    : monitorRadarTotals.students === null
                      ? "--"
                      : monitorRadarTotals.students.toLocaleString()}
                </p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                <GraduationCap className="h-5 w-5" />
              </span>
            </div>
            <StudentLookupSelector {...studentRadarSelectorProps} />
          </article>

          <article className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Total Teachers</p>
                <p className="mt-1 text-3xl font-bold leading-none text-slate-900">
                  {monitorRadarTotals.isLoading
                    ? "..."
                    : monitorRadarTotals.teachers === null
                      ? "--"
                      : monitorRadarTotals.teachers.toLocaleString()}
                </p>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-slate-200 bg-white text-primary-700">
                <Users className="h-5 w-5" />
              </span>
            </div>
            <TeacherLookupSelector {...teacherRadarSelectorProps} />
          </article>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            {monitorRadarTotals.error
              ? monitorRadarTotals.error
              : monitorRadarTotals.syncedAt
                ? `Synced ${new Date(monitorRadarTotals.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Waiting for sync"}
          </span>
          <span>Totals are read live from students and teachers records.</span>
        </div>
      </div>

      <section
        id="monitor-school-records"
        className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-records")}`}
      >
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Schools</h2>
            </div>
            {!isMobileViewport && <MonitorQuickJumpChips {...quickJumpBindings} mobile={false} />}
          </div>
          {isMobileViewport && <MonitorQuickJumpChips {...quickJumpBindings} mobile />}
        </div>

        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              Showing {paginatedCompactSchoolRowsCount} of {compactSchoolRowsCount} (Needs Attention First)
            </div>
            <div ref={schoolActionsMenuRef} className="relative flex flex-wrap items-center gap-2">
              <input
                ref={bulkImportInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void onBulkImportFileChange(event)}
              />
              <button
                type="button"
                onClick={onOpenCreateRecordForm}
                className="inline-flex items-center gap-1 rounded-sm border border-primary-300/70 bg-primary px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600"
              >
                <Plus className="h-3.5 w-3.5" />
                Add School
              </button>
              <button
                type="button"
                onClick={onToggleAccountsPanel}
                className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1.5 text-xs font-semibold transition ${
                  showSchoolHeadAccountsPanel
                    ? "border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Accounts
              </button>
              <button
                type="button"
                onClick={onToggleActionsMenu}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
              >
                More
                <ChevronDown className={`h-3.5 w-3.5 transition ${isSchoolActionsMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {isSchoolActionsMenuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={onOpenBulkImportPicker}
                    disabled={isBulkImporting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    <Database className="h-3.5 w-3.5 text-primary-600" />
                    {isBulkImporting ? "Importing..." : "Import CSV"}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleArchivedRecords}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-primary-600" />
                    {showArchivedRecords ? "Hide Archived" : "Show Archived"}
                  </button>
                  <button
                    type="button"
                    onClick={onShowMfaResetApprovals}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-primary-600" />
                    MFA Reset Requests
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {schoolHeadAccountsPanelProps && <MonitorSchoolHeadAccountsPanel {...schoolHeadAccountsPanelProps} />}
        <MonitorSchoolMessages {...messages} />
        <MonitorSchoolRecordForm {...schoolRecordFormProps} />
        <MonitorSchoolRecordsList {...schoolRecordsListProps} />
        <MonitorArchivedSchools {...archivedSchoolsProps} />
      </section>
    </>
  );
}
