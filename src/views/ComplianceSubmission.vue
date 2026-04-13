<template>
  <div class="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30">
    <ComplianceHeader
      :school-name="schoolName"
      :school-code="schoolCode"
      :package-title="packageTitle"
      :progress-percent="resolvedProgressPercent"
      :submit-disabled="submitDisabled || isSubmittingPackage"
      :submitting="isSubmittingPackage"
      @submit="emit('submit-package')"
    />

    <main class="mx-auto max-w-[1440px] px-4 pb-44 pt-40 sm:px-6 lg:px-8">
      <ProgressSummary
        :indicators-complete="indicatorsComplete"
        :indicators-total="indicatorsTotal"
        :indicators-missing="indicatorsMissing"
        :bmef-submitted="bmef.submitted"
        :smea-submitted="smea.submitted"
        @open-indicators="scrollToSection('indicators')"
        @upload-bmef="scrollToSection('bmef')"
        @upload-smea="scrollToSection('smea')"
      />

      <section
        id="indicators"
        ref="indicatorsSectionRef"
        class="mt-10 scroll-mt-40 space-y-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Section 1</p>
            <h2 class="mt-1 text-2xl font-bold text-slate-900">School Indicators</h2>
            <p class="mt-2 text-sm text-slate-600">One combined workspace for achievements and key performance indicators.</p>
          </div>

          <div class="w-full max-w-xl">
            <label for="indicator-search" class="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Search indicators
            </label>
            <input
              id="indicator-search"
              type="text"
              :value="searchQuery"
              placeholder="Search by code, indicator, or value..."
              class="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-lg text-slate-900 shadow-sm transition placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p class="text-sm font-medium text-slate-700">
            {{ indicatorsComplete }}/{{ indicatorsTotal }} complete
            <span class="mx-2 text-slate-400">|</span>
            {{ indicatorsMissing }} missing
          </p>
          <button
            type="button"
            class="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            @click="emit('toggle-missing-filter')"
          >
            {{ showOnlyMissingRows ? "Show All Rows" : "Show Missing Only" }}
          </button>
        </div>

        <IndicatorsTable
          :columns="indicatorColumns"
          :rows="indicatorRows"
          :search-term="searchQuery"
          :show-only-missing="showOnlyMissingRows"
          :empty-message="tableEmptyMessage"
          @update-cell="emit('update-cell', $event)"
          @blur-cell="emit('blur-cell', $event)"
        />
      </section>

      <section id="bmef" ref="bmefSectionRef" class="mt-12 scroll-mt-40 space-y-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Section 2</p>
          <h2 class="mt-1 text-2xl font-bold text-slate-900">BMEF Upload</h2>
        </div>

        <UploadCard
          title="BMEF Document Upload"
          description="Upload the completed BMEF file for the selected package."
          :submitted="bmef.submitted"
          :uploading="bmef.uploading"
          :disabled="bmef.disabled"
          :file-name="bmef.fileName"
          :file-size="bmef.fileSize"
          :uploaded-at="bmef.uploadedAt"
          :error="bmef.error"
          @upload="emit('upload-bmef', $event)"
          @download="emit('download-bmef')"
        />
      </section>

      <section id="smea" ref="smeaSectionRef" class="mt-12 scroll-mt-40 space-y-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Section 3</p>
          <h2 class="mt-1 text-2xl font-bold text-slate-900">SMEA Upload</h2>
        </div>

        <UploadCard
          title="SMEA Document Upload"
          description="Upload the completed SMEA file for the selected package."
          :submitted="smea.submitted"
          :uploading="smea.uploading"
          :disabled="smea.disabled"
          :file-name="smea.fileName"
          :file-size="smea.fileSize"
          :uploaded-at="smea.uploadedAt"
          :error="smea.error"
          @upload="emit('upload-smea', $event)"
          @download="emit('download-smea')"
        />
      </section>
    </main>

    <footer class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <p class="text-sm font-medium text-slate-600">
          Keep drafts updated before final submission to monitor review.
        </p>

        <div class="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            :disabled="saveDisabled || isSavingDraft"
            class="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            @click="emit('save-draft')"
          >
            {{ isSavingDraft ? "Saving..." : "Save Draft" }}
          </button>
          <button
            type="button"
            :disabled="submitDisabled || isSubmittingPackage"
            class="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-8 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            @click="emit('submit-package')"
          >
            {{ isSubmittingPackage ? "Submitting..." : "Submit Package for Monitor Review" }}
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ComplianceHeader from "@/components/compliance/ComplianceHeader.vue";
import IndicatorsTable from "@/components/compliance/IndicatorsTable.vue";
import ProgressSummary from "@/components/compliance/ProgressSummary.vue";
import UploadCard from "@/components/compliance/UploadCard.vue";

interface IndicatorColumn {
  id: string;
  label: string;
  subLabel?: string;
}

interface IndicatorCell {
  id: string;
  columnId: string;
  value: string | number | null;
  inputType?: "text" | "number" | "select";
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  missing?: boolean;
}

interface IndicatorRow {
  id: string;
  code: string;
  label: string;
  group: string;
  required?: boolean;
  missing?: boolean;
  helperText?: string;
  cells: IndicatorCell[];
}

interface UploadState {
  submitted: boolean;
  uploading?: boolean;
  disabled?: boolean;
  fileName?: string | null;
  fileSize?: string | null;
  uploadedAt?: string | null;
  error?: string | null;
}

const props = withDefaults(
  defineProps<{
    schoolName: string;
    schoolCode: string;
    packageTitle?: string;
    progressPercent?: number;
    indicatorsComplete: number;
    indicatorsTotal: number;
    indicatorsMissing: number;
    indicatorColumns: IndicatorColumn[];
    indicatorRows: IndicatorRow[];
    searchQuery?: string;
    showOnlyMissingRows?: boolean;
    tableEmptyMessage?: string;
    isSavingDraft?: boolean;
    isSubmittingPackage?: boolean;
    saveDisabled?: boolean;
    submitDisabled?: boolean;
    bmef: UploadState;
    smea: UploadState;
  }>(),
  {
    packageTitle: "2025-2026 Annual Compliance Package",
    progressPercent: undefined,
    searchQuery: "",
    showOnlyMissingRows: false,
    tableEmptyMessage: "No indicators found.",
    isSavingDraft: false,
    isSubmittingPackage: false,
    saveDisabled: false,
    submitDisabled: false,
  },
);

const emit = defineEmits<{
  (e: "update:searchQuery", value: string): void;
  (e: "toggle-missing-filter"): void;
  (
    e: "update-cell",
    payload: { rowId: string; columnId: string; cellId: string; value: string },
  ): void;
  (e: "blur-cell", payload: { rowId: string; columnId: string; cellId: string }): void;
  (e: "upload-bmef", file: File): void;
  (e: "upload-smea", file: File): void;
  (e: "download-bmef"): void;
  (e: "download-smea"): void;
  (e: "save-draft"): void;
  (e: "submit-package"): void;
}>();

const indicatorsSectionRef = ref<HTMLElement | null>(null);
const bmefSectionRef = ref<HTMLElement | null>(null);
const smeaSectionRef = ref<HTMLElement | null>(null);

const resolvedProgressPercent = computed(() => {
  if (typeof props.progressPercent === "number") {
    return props.progressPercent;
  }
  if (props.indicatorsTotal <= 0) {
    return 0;
  }
  return (props.indicatorsComplete / props.indicatorsTotal) * 100;
});

function scrollToSection(target: "indicators" | "bmef" | "smea"): void {
  const map = {
    indicators: indicatorsSectionRef.value,
    bmef: bmefSectionRef.value,
    smea: smeaSectionRef.value,
  } as const;

  const node = map[target];
  if (!node) {
    return;
  }

  const offset = 112;
  const top = node.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}
</script>
