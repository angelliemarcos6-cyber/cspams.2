import { useEffect, useRef, useState } from "react";
import type { StudentDataContextType } from "@/context/StudentData";
import type { TeacherDataContextType } from "@/context/TeacherData";
import type { MonitorTopNavigatorId } from "./monitorFilters";

export interface MonitorRadarTotals {
  students: number | null;
  teachers: number | null;
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
  students: null,
  teachers: null,
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
        const [studentsResult, teachersResult] = await Promise.allSettled([
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

        const nextErrorMessages: string[] = [];
        const nextSyncedAt = new Date().toISOString();

        setMonitorRadarTotals((current) => {
          const nextStudents =
            studentsResult.status === "fulfilled"
              ? Number(studentsResult.value.meta.total ?? studentsResult.value.meta.recordCount ?? 0)
              : current.students;
          const nextTeachers =
            teachersResult.status === "fulfilled"
              ? Number(teachersResult.value.meta.total ?? teachersResult.value.meta.recordCount ?? 0)
              : current.teachers;

          if (studentsResult.status === "rejected") {
            const studentMessage =
              studentsResult.reason instanceof Error ? studentsResult.reason.message : "Unexpected student totals error.";
            nextErrorMessages.push(`Student totals unavailable: ${studentMessage}`);
          }

          if (teachersResult.status === "rejected") {
            const teacherMessage =
              teachersResult.reason instanceof Error ? teachersResult.reason.message : "Unexpected teacher totals error.";
            nextErrorMessages.push(`Teacher totals unavailable: ${teacherMessage}`);
          }

          return {
            students: nextStudents,
            teachers: nextTeachers,
            syncedAt:
              studentsResult.status === "fulfilled" || teachersResult.status === "fulfilled"
                ? nextSyncedAt
                : current.syncedAt,
            isLoading: false,
            error: nextErrorMessages.join(" "),
          };
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
