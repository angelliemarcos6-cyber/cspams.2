import { useEffect, useRef, useState } from "react";

export interface MonitorUiRealtimeBatch {
  updates: MonitorUiRealtimeTarget[];
  entities: string[];
  schoolIds: string[];
  schoolCodes: string[];
  occurredAt: number;
}

export interface MonitorUiRealtimeTarget {
  entity: string;
  schoolId: string;
  schoolCode: string;
}

export interface UseMonitorUiRefreshResult {
  studentLookupTick: number;
  teacherLookupTick: number;
  radarTotalsTick: number;
  latestRealtimeBatch: MonitorUiRealtimeBatch | null;
}

interface PendingRealtimeState {
  studentLookup: boolean;
  teacherLookup: boolean;
  radarTotals: boolean;
  updates: Map<string, MonitorUiRealtimeTarget>;
  entities: Set<string>;
  schoolIds: Set<string>;
  schoolCodes: Set<string>;
}

const UI_REFRESH_DEBOUNCE_MS = 120;

export function useMonitorUiRefresh(): UseMonitorUiRefreshResult {
  const [studentLookupTick, setStudentLookupTick] = useState(0);
  const [teacherLookupTick, setTeacherLookupTick] = useState(0);
  const [radarTotalsTick, setRadarTotalsTick] = useState(0);
  const [latestRealtimeBatch, setLatestRealtimeBatch] = useState<MonitorUiRealtimeBatch | null>(null);
  const flushTimeoutRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingRealtimeState>({
    studentLookup: false,
    teacherLookup: false,
    radarTotals: false,
    updates: new Map<string, MonitorUiRealtimeTarget>(),
    entities: new Set<string>(),
    schoolIds: new Set<string>(),
    schoolCodes: new Set<string>(),
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
      if (pending.entities.size > 0) {
        setLatestRealtimeBatch({
          updates: Array.from(pending.updates.values()),
          entities: Array.from(pending.entities),
          schoolIds: Array.from(pending.schoolIds),
          schoolCodes: Array.from(pending.schoolCodes),
          occurredAt: Date.now(),
        });
      }

      pendingRef.current = {
        studentLookup: false,
        teacherLookup: false,
        radarTotals: false,
        updates: new Map<string, MonitorUiRealtimeTarget>(),
        entities: new Set<string>(),
        schoolIds: new Set<string>(),
        schoolCodes: new Set<string>(),
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

      if (entity === "students") {
        pending.studentLookup = true;
        pending.radarTotals = true;
      }
      if (entity === "teachers") {
        pending.teacherLookup = true;
        pending.radarTotals = true;
      }
      if (entity === "school_records") {
        pending.studentLookup = true;
        pending.teacherLookup = true;
      }
      if (entity === "dashboard") {
        pending.radarTotals = true;
      }

      pending.entities.add(entity);

      const schoolId = String(payload.schoolId ?? "").trim();
      const schoolCode = String(payload.schoolCode ?? "").trim().toUpperCase();
      pending.updates.set(`${entity}|${schoolId}|${schoolCode}`, {
        entity,
        schoolId,
        schoolCode,
      });
      if (schoolId) {
        pending.schoolIds.add(schoolId);
      }
      if (schoolCode) {
        pending.schoolCodes.add(schoolCode);
      }

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
    latestRealtimeBatch,
  };
}
