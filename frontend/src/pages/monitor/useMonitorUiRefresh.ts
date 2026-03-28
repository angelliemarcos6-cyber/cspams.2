import { useEffect, useRef, useState } from "react";

export interface MonitorUiRealtimeUpdate {
  entity: string;
  schoolId: string;
  schoolCode: string;
  occurredAt: number;
}

export interface UseMonitorUiRefreshResult {
  studentLookupTick: number;
  teacherLookupTick: number;
  radarTotalsTick: number;
  latestRealtimeUpdate: MonitorUiRealtimeUpdate | null;
}

interface PendingRealtimeState {
  studentLookup: boolean;
  teacherLookup: boolean;
  radarTotals: boolean;
  latest: MonitorUiRealtimeUpdate | null;
}

const UI_REFRESH_DEBOUNCE_MS = 120;

export function useMonitorUiRefresh(): UseMonitorUiRefreshResult {
  const [studentLookupTick, setStudentLookupTick] = useState(0);
  const [teacherLookupTick, setTeacherLookupTick] = useState(0);
  const [radarTotalsTick, setRadarTotalsTick] = useState(0);
  const [latestRealtimeUpdate, setLatestRealtimeUpdate] = useState<MonitorUiRealtimeUpdate | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingRealtimeState>({
    studentLookup: false,
    teacherLookup: false,
    radarTotals: false,
    latest: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const flushPending = () => {
      flushTimeoutRef.current = null;

      const pending = pendingRef.current;
      if (pending.studentLookup) {
        setStudentLookupTick((current) => current + 1);
      }
      if (pending.teacherLookup) {
        setTeacherLookupTick((current) => current + 1);
      }
      if (pending.radarTotals) {
        setRadarTotalsTick((current) => current + 1);
      }
      if (pending.latest) {
        setLatestRealtimeUpdate(pending.latest);
      }

      pendingRef.current = {
        studentLookup: false,
        teacherLookup: false,
        radarTotals: false,
        latest: null,
      };
    };

    const handleRealtimeUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{ entity?: string; schoolId?: string; schoolCode?: string }>).detail;
      if (!payload?.entity) {
        return;
      }

      const entity = String(payload.entity).trim();
      if (!entity) {
        return;
      }

      const pending = pendingRef.current;

      if (entity === "students" || entity === "dashboard" || entity === "school_records") {
        pending.studentLookup = true;
      }
      if (entity === "teachers" || entity === "dashboard" || entity === "school_records") {
        pending.teacherLookup = true;
      }
      if (entity === "students" || entity === "teachers" || entity === "dashboard") {
        pending.radarTotals = true;
      }

      pending.latest = {
        entity,
        schoolId: String(payload.schoolId ?? "").trim(),
        schoolCode: String(payload.schoolCode ?? "").trim().toUpperCase(),
        occurredAt: Date.now(),
      };

      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
      }
      flushTimeoutRef.current = window.setTimeout(flushPending, UI_REFRESH_DEBOUNCE_MS);
    };

    window.addEventListener("cspams:update", handleRealtimeUpdate);

    return () => {
      if (flushTimeoutRef.current !== null) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      window.removeEventListener("cspams:update", handleRealtimeUpdate);
    };
  }, []);

  return {
    studentLookupTick,
    teacherLookupTick,
    radarTotalsTick,
    latestRealtimeUpdate,
  };
}
