<script setup>
/** 通用确认弹窗（复古纸张风） */
import { NModal } from 'naive-ui';
import { X, Check, TriangleAlert } from 'lucide-vue-next';

defineProps({
  show: Boolean,
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  danger: { type: Boolean, default: false },
});
defineEmits(['update:show', 'confirm']);
</script>

<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" :auto-focus="false">
    <div class="modal-vintage p-7 w-[400px] max-w-[calc(100vw-32px)] relative">
      <div class="paper-tape-modal"></div>
      <div class="flex items-start gap-3 mb-5">
        <TriangleAlert class="w-5 h-5 mt-0.5 shrink-0" :style="{ color: danger ? 'var(--state-error)' : 'var(--state-warning)' }" />
        <div>
          <h3 class="ts-heading text-lg mb-1">{{ title }}</h3>
          <p class="ts-body text-sm">{{ message }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button class="ts-btn-secondary" @click="$emit('update:show', false)">
          <X class="w-4 h-4" /><span>取消</span>
        </button>
        <button
          class="ts-btn-primary"
          :style="danger ? 'background: var(--state-error)' : ''"
          @click="$emit('confirm')"
        >
          <Check class="w-4 h-4" /><span>{{ confirmText }}</span>
        </button>
      </div>
    </div>
  </NModal>
</template>
