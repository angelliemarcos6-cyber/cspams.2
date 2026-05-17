import type { ComponentProps } from "react";
import { MonitorSchoolDrawer } from "@/pages/monitor/MonitorSchoolDrawer";

type MonitorSchoolDrawerProps = ComponentProps<typeof MonitorSchoolDrawer>;
type MonitorSchoolDrawerViewState = MonitorSchoolDrawerProps["viewState"];
type MonitorSchoolDrawerLoadingState = MonitorSchoolDrawerProps["loadingState"];
type MonitorSchoolDrawerData = MonitorSchoolDrawerProps["data"];
type MonitorSchoolDrawerActions = MonitorSchoolDrawerProps["actions"];
type MonitorSchoolDrawerFormatting = MonitorSchoolDrawerProps["formatting"];

interface BuildMonitorSchoolDrawerPropsArgs {
  isOpen: MonitorSchoolDrawerViewState["isOpen"];
  showNavigatorManual: MonitorSchoolDrawerViewState["showNavigatorManual"];
  isMobileViewport: MonitorSchoolDrawerViewState["isMobileViewport"];
  activeTopNavigator: MonitorSchoolDrawerViewState["activeTopNavigator"];
  activeSchoolDrawerTab: MonitorSchoolDrawerViewState["activeSchoolDrawerTab"];
  selectedSchoolDrawerYear: MonitorSchoolDrawerViewState["selectedSchoolDrawerYear"];
  availableSchoolDrawerYears: MonitorSchoolDrawerData["availableSchoolDrawerYears"];
  highlightedDrawerIndicatorKey: MonitorSchoolDrawerViewState["highlightedDrawerIndicatorKey"];
  expandedDrawerIndicatorRows: MonitorSchoolDrawerViewState["expandedDrawerIndicatorRows"];
  syncedCountsLoadingSchoolKey: MonitorSchoolDrawerLoadingState["syncedCountsLoadingSchoolKey"];
  syncedCountsError: MonitorSchoolDrawerLoadingState["syncedCountsError"];
  isSchoolDrawerSubmissionsLoading: MonitorSchoolDrawerLoadingState["isSchoolDrawerSubmissionsLoading"];
  schoolDrawerSubmissionsError: MonitorSchoolDrawerLoadingState["schoolDrawerSubmissionsError"];
  schoolDetail: MonitorSchoolDrawerData["schoolDetail"];
  schoolDrawerSnapshotSummary: MonitorSchoolDrawerData["schoolDrawerSnapshotSummary"];
  schoolDrawerYearDetail: MonitorSchoolDrawerData["schoolDrawerYearDetail"];
  schoolDrawerHistorySummary: MonitorSchoolDrawerData["schoolDrawerHistorySummary"];
  schoolDrawerCriticalAlerts: MonitorSchoolDrawerData["schoolDrawerCriticalAlerts"];
  schoolIndicatorPackageRows: MonitorSchoolDrawerData["schoolIndicatorPackageRows"];
  latestSchoolPackage: MonitorSchoolDrawerData["latestSchoolPackage"];
  schoolIndicatorMatrix: MonitorSchoolDrawerData["schoolIndicatorMatrix"];
  latestSchoolIndicatorYear: MonitorSchoolDrawerData["latestSchoolIndicatorYear"];
  schoolDrawerIndicatorSubmissions: MonitorSchoolDrawerData["schoolDrawerIndicatorSubmissions"];
  schoolIndicatorRowsByCategory: MonitorSchoolDrawerData["schoolIndicatorRowsByCategory"];
  missingDrawerIndicatorKeys: MonitorSchoolDrawerData["missingDrawerIndicatorKeys"];
  returnedDrawerIndicatorKeys: MonitorSchoolDrawerData["returnedDrawerIndicatorKeys"];
  missingDrawerIndicatorKeySet: MonitorSchoolDrawerData["missingDrawerIndicatorKeySet"];
  returnedDrawerIndicatorKeySet: MonitorSchoolDrawerData["returnedDrawerIndicatorKeySet"];
  setActiveSchoolDrawerTab: MonitorSchoolDrawerActions["setActiveSchoolDrawerTab"];
  setSelectedSchoolDrawerYear: MonitorSchoolDrawerActions["setSelectedSchoolDrawerYear"];
  closeSchoolDrawer: MonitorSchoolDrawerActions["closeSchoolDrawer"];
  handleJumpToMissingIndicators: MonitorSchoolDrawerActions["handleJumpToMissingIndicators"];
  handleJumpToReturnedIndicators: MonitorSchoolDrawerActions["handleJumpToReturnedIndicators"];
  toggleDrawerIndicatorLabel: MonitorSchoolDrawerActions["toggleDrawerIndicatorLabel"];
  workflowTone: MonitorSchoolDrawerFormatting["workflowTone"];
  workflowLabel: MonitorSchoolDrawerFormatting["workflowLabel"];
  formatDateTime: MonitorSchoolDrawerFormatting["formatDateTime"];
}

export function buildMonitorSchoolDrawerProps({
  isOpen,
  showNavigatorManual,
  isMobileViewport,
  activeTopNavigator,
  activeSchoolDrawerTab,
  selectedSchoolDrawerYear,
  availableSchoolDrawerYears,
  highlightedDrawerIndicatorKey,
  expandedDrawerIndicatorRows,
  syncedCountsLoadingSchoolKey,
  syncedCountsError,
  isSchoolDrawerSubmissionsLoading,
  schoolDrawerSubmissionsError,
  schoolDetail,
  schoolDrawerSnapshotSummary,
  schoolDrawerYearDetail,
  schoolDrawerHistorySummary,
  schoolDrawerCriticalAlerts,
  schoolIndicatorPackageRows,
  latestSchoolPackage,
  schoolIndicatorMatrix,
  latestSchoolIndicatorYear,
  schoolDrawerIndicatorSubmissions,
  schoolIndicatorRowsByCategory,
  missingDrawerIndicatorKeys,
  returnedDrawerIndicatorKeys,
  missingDrawerIndicatorKeySet,
  returnedDrawerIndicatorKeySet,
  setActiveSchoolDrawerTab,
  setSelectedSchoolDrawerYear,
  closeSchoolDrawer,
  handleJumpToMissingIndicators,
  handleJumpToReturnedIndicators,
  toggleDrawerIndicatorLabel,
  workflowTone,
  workflowLabel,
  formatDateTime,
}: BuildMonitorSchoolDrawerPropsArgs): MonitorSchoolDrawerProps {
  return {
    viewState: {
      isOpen,
      showNavigatorManual,
      isMobileViewport,
      activeTopNavigator,
      activeSchoolDrawerTab,
      selectedSchoolDrawerYear,
      highlightedDrawerIndicatorKey,
      expandedDrawerIndicatorRows,
    },
    loadingState: {
      syncedCountsLoadingSchoolKey,
      syncedCountsError,
      isSchoolDrawerSubmissionsLoading,
      schoolDrawerSubmissionsError,
    },
    data: {
      schoolDetail,
      availableSchoolDrawerYears,
      schoolDrawerSnapshotSummary,
      schoolDrawerYearDetail,
      schoolDrawerHistorySummary,
      schoolDrawerCriticalAlerts,
      schoolIndicatorPackageRows,
      latestSchoolPackage,
      schoolIndicatorMatrix,
      latestSchoolIndicatorYear,
      schoolDrawerIndicatorSubmissions,
      schoolIndicatorRowsByCategory,
      missingDrawerIndicatorKeys,
      returnedDrawerIndicatorKeys,
      missingDrawerIndicatorKeySet,
      returnedDrawerIndicatorKeySet,
    },
    actions: {
      setActiveSchoolDrawerTab,
      setSelectedSchoolDrawerYear,
      closeSchoolDrawer,
      handleJumpToMissingIndicators,
      handleJumpToReturnedIndicators,
      toggleDrawerIndicatorLabel,
    },
    formatting: {
      workflowTone,
      workflowLabel,
      formatDateTime,
    },
  };
}
