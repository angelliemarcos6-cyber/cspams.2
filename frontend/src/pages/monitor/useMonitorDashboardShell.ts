import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const MONITOR_NAV_STORAGE_KEY = "cspams.monitor.nav.v1";
const ADVANCED_ANALYTICS_HIDE_MS = 240;
const MOBILE_BREAKPOINT = 768;

type ToastTone = "success" | "info" | "warning";

interface DashboardToast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface UseMonitorDashboardShellResult {
  isNavigatorCompact: boolean;
  setIsNavigatorCompact: Dispatch<SetStateAction<boolean>>;
  isNavigatorVisible: boolean;
  setIsNavigatorVisible: Dispatch<SetStateAction<boolean>>;
  isMobileViewport: boolean;
  showNavigatorManual: boolean;
  setShowNavigatorManual: Dispatch<SetStateAction<boolean>>;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: Dispatch<SetStateAction<boolean>>;
  showAdvancedAnalytics: boolean;
  setShowAdvancedAnalytics: Dispatch<SetStateAction<boolean>>;
  showHelpDialog: boolean;
  setShowHelpDialog: Dispatch<SetStateAction<boolean>>;
  showMfaResetApprovalsDialog: boolean;
  setShowMfaResetApprovalsDialog: Dispatch<SetStateAction<boolean>>;
  renderAdvancedAnalytics: boolean;
  isHidingAdvancedAnalytics: boolean;
  focusedSectionId: string | null;
  setFocusedSectionId: Dispatch<SetStateAction<string | null>>;
  showMoreFilters: boolean;
  setShowMoreFilters: Dispatch<SetStateAction<boolean>>;
  toasts: DashboardToast[];
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
  focusAndScrollTo: (targetId: string) => void;
  sectionFocusClass: (targetId: string) => string;
}

export function useMonitorDashboardShell(): UseMonitorDashboardShellResult {
  const [isNavigatorCompact, setIsNavigatorCompact] = useState(false);
  const [isNavigatorVisible, setIsNavigatorVisible] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= MOBILE_BREAKPOINT,
  );
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  );
  const [showNavigatorManual, setShowNavigatorManual] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showMfaResetApprovalsDialog, setShowMfaResetApprovalsDialog] = useState(false);
  const [renderAdvancedAnalytics, setRenderAdvancedAnalytics] = useState(false);
  const [isHidingAdvancedAnalytics, setIsHidingAdvancedAnalytics] = useState(false);
  const [focusedSectionId, setFocusedSectionId] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const timerIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    return () => {
      timerIdsRef.current.forEach((id) => window.clearTimeout(id));
      timerIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncViewport = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (showAdvancedAnalytics) {
      setRenderAdvancedAnalytics(true);
      setIsHidingAdvancedAnalytics(false);
      return;
    }

    if (!renderAdvancedAnalytics) {
      return;
    }

    setIsHidingAdvancedAnalytics(true);

    if (typeof window === "undefined") {
      setRenderAdvancedAnalytics(false);
      setIsHidingAdvancedAnalytics(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setRenderAdvancedAnalytics(false);
      setIsHidingAdvancedAnalytics(false);
    }, ADVANCED_ANALYTICS_HIDE_MS);

    return () => window.clearTimeout(timeout);
  }, [renderAdvancedAnalytics, showAdvancedAnalytics]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(MONITOR_NAV_STORAGE_KEY);
      if (!raw) return;
      const persisted = JSON.parse(raw) as { compact?: boolean; visible?: boolean };
      if (typeof persisted.compact === "boolean") {
        setIsNavigatorCompact(persisted.compact);
      }
      if (typeof persisted.visible === "boolean") {
        setIsNavigatorVisible(persisted.visible);
      }
    } catch {
      // Ignore invalid persisted navigator state.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        MONITOR_NAV_STORAGE_KEY,
        JSON.stringify({ compact: isNavigatorCompact, visible: isNavigatorVisible }),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [isNavigatorCompact, isNavigatorVisible]);

  const clearFocusAfterDelay = (targetId: string) => {
    if (typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      timerIdsRef.current.delete(id);
      setFocusedSectionId((current) => (current === targetId ? null : current));
    }, 3000);
    timerIdsRef.current.add(id);
  };

  const focusAndScrollTo = (targetId: string) => {
    if (typeof document === "undefined") return;
    const section = document.getElementById(targetId);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusedSectionId(targetId);
    clearFocusAfterDelay(targetId);
  };

  const sectionFocusClass = (targetId: string) => (focusedSectionId === targetId ? "dashboard-focus-glow" : "");

  const pushToast = (message: string, tone: ToastTone = "info") => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id: toastId, message, tone }]);
    const id = window.setTimeout(() => {
      timerIdsRef.current.delete(id);
      setToasts((current) => current.filter((item) => item.id !== toastId));
    }, 3200);
    timerIdsRef.current.add(id);
  };

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  return {
    isNavigatorCompact,
    setIsNavigatorCompact,
    isNavigatorVisible,
    setIsNavigatorVisible,
    isMobileViewport,
    showNavigatorManual,
    setShowNavigatorManual,
    showAdvancedFilters,
    setShowAdvancedFilters,
    showAdvancedAnalytics,
    setShowAdvancedAnalytics,
    showHelpDialog,
    setShowHelpDialog,
    showMfaResetApprovalsDialog,
    setShowMfaResetApprovalsDialog,
    renderAdvancedAnalytics,
    isHidingAdvancedAnalytics,
    focusedSectionId,
    setFocusedSectionId,
    showMoreFilters,
    setShowMoreFilters,
    toasts,
    pushToast,
    dismissToast,
    focusAndScrollTo,
    sectionFocusClass,
  };
}
