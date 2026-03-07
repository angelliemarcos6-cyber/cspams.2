import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { SchoolRecord } from "@/types";

interface DataContextType {
  records: SchoolRecord[];
  addRecord: (record: Omit<SchoolRecord, "id" | "lastUpdated">) => void;
  updateRecord: (id: string, updates: Omit<SchoolRecord, "id" | "lastUpdated">) => void;
  deleteRecord: (id: string) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
const STORAGE_KEY = "cspams.data.records";

function seedData(): SchoolRecord[] {
  return [
    {
      id: crypto.randomUUID(),
      schoolName: "Santiago City National High School",
      studentCount: 3280,
      teacherCount: 144,
      region: "Cagayan Valley (Region II)",
      status: "active",
      submittedBy: "schoolhead1",
      lastUpdated: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      schoolName: "Santiago South Integrated School",
      studentCount: 2124,
      teacherCount: 103,
      region: "Cagayan Valley (Region II)",
      status: "active",
      submittedBy: "schoolhead2",
      lastUpdated: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      schoolName: "St. Matthew Academy",
      studentCount: 886,
      teacherCount: 42,
      region: "Cagayan Valley (Region II)",
      status: "pending",
      submittedBy: "schoolhead3",
      lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    },
  ];
}

function readRecords(): SchoolRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw) as SchoolRecord[];
    if (!Array.isArray(parsed)) return seedData();
    return parsed;
  } catch {
    return seedData();
  }
}

function writeRecords(records: SchoolRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<SchoolRecord[]>(() => readRecords());

  const addRecord = (record: Omit<SchoolRecord, "id" | "lastUpdated">) => {
    setRecords((prev) => {
      const next = [{ ...record, id: crypto.randomUUID(), lastUpdated: new Date().toISOString() }, ...prev];
      writeRecords(next);
      return next;
    });
  };

  const updateRecord = (id: string, updates: Omit<SchoolRecord, "id" | "lastUpdated">) => {
    setRecords((prev) => {
      const next = prev.map((record) =>
        record.id === id ? { ...record, ...updates, lastUpdated: new Date().toISOString() } : record,
      );
      writeRecords(next);
      return next;
    });
  };

  const deleteRecord = (id: string) => {
    setRecords((prev) => {
      const next = prev.filter((record) => record.id !== id);
      writeRecords(next);
      return next;
    });
  };

  const value = useMemo<DataContextType>(() => ({ records, addRecord, updateRecord, deleteRecord }), [records]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within DataProvider");
  }
  return context;
}
