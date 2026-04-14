import { useEffect, useRef, useState } from "react";
import type { StudentDataContextType } from "@/context/StudentData";
import type { TeacherDataContextType } from "@/context/TeacherData";
import type { MonitorTopNavigatorId } from "./monitorFilters";

export interface MonitorRadarTotals {
  students: number;
  teachers: number;
  syncedAt: string | null;
  isLoading: boolean;
  error: string;
}

interface UseMonitorRadarTotalsArgs {
  authSessionKey: string;
  activeTopNavigator: MonitorTopNavigatorId;
  showNavigatorManual: boolean;
  scopedSchoolCodes: string[] | null;
  radarTotalsTick: number;
  queryStudents: StudentDataContextType["queryStudents"];
  listTeachers: TeacherDataContextType["listTeachers"];
}

interface UseMonitorRadarTotalsResult {
  monitorRadarTotals: MonitorRadarTotals;
}

const EMPTY_MONITOR_RADAR_TOTALS: MonitorRadarTotals = {
  students: 0,
  teachers: 0,
  syncedAt: null,
  isLoading: false,
  error: "",
};

export function useMonitorRadarTotals({
  authSessionKey,
  activeTopNavigator,
  showNavigatorManual,
  scopedSchoolCodes,
  radarTotalsTick,
  queryStudents,
  listTeachers,
}: UseMonitorRadarTotalsArgs): UseMonitorRadarTotalsResult {
  const [monitorRadarTotals, setMonitorRadarTotals] = useState<MonitorRadarTotals>(EMPTY_MONITOR_RADAR_TOTALS);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, [authSessionKey]);

  useEffect(() => {
    const shouldSyncRadarTotals = !showNavigatorManual && activeTopNavigator === "schools";
    if (!shouldSyncRadarTotals) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    let active = true;

    const hydrateRadarTotals = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setMonitorRadarTotals((current) => ({
        ...current,
        isLoading: true,
        error: "",
      }));

      try {
        const [studentsResult, teachersResult] = await Promise.all([
          queryStudents({
            page: 1,
            perPage: 1,
            schoolCodes: scopedSchoolCodes,
            academicYear: "all",
            signal: controller.signal,
          }),
          listTeachers({
            page: 1,
            perPage: 1,
            schoolCodes: scopedSchoolCodes,
            signal: controller.signal,
          }),
        ]);

        if (!active || controller.signal.aborted) {
          return;
        }

        setMonitorRadarTotals({
          students: Number(studentsResult.meta.total ?? studentsResult.meta.recordCount ?? 0),
          teachers: Number(teachersResult.meta.total ?? teachersResult.meta.recordCount ?? 0),
          syncedAt: new Date().toISOString(),
          isLoading: false,
          error: "",
        });
      } catch (err) {
        if (!active) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setMonitorRadarTotals((current) => ({
          ...current,
          isLoading: false,
          error: err instanceof Error ? err.message : "Unable to sync totals.",
        }));
      } finally {
        if (active && abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    };

    void hydrateRadarTotals();

    return () => {
      active = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [activeTopNavigator, listTeachers, queryStudents, radarTotalsTick, scopedSchoolCodes, showNavigatorManual]);

  return { monitorRadarTotals };
}
