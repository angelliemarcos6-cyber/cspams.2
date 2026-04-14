import type { SchoolRecord, SchoolStatus } from "@/types";

export interface RegionAggregate {
  region: string;
  schools: number;
  activeSchools: number;
  students: number;
  teachers: number;
}

export function statusLabel(status: SchoolStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildRegionAggregates(records: SchoolRecord[]): RegionAggregate[] {
  const map = new Map<string, RegionAggregate>();

  for (const record of records) {
    const existing = map.get(record.region) ?? {
      region: record.region,
      schools: 0,
      activeSchools: 0,
      students: 0,
      teachers: 0,
    };

    existing.schools += 1;
    existing.activeSchools += record.status === "active" ? 1 : 0;
    existing.students += record.studentCount;
    existing.teachers += record.teacherCount;

    map.set(record.region, existing);
  }

  return [...map.values()].sort((a, b) => a.region.localeCompare(b.region));
}

export function buildStatusDistribution(records: SchoolRecord[]) {
  const base: Record<SchoolStatus, number> = {
    active: 0,
    inactive: 0,
    pending: 0,
  };

  for (const record of records) {
    base[record.status] += 1;
  }

  return [
    { name: "Active", key: "active", value: base.active, color: "#04508C" },
    { name: "Inactive", key: "inactive", value: base.inactive, color: "#94A3B8" },
    { name: "Pending", key: "pending", value: base.pending, color: "#649DD8" },
  ];
}

export function buildSubmissionTrend(records: SchoolRecord[], days = 7) {
  const now = new Date();
  const labels: string[] = [];
  const countByDay = new Map<string, number>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    labels.push(key);
    countByDay.set(key, 0);
  }

  for (const record of records) {
    const key = new Date(record.lastUpdated).toISOString().slice(0, 10);
    if (countByDay.has(key)) {
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }
  }

  return labels.map((key) => {
    const [year, month, day] = key.split("-");
    return {
      label: `${month}/${day}`,
      count: countByDay.get(key) ?? 0,
      isoDate: `${year}-${month}-${day}`,
    };
  });
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
