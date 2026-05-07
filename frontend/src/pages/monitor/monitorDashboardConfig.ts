import type { ComponentType } from "react";
import {
  Building2,
  ClipboardList,
  Filter,
  LayoutDashboard,
  ListChecks,
  TrendingUp,
} from "lucide-react";
import type {
  MonitorTopNavigatorId,
  RequirementFilter,
  SchoolQuickPreset,
} from "@/pages/monitor/monitorFilters";

export interface MonitorTopNavigatorItem {
  id: MonitorTopNavigatorId;
  label: string;
}

export interface ManualStep {
  id: string;
  title: string;
  objective: string;
  actions: string[];
  doneWhen: string;
}

export type NavigatorIcon = ComponentType<{ className?: string }>;

export interface QuickJumpItem {
  id: string;
  label: string;
  targetId: string;
  icon: NavigatorIcon;
}

export const MONITOR_TOP_NAVIGATOR_ITEMS: MonitorTopNavigatorItem[] = [
  { id: "overview", label: "Overview" },
  { id: "schools", label: "Schools" },
  { id: "reviews", label: "Reviews" },
];

export const MONITOR_TOP_NAVIGATOR_IDS: MonitorTopNavigatorId[] = MONITOR_TOP_NAVIGATOR_ITEMS.map(
  (item) => item.id,
);

export const MONITOR_NAVIGATOR_ICONS: Record<MonitorTopNavigatorId, NavigatorIcon> = {
  overview: LayoutDashboard,
  schools: Building2,
  reviews: ClipboardList,
};

export const MONITOR_NAVIGATOR_MANUAL: ManualStep[] = [
  {
    id: "overview",
    title: "Overview",
    objective: "Start with overall status and analytics before opening school-level work.",
    actions: [
      "Check summary totals for needs action, returned, and submitted.",
      "Use analytics to spot trends or spikes that need follow-up.",
    ],
    doneWhen: "Priority issues are identified for this review cycle.",
  },
  {
    id: "schools",
    title: "Schools",
    objective: "Open school-level records and verify synchronized student and teacher data.",
    actions: [
      "Use search and school filters to find the school you need quickly.",
      "Inspect school details without leaving the dashboard.",
    ],
    doneWhen: "The selected school context is verified and ready for review.",
  },
  {
    id: "reviews",
    title: "Reviews",
    objective: "Work through pending compliance reviews in one focused workspace.",
    actions: [
      "Review queue items, validate submissions, or return with clear notes.",
      "Use lane and workflow filters to process urgent schools first.",
    ],
    doneWhen: "Each queued school has a clear review action.",
  },
];

export const MONITOR_MANUAL_STATUS_GUIDE = [
  "Not Submitted: Requirement not yet submitted by school.",
  "For Review: Submitted and waiting for monitor review.",
  "Returned for Correction: Sent back to school head for correction.",
  "Submitted: Package was sent by school.",
  "Validated: Approved and closed.",
];

export const REQUIREMENT_FILTER_OPTIONS: Array<{ id: RequirementFilter; label: string }> = [
  { id: "all", label: "All statuses" },
  { id: "missing", label: "Not Submitted" },
  { id: "waiting", label: "For Review" },
  { id: "returned", label: "Returned for Correction" },
  { id: "submitted", label: "Submitted" },
  { id: "validated", label: "Validated" },
];

// Keep these ids stable because URL params and localStorage already persist them.
// The user-facing labels intentionally use newer submission-centric wording.
export const SCHOOL_QUICK_PRESET_OPTIONS: Array<{
  id: SchoolQuickPreset;
  label: string;
  hint: string;
}> = [
  { id: "all", label: "All", hint: "Show every school in the current scope." },
  { id: "pending", label: "Submitted for Review", hint: "Schools with submitted requirements waiting for monitor review." },
  { id: "missing", label: "Submission Incomplete", hint: "Schools still missing one or more required submissions." },
  { id: "returned", label: "Returned for Correction", hint: "Schools with submissions returned for correction." },
  { id: "no_submission", label: "Not Submitted", hint: "Schools with no submitted requirement package yet." },
];

export const MONITOR_QUICK_JUMPS: Record<MonitorTopNavigatorId, QuickJumpItem[]> = {
  overview: [
    { id: "filters_overview", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "overview_metrics", label: "Overview Metrics", targetId: "monitor-overview-metrics", icon: LayoutDashboard },
    { id: "overview_analytics", label: "Analytics", targetId: "monitor-analytics-toggle", icon: TrendingUp },
  ],
  reviews: [
    { id: "filters_queue", label: "Filters", targetId: "monitor-submission-filters", icon: Filter },
    { id: "queue_list", label: "Queue List", targetId: "monitor-requirements-table", icon: ListChecks },
    { id: "queue_workspace", label: "Review Workspace", targetId: "monitor-queue-workspace", icon: ClipboardList },
  ],
  schools: [],
};

export const REQUIREMENT_PAGE_SIZE = 10;
export const RECORD_PAGE_SIZE = 10;
