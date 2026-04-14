import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { MonitorSchoolRequirementSummary } from "@/pages/monitor/MonitorSchoolRecordsList";
import type { MonitorTopNavigatorId } from "@/pages/monitor/monitorFilters";
import { sanitizeAnchorToken } from "@/pages/monitor/monitorDashboardUiUtils";
import { normalizeSchoolKey } from "@/pages/monitor/monitorRequirementRules";
import type { SchoolRecord, SchoolReminderReceipt } from "@/types";

type ToastTone = "success" | "info" | "warning";

interface SchoolActionSummary {
  schoolKey: string;
  schoolName: string;
}

interface UseMonitorSchoolActionRouterArgs {
  scopedRecordBySchoolKey: Map<string, SchoolRecord>;
  recordBySchoolKey: Map<string, SchoolRecord>;
  schoolRequirementByKey: Map<string, MonitorSchoolRequirementSummary>;
  setActiveTopNavigator: Dispatch<SetStateAction<MonitorTopNavigatorId>>;
  openSchoolDrawer: (schoolKey: string) => void;
  focusAndScrollTo: (targetId: string) => void;
  pushToast: (message: string, tone?: ToastTone) => void;
  sendReminder: (id: string, notes?: string | null) => Promise<SchoolReminderReceipt>;
}

export interface UseMonitorSchoolActionRouterResult {
  remindingSchoolKey: string | null;
  sendReminderForSchool: (schoolKey: string, schoolName: string, notes?: string | null) => Promise<void>;
  handleReviewSchool: (summary: SchoolActionSummary) => void;
  handleOpenSchool: (summary: SchoolActionSummary) => void;
  handleSendReminder: (summary: SchoolActionSummary) => void;
  handleReviewRecord: (record: SchoolRecord) => void;
  handleOpenSchoolRecord: (record: SchoolRecord) => void;
  handleQueueSchoolFocus: (schoolKey: string) => void;
}

function scrollQueueRowIntoView(schoolKey: string) {
  if (typeof document === "undefined") return;

  const targetId = `monitor-queue-row-${sanitizeAnchorToken(schoolKey)}`;
  const row = document.getElementById(targetId);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
}

function scheduleFocus(
  focusAndScrollTo: (targetId: string) => void,
  targetId: string,
  afterFocus?: () => void,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    focusAndScrollTo(targetId);
    afterFocus?.();
  }, 80);
}

export function useMonitorSchoolActionRouter({
  scopedRecordBySchoolKey,
  recordBySchoolKey,
  schoolRequirementByKey,
  setActiveTopNavigator,
  openSchoolDrawer,
  focusAndScrollTo,
  pushToast,
  sendReminder,
}: UseMonitorSchoolActionRouterArgs): UseMonitorSchoolActionRouterResult {
  const [remindingSchoolKey, setRemindingSchoolKey] = useState<string | null>(null);

  const sendReminderForSchool = useCallback(
    async (schoolKey: string, schoolName: string, notes?: string | null) => {
      const record = scopedRecordBySchoolKey.get(schoolKey) ?? recordBySchoolKey.get(schoolKey);
      if (!record) {
        pushToast(`Unable to send reminder for ${schoolName}: school record not found.`, "warning");
        return;
      }

      setRemindingSchoolKey(schoolKey);
      try {
        const receipt = await sendReminder(record.id, notes);
        const recipientLabel = receipt.recipientCount === 1 ? "recipient" : "recipients";
        pushToast(`Reminder sent to ${receipt.schoolName} (${receipt.recipientCount} ${recipientLabel}).`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : `Unable to send reminder for ${schoolName}.`;
        pushToast(message, "warning");
      } finally {
        setRemindingSchoolKey((current) => (current === schoolKey ? null : current));
      }
    },
    [pushToast, recordBySchoolKey, scopedRecordBySchoolKey, sendReminder],
  );

  const handleReviewSchool = useCallback(
    (summary: SchoolActionSummary) => {
      openSchoolDrawer(summary.schoolKey);
      setActiveTopNavigator("reviews");
      scheduleFocus(focusAndScrollTo, "monitor-queue-workspace", () => {
        scrollQueueRowIntoView(summary.schoolKey);
      });
      pushToast(`Review workspace opened for ${summary.schoolName}.`, "info");
    },
    [focusAndScrollTo, openSchoolDrawer, pushToast, setActiveTopNavigator],
  );

  const handleOpenSchool = useCallback(
    (summary: SchoolActionSummary) => {
      setActiveTopNavigator("schools");
      openSchoolDrawer(summary.schoolKey);
      scheduleFocus(focusAndScrollTo, "monitor-school-records");
      pushToast(`Opened school details for ${summary.schoolName}.`, "info");
    },
    [focusAndScrollTo, openSchoolDrawer, pushToast, setActiveTopNavigator],
  );

  const handleSendReminder = useCallback(
    (summary: SchoolActionSummary) => {
      void sendReminderForSchool(summary.schoolKey, summary.schoolName);
    },
    [sendReminderForSchool],
  );

  const handleReviewRecord = useCallback(
    (record: SchoolRecord) => {
      const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (schoolKey === "unknown") {
        pushToast(`Unable to open review for ${record.schoolName}: school key is missing.`, "warning");
        return;
      }

      const summary = schoolRequirementByKey.get(schoolKey);
      if (summary) {
        handleReviewSchool(summary);
        return;
      }

      openSchoolDrawer(schoolKey);
      setActiveTopNavigator("reviews");
      scheduleFocus(focusAndScrollTo, "monitor-queue-workspace");
      pushToast(`Review workspace opened for ${record.schoolName}.`, "info");
    },
    [focusAndScrollTo, handleReviewSchool, openSchoolDrawer, pushToast, schoolRequirementByKey, setActiveTopNavigator],
  );

  const handleOpenSchoolRecord = useCallback(
    (record: SchoolRecord) => {
      const schoolKey = normalizeSchoolKey(record.schoolId ?? record.schoolCode ?? null, record.schoolName);
      if (schoolKey === "unknown") {
        pushToast(`Unable to open school details for ${record.schoolName}: school key is missing.`, "warning");
        return;
      }

      setActiveTopNavigator("schools");
      openSchoolDrawer(schoolKey);
      scheduleFocus(focusAndScrollTo, "monitor-school-records");
      pushToast(`Opened school details for ${record.schoolName}.`, "info");
    },
    [focusAndScrollTo, openSchoolDrawer, pushToast, setActiveTopNavigator],
  );

  const handleQueueSchoolFocus = useCallback(
    (schoolKey: string) => {
      if (schoolKey === "unknown") return;

      openSchoolDrawer(schoolKey);
      setActiveTopNavigator("reviews");
    },
    [openSchoolDrawer, setActiveTopNavigator],
  );

  return {
    remindingSchoolKey,
    sendReminderForSchool,
    handleReviewSchool,
    handleOpenSchool,
    handleSendReminder,
    handleReviewRecord,
    handleOpenSchoolRecord,
    handleQueueSchoolFocus,
  };
}
