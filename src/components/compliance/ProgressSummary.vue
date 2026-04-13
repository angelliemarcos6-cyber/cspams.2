<template>
  <section class="grid gap-5 md:grid-cols-3">
    <button
      type="button"
      class="group rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md"
      @click="emit('open-indicators')"
    >
      <p class="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">I-META Indicators</p>
      <p class="mt-3 text-3xl font-bold text-slate-900">{{ indicatorsComplete }}/{{ indicatorsTotal }}</p>
      <p class="mt-1 text-sm font-medium text-slate-600">
        {{ indicatorsComplete }}/{{ indicatorsTotal }} complete | {{ indicatorsMissing }} missing
      </p>
      <p class="mt-5 text-sm font-semibold text-emerald-700 transition group-hover:text-emerald-800">Open section</p>
    </button>

    <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">BMEF</p>
      <p class="mt-5 text-4xl font-black leading-none text-slate-900">{{ bmefStatusLabel }}</p>
      <p class="mt-2 text-sm font-medium text-slate-600">{{ bmefStatusHelp }}</p>
      <button
        type="button"
        class="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        @click="emit('upload-bmef')"
      >
        Upload
      </button>
    </div>

    <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <p class="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">SMEA</p>
      <p class="mt-5 text-4xl font-black leading-none text-slate-900">{{ smeaStatusLabel }}</p>
      <p class="mt-2 text-sm font-medium text-slate-600">{{ smeaStatusHelp }}</p>
      <button
        type="button"
        class="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
        @click="emit('upload-smea')"
      >
        Upload
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  indicatorsComplete: number;
  indicatorsTotal: number;
  indicatorsMissing: number;
  bmefSubmitted: boolean;
  smeaSubmitted: boolean;
}>();

const emit = defineEmits<{
  (e: "open-indicators"): void;
  (e: "upload-bmef"): void;
  (e: "upload-smea"): void;
}>();

const bmefStatusLabel = computed(() => (props.bmefSubmitted ? "Submitted" : "Not Submitted"));
const smeaStatusLabel = computed(() => (props.smeaSubmitted ? "Submitted" : "Not Submitted"));

const bmefStatusHelp = computed(() =>
  props.bmefSubmitted ? "Latest BMEF file is ready for review." : "Upload BMEF document to complete this section.",
);
const smeaStatusHelp = computed(() =>
  props.smeaSubmitted ? "Latest SMEA file is ready for review." : "Upload SMEA document to complete this section.",
);
</script>
