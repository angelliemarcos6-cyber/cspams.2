<template>
  <div class="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
    <table class="min-w-[1120px] w-full border-separate border-spacing-0">
      <thead>
        <tr class="bg-gray-50">
          <th class="sticky left-0 z-20 border-b border-slate-200 bg-gray-50 px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Indicator
          </th>
          <th class="border-b border-slate-200 px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Group
          </th>
          <th
            v-for="column in columns"
            :key="column.id"
            class="border-b border-slate-200 px-8 py-5 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"
          >
            <span>{{ column.label }}</span>
            <span v-if="column.subLabel" class="ml-2 font-medium normal-case tracking-normal text-slate-400">
              {{ column.subLabel }}
            </span>
          </th>
        </tr>
      </thead>

      <tbody v-if="filteredRows.length > 0">
        <tr
          v-for="row in filteredRows"
          :key="row.id"
          class="transition-colors hover:bg-emerald-50"
          :class="row.missing ? 'bg-red-50/40' : ''"
        >
          <td class="sticky left-0 z-10 border-b border-slate-100 bg-white px-8 py-7 align-top" :class="row.missing ? 'bg-red-50/40' : ''">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{{ row.code }}</p>
              <p class="text-base font-semibold text-slate-900">{{ row.label }}</p>
              <p
                v-if="row.required"
                class="inline-flex rounded-2xl bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700"
              >
                Required
              </p>
              <p v-if="row.helperText" class="text-sm text-slate-500">{{ row.helperText }}</p>
            </div>
          </td>

          <td class="border-b border-slate-100 px-8 py-7 align-top">
            <p class="inline-flex rounded-2xl bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
              {{ groupLabel(row.group) }}
            </p>
          </td>

          <td
            v-for="column in columns"
            :key="`${row.id}:${column.id}`"
            class="border-b border-slate-100 px-8 py-7 align-top"
          >
            <template v-for="cell in [getCell(row, column.id)]" :key="`${row.id}:${column.id}:cell`">
              <template v-if="cell">
                <div v-if="cell.readOnly" class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-lg font-semibold text-slate-700">
                  {{ cell.value || "Auto" }}
                </div>

                <select
                  v-else-if="cell.inputType === 'select'"
                  :value="stringValue(cell.value)"
                  :disabled="cell.disabled"
                  :class="inputClass(cell)"
                  @change="onCellInput(row.id, column.id, cell.id, ($event.target as HTMLSelectElement).value)"
                  @blur="emit('blur-cell', { rowId: row.id, columnId: column.id, cellId: cell.id })"
                >
                  <option value="">Select</option>
                  <option
                    v-for="option in cell.options ?? []"
                    :key="`${cell.id}:${option.value}`"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>

                <input
                  v-else
                  type="text"
                  :value="stringValue(cell.value)"
                  :placeholder="cell.placeholder"
                  :disabled="cell.disabled"
                  :class="inputClass(cell)"
                  @input="onCellInput(row.id, column.id, cell.id, ($event.target as HTMLInputElement).value)"
                  @blur="emit('blur-cell', { rowId: row.id, columnId: column.id, cellId: cell.id })"
                />
              </template>

              <p v-else class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-500">N/A</p>
            </template>
          </td>
        </tr>
      </tbody>

      <tbody v-else>
        <tr>
          <td :colspan="columns.length + 2" class="px-8 py-16 text-center text-sm font-medium text-slate-500">
            {{ emptyMessage }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface SelectOption {
  label: string;
  value: string;
}

export interface IndicatorColumn {
  id: string;
  label: string;
  subLabel?: string;
}

export interface IndicatorCell {
  id: string;
  value: string | number | null;
  inputType?: "text" | "number" | "select";
  options?: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  missing?: boolean;
}

export interface IndicatorRow {
  id: string;
  code: string;
  label: string;
  group: string;
  required?: boolean;
  missing?: boolean;
  helperText?: string;
  cells: Array<IndicatorCell & { columnId: string }>;
}

const props = withDefaults(
  defineProps<{
    columns: IndicatorColumn[];
    rows: IndicatorRow[];
    searchTerm?: string;
    showOnlyMissing?: boolean;
    emptyMessage?: string;
  }>(),
  {
    searchTerm: "",
    showOnlyMissing: false,
    emptyMessage: "No indicators match your current filters.",
  },
);

const emit = defineEmits<{
  (e: "update-cell", payload: { rowId: string; columnId: string; cellId: string; value: string }): void;
  (e: "blur-cell", payload: { rowId: string; columnId: string; cellId: string }): void;
}>();

const filteredRows = computed(() => {
  const needle = props.searchTerm.trim().toLowerCase();
  return props.rows.filter((row) => {
    if (props.showOnlyMissing && !row.missing) {
      return false;
    }

    if (!needle) {
      return true;
    }

    const inMeta = `${row.code} ${row.label} ${row.group}`.toLowerCase().includes(needle);
    if (inMeta) {
      return true;
    }

    return row.cells.some((cell) => String(cell.value ?? "").toLowerCase().includes(needle));
  });
});

function getCell(row: IndicatorRow, columnId: string): (IndicatorCell & { columnId: string }) | undefined {
  return row.cells.find((cell) => cell.columnId === columnId);
}

function onCellInput(rowId: string, columnId: string, cellId: string, value: string): void {
  emit("update-cell", { rowId, columnId, cellId, value });
}

function inputClass(cell: IndicatorCell): string {
  return [
    "w-full rounded-2xl border px-4 py-4 text-lg leading-tight shadow-sm transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
    cell.disabled
      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
      : "border-slate-300 bg-white text-slate-900 hover:border-emerald-300",
    cell.required && cell.missing ? "border-red-300 bg-red-50 text-red-900" : "",
  ]
    .join(" ")
    .trim();
}

function groupLabel(group: string): string {
  if (group === "achievements") return "School Achievements";
  if (group === "key_performance") return "Key Performance";
  return group;
}

function stringValue(value: string | number | null): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
</script>
