<script setup>
/**
 * 打包导出弹窗
 * - 导出格式：ZIP 素材包 / 单文件 Markdown（图片 base64 内嵌，无音频）
 * - 范围：全部素材 / 仅勾选素材
 * - 图片：原图 / 压缩图；笔记：完整版 / 精简版
 * - 导出前大小统计 + 超大包提示；打包进度条
 * - ZIP 固定目录结构：{项目名}/旅行汇总笔记.md + images/ + audio/
 */
import { ref, reactive, computed, watch } from 'vue';
import { NModal, useMessage } from 'naive-ui';
import { X, Archive, Loader2, TriangleAlert, FileText, Image as ImageIcon, BookOpen } from 'lucide-vue-next';
import { packAndDownload, exportSingleMarkdown, packSizeInfo } from '../utils/packer';
import { formatSize } from '../utils/format';

const props = defineProps({
  show: Boolean,
  project: { type: Object, default: null },
  /** 全部素材（已按拖拽顺序） */
  materials: { type: Array, default: () => [] },
  /** 批量模式勾选的素材 id */
  selectedIds: { type: Array, default: () => [] },
  /** 从批量栏打开时预置"仅选中" */
  preselectSelected: { type: Boolean, default: false },
});
const emit = defineEmits(['update:show', 'packed']);

const message = useMessage();

const form = reactive({
  exportMode: 'zip', // zip | md
  range: 'all', // all | selected
  imageMode: 'original', // original | compressed
  noteMode: 'full', // full | brief
  zipName: '',
});
const packing = ref(false);
const progress = reactive({ percent: 0, stage: '' });

watch(
  () => props.show,
  (v) => {
    if (v) {
      form.exportMode = 'zip';
      form.zipName = `${props.project?.name || '旅行项目'}_素材包`;
      form.range = props.preselectSelected && props.selectedIds.length ? 'selected' : 'all';
      form.imageMode = 'original';
      form.noteMode = 'full';
      progress.percent = 0;
      progress.stage = '';
    }
  }
);

const targetMaterials = computed(() =>
  form.range === 'selected' ? props.materials.filter((m) => props.selectedIds.includes(m.id)) : props.materials
);

const stats = computed(() => {
  const counts = {
    text: targetMaterials.value.filter((m) => m.type === 'text').length,
    image: targetMaterials.value.filter((m) => m.type === 'image').length,
    audio: targetMaterials.value.filter((m) => m.type === 'audio').length,
  };
  const { bytes, tooBig, threshold } = packSizeInfo(targetMaterials.value, form.imageMode);
  // 单文件 MD：图片 base64 内嵌，体积约膨胀 1/3
  const mdBytes = Math.round(bytes * 1.33);
  return {
    counts,
    bytes: form.exportMode === 'md' ? mdBytes : bytes,
    tooBig: form.exportMode === 'md' ? mdBytes > threshold : tooBig,
  };
});

const selectedCountText = computed(() => `仅选中素材（${props.selectedIds.length} 个）`);

function close() {
  if (packing.value) return;
  emit('update:show', false);
}

async function startPack() {
  if (packing.value || !targetMaterials.value.length) return;
  packing.value = true;
  progress.percent = 0;
  try {
    const opts = {
      project: props.project,
      materials: targetMaterials.value,
      imageMode: form.imageMode,
      noteMode: form.noteMode,
      zipName: form.zipName,
      onProgress: (p, stage) => {
        progress.percent = p;
        progress.stage = stage;
      },
    };
    const size =
      form.exportMode === 'md' ? await exportSingleMarkdown(opts) : await packAndDownload(opts);
    message.success(`导出完成，共 ${formatSize(size)}`);
    emit('packed');
    emit('update:show', false);
  } catch (e) {
    message.error(e.message || '导出失败，请重试');
  } finally {
    packing.value = false;
  }
}
</script>

<template>
  <NModal :show="show" @update:show="emit('update:show', $event)" :auto-focus="false" :mask-closable="!packing">
    <div class="modal-vintage p-8 w-[520px] max-w-[calc(100vw-32px)] relative">
      <div class="paper-tape-modal"></div>

      <div class="flex items-center justify-between mb-5">
        <h2 class="ts-heading text-xl flex items-center gap-2">
          <Archive class="w-5 h-5" />
          打包导出
        </h2>
        <button class="ts-modal-close" aria-label="关闭" @click="close">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 导出格式 -->
      <div class="mb-4">
        <label class="ts-caption modal-label">导出格式</label>
        <div class="space-y-2">
          <label class="ts-option-row">
            <input v-model="form.exportMode" type="radio" value="zip" class="modal-radio" />
            <span class="ts-body text-sm">ZIP 素材包（笔记 + 图片 + 音频）</span>
          </label>
          <label class="ts-option-row">
            <input v-model="form.exportMode" type="radio" value="md" class="modal-radio" />
            <span class="ts-body text-sm">单文件 Markdown（图片内嵌，便于直接阅读）</span>
          </label>
        </div>
      </div>

      <div class="modal-divider"></div>

      <!-- 素材范围 -->
      <div class="mb-4">
        <label class="ts-caption modal-label">素材范围</label>
        <div class="space-y-2">
          <label class="ts-option-row">
            <input v-model="form.range" type="radio" value="all" class="modal-radio" />
            <span class="ts-body text-sm">全部素材（{{ materials.length }} 个）</span>
          </label>
          <label class="ts-option-row" :style="!selectedIds.length ? 'opacity:0.45; pointer-events:none' : ''">
            <input v-model="form.range" type="radio" value="selected" class="modal-radio" :disabled="!selectedIds.length" />
            <span class="ts-body text-sm">{{ selectedCountText }}</span>
          </label>
        </div>
      </div>

      <div class="modal-divider"></div>

      <!-- 图片与笔记选项 -->
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label class="ts-caption modal-label flex items-center gap-1">
            <ImageIcon class="w-3.5 h-3.5" />图片
          </label>
          <div class="space-y-2">
            <label class="ts-option-row">
              <input v-model="form.imageMode" type="radio" value="original" class="modal-radio" />
              <span class="ts-body text-sm">原图</span>
            </label>
            <label class="ts-option-row">
              <input v-model="form.imageMode" type="radio" value="compressed" class="modal-radio" />
              <span class="ts-body text-sm">压缩图（更小）</span>
            </label>
          </div>
        </div>
        <div>
          <label class="ts-caption modal-label flex items-center gap-1">
            <BookOpen class="w-3.5 h-3.5" />汇总笔记
          </label>
          <div class="space-y-2">
            <label class="ts-option-row">
              <input v-model="form.noteMode" type="radio" value="full" class="modal-radio" />
              <span class="ts-body text-sm">完整版</span>
            </label>
            <label class="ts-option-row">
              <input v-model="form.noteMode" type="radio" value="brief" class="modal-radio" />
              <span class="ts-body text-sm">精简版</span>
            </label>
          </div>
        </div>
      </div>

      <!-- ZIP 文件名 / MD 文件名 -->
      <div class="mb-4">
        <label class="ts-caption modal-label">{{ form.exportMode === 'md' ? 'Markdown 文件名' : 'ZIP 文件名' }}</label>
        <input v-model="form.zipName" class="modal-input" maxlength="50" placeholder="例如：京都秋日漫游_素材包" />
      </div>

      <!-- 固定结构说明 -->
      <div v-if="form.exportMode === 'zip'" class="mb-4 ts-preview-box p-3">
        <p class="ts-caption flex items-center gap-1.5 mb-1.5">
          <FileText class="w-3.5 h-3.5" />固定目录结构
        </p>
        <pre class="ts-caption leading-relaxed">{{ '{' + (project?.name || '项目') + '}' }}/
├─ 旅行汇总笔记.md
├─ images/
└─ audio/</pre>
      </div>
      <div v-else class="mb-4 ts-preview-box p-3">
        <p class="ts-caption flex items-center gap-1.5 mb-1.5">
          <FileText class="w-3.5 h-3.5" />单文件说明
        </p>
        <p class="ts-caption leading-relaxed">
          生成单一 .md 文件，图片以 base64 内嵌、任何 Markdown 阅读器可直接查看；音频素材不包含，需 ZIP 格式导出获取。
        </p>
      </div>

      <div class="modal-divider"></div>

      <!-- 统计 -->
      <div class="mb-4 space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="ts-caption">预计大小{{ form.exportMode === 'md' ? '（base64 内嵌约 +1/3）' : form.imageMode === 'compressed' ? '（压缩估算）' : '' }}</span>
          <span class="ts-body text-sm font-medium">~{{ formatSize(stats.bytes) }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="ts-caption">素材数量</span>
          <span class="ts-body text-sm font-medium">
            共 {{ targetMaterials.length }} 个 · 文本 {{ stats.counts.text }} / 图片 {{ stats.counts.image }} / 音频 {{ stats.counts.audio }}
          </span>
        </div>
      </div>

      <!-- 超大包提示 -->
      <div
        v-if="stats.tooBig"
        class="flex items-start gap-2 ts-preview-box p-3 mb-4"
        style="border-color: rgba(196, 168, 118, 0.5)"
      >
        <TriangleAlert class="w-4 h-4 mt-0.5 shrink-0" style="color: var(--state-warning)" />
        <p class="ts-body text-sm">
          素材总大小超过 50MB，打包与下载可能较慢，建议选择「压缩图」或分批打包。
        </p>
      </div>

      <!-- 进度条 -->
      <div class="mb-5">
        <div class="flex items-center justify-between mb-2">
          <span class="ts-caption">{{ packing ? progress.stage : '准备就绪' }}</span>
          <span class="ts-caption">{{ progress.percent }}%</span>
        </div>
        <div class="modal-progress-track">
          <div class="modal-progress-fill" :style="{ width: `${progress.percent}%` }"></div>
        </div>
      </div>

      <div class="flex justify-end gap-3">
        <button class="ts-btn-secondary" :disabled="packing" @click="close">
          <X class="w-4 h-4" /><span>取消</span>
        </button>
        <button class="ts-btn-primary" :disabled="packing || !targetMaterials.length" @click="startPack">
          <Loader2 v-if="packing" class="w-4 h-4 animate-spin" />
          <Archive v-else class="w-4 h-4" />
          <span>{{ packing ? '打包中…' : '开始打包' }}</span>
        </button>
      </div>
    </div>
  </NModal>
</template>
