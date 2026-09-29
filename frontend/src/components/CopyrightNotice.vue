<script setup>
/**
 * 版权温馨提示 —— 首次使用网页解析功能时弹出
 */
import { NModal } from 'naive-ui';
import { ShieldAlert, X, Check } from 'lucide-vue-next';

defineProps({ show: Boolean });
defineEmits(['update:show', 'acknowledge']);
</script>

<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" :auto-focus="false" :mask-closable="false">
    <div class="modal-vintage p-8 w-[480px] max-w-[calc(100vw-32px)] relative">
      <div class="paper-tape-modal"></div>

      <div class="flex items-center justify-between mb-5">
        <h2 class="ts-heading text-xl flex items-center gap-2">
          <ShieldAlert class="w-5 h-5" />
          版权温馨提示
        </h2>
        <button class="ts-modal-close" aria-label="关闭" @click="$emit('update:show', false)">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="ts-preview-box p-4 mb-5">
        <p class="ts-body text-sm leading-relaxed">
          网页解析功能仅用于<b>个人学习与旅行素材收藏</b>：
        </p>
        <ul class="ts-body text-sm mt-2 space-y-1.5 list-disc pl-5">
          <li>抓取的内容请遵守原网站版权协议</li>
          <li>请勿将抓取内容用于任何商业用途</li>
          <li>请勿高频批量抓取，尊重目标服务器资源</li>
        </ul>
      </div>

      <div class="flex justify-end gap-3">
        <button class="ts-btn-secondary" @click="$emit('update:show', false)">
          <X class="w-4 h-4" /><span>取消</span>
        </button>
        <button class="ts-btn-primary" @click="$emit('acknowledge')">
          <Check class="w-4 h-4" /><span>我已知晓并同意</span>
        </button>
      </div>
    </div>
  </NModal>
</template>
