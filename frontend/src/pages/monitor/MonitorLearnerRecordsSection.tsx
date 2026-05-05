import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StudentRecordsPanel } from "@/components/students/StudentRecordsPanel";

interface MonitorLearnerRecordsSectionProps {
  sectionFocusClass: (targetId: string) => string;
  showSchoolLearnerRecords: boolean;
  setShowSchoolLearnerRecords: Dispatch<SetStateAction<boolean>>;
  filteredSchoolKeys: Set<string> | null;
  studentRecordsLookupTerm: string;
}

export function MonitorLearnerRecordsSection({
  sectionFocusClass,
  showSchoolLearnerRecords,
  setShowSchoolLearnerRecords,
  filteredSchoolKeys,
  studentRecordsLookupTerm,
}: MonitorLearnerRecordsSectionProps) {
  return (
    <section
      id="monitor-school-learners"
      className={`surface-panel dashboard-shell mt-5 animate-fade-slide overflow-hidden ${sectionFocusClass("monitor-school-learners")}`}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Learner Records</h2>
            <p className="mt-1 text-xs text-slate-600">Read-only learner checks by school, student, or teacher.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSchoolLearnerRecords((current) => !current)}
            className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {showSchoolLearnerRecords ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showSchoolLearnerRecords ? "Hide Learner Records" : "Show Learner Records"}
          </button>
        </div>
      </div>
      {showSchoolLearnerRecords ? (
        <StudentRecordsPanel
          editable={false}
          showSchoolColumn
          schoolFilterKeys={filteredSchoolKeys}
          externalSearchTerm={studentRecordsLookupTerm}
          title="Student Records"
          description="Read-only learner checks and search."
          defaultAcademicYearFilter="all"
        />
      ) : (
        <div className="px-5 py-8 text-sm text-slate-500">
          Learner records are hidden. Use the <span className="font-semibold text-slate-700">Show Learner Records</span> button above to open this panel.
        </div>
      )}
    </section>
  );
}
