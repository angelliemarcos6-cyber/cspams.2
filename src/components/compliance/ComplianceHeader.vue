<template>
  <header class="fixed inset-x-0 top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
    <div class="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">School</p>
        <p class="truncate text-xl font-bold text-slate-900">{{ schoolName }}</p>
        <p class="text-sm font-medium text-slate-600">Code: {{ schoolCode }}</p>
      </div>

      <div class="text-left lg:text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Compliance Package</p>
        <h1 class="text-lg font-bold text-slate-900 sm:text-2xl">{{ packageTitle }}</h1>
      </div>

      <div class="flex flex-col gap-3 sm:min-w-[320px] sm:flex-row sm:items-center sm:justify-end">
        <div class="min-w-[170px]">
          <div class="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span>Progress</span>
            <span>{{ clampedProgress }}%</span>
          </div>
          <div class="mt-2 h-2.5 rounded-full bg-slate-200">
            <div
              class="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
              :style="{ width: `${clampedProgress}%` }"
            />
          </div>
        </div>

        <button
          type="button"
          :disabled="submitDisabled || submitting"
          class="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 disabled:cursor-not-allowed disabled:opacity-60"
          @click="emit('submit')"
        >
          {{ submitting ? "Submitting..." : "Submit Package" }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  schoolName: string;
  schoolCode: string;
  packageTitle?: string;
  progressPercent: number;
  submitDisabled?: boolean;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit"): void;
}>();

const clampedProgress = computed(() => Math.max(0, Math.min(100, Math.round(props.progressPercent))));
</script>
