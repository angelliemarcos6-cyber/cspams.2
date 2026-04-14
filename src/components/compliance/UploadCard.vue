<template>
  <article
    class="rounded-3xl border border-slate-200 bg-white p-12 shadow-sm transition"
    :class="[
      dragActive && !disabled ? 'border-emerald-400 bg-emerald-50/60' : '',
      disabled ? 'opacity-70' : 'hover:border-emerald-300 hover:shadow-md',
    ]"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      :accept="accept"
      :disabled="disabled || uploading"
      @change="onInputChange"
    />

    <div class="mx-auto flex max-w-3xl flex-col items-center text-center">
      <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 24 24" class="h-10 w-10" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 15V4m0 0l-4 4m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke-linecap="round" />
        </svg>
      </div>

      <h3 class="mt-6 text-2xl font-bold text-slate-900">{{ title }}</h3>
      <p class="mt-3 text-base text-slate-600">{{ description }}</p>
      <p class="mt-2 text-sm text-slate-500">{{ acceptedLabel }}</p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          :disabled="disabled || uploading"
          class="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-600 px-6 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          @click="openPicker"
        >
          {{ uploading ? "Uploading..." : "Upload File" }}
        </button>
        <button
          v-if="fileName"
          type="button"
          class="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          @click="emit('download')"
        >
          Download Current
        </button>
      </div>

      <div v-if="fileName" class="mt-6 w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left">
        <p class="text-sm font-semibold text-slate-900">{{ fileName }}</p>
        <p class="mt-1 text-sm text-slate-600">
          <span v-if="fileSize">{{ fileSize }} | </span>{{ uploadedAt || "Uploaded file is available." }}
        </p>
      </div>

      <p
        class="mt-6 rounded-2xl px-4 py-2 text-sm font-semibold"
        :class="submitted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'"
      >
        {{ submitted ? "Submitted" : "Not Submitted" }}
      </p>

      <p v-if="error" class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
        {{ error }}
      </p>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    accept?: string;
    acceptedLabel?: string;
    fileName?: string | null;
    fileSize?: string | null;
    uploadedAt?: string | null;
    submitted?: boolean;
    uploading?: boolean;
    disabled?: boolean;
    error?: string | null;
  }>(),
  {
    description: "Drag and drop your file here or upload from your device.",
    accept: ".pdf,.doc,.docx,.xls,.xlsx",
    acceptedLabel: "Accepted: PDF, DOC, DOCX, XLS, XLSX",
    fileName: null,
    fileSize: null,
    uploadedAt: null,
    submitted: false,
    uploading: false,
    disabled: false,
    error: null,
  },
);

const emit = defineEmits<{
  (e: "upload", file: File): void;
  (e: "download"): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const dragActive = ref(false);

function emitFirstFile(files: FileList | null): void {
  if (!files || files.length === 0 || props.disabled || props.uploading) {
    return;
  }
  emit("upload", files[0] as File);
}

function openPicker(): void {
  if (props.disabled || props.uploading) {
    return;
  }
  fileInputRef.value?.click();
}

function onInputChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  emitFirstFile(target.files);
  target.value = "";
}

function onDragOver(): void {
  if (props.disabled || props.uploading) {
    return;
  }
  dragActive.value = true;
}

function onDragLeave(): void {
  dragActive.value = false;
}

function onDrop(event: DragEvent): void {
  dragActive.value = false;
  emitFirstFile(event.dataTransfer?.files ?? null);
}

defineExpose({ openPicker });

const acceptedLabel = computed(() => props.acceptedLabel);
</script>
