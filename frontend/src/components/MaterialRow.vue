<script setup>
/**
 * 素材列表行（支持拖拽排序 + 上移/下移兜底 + 批量勾选）
 */
import { computed, watch, ref, onBeforeUnmount } from 'vue';
import { FileText, Image as ImageIcon, Music, Pencil, Trash2, GripVertical, Link2, ChevronUp, ChevronDown } from 'lucide-vue-next';
import { formatDate, sourceLabel, blobUrl } from '../utils/format';

const props = defineProps({
  material: { type: Object, required: true },
  seq: { type: Number, default: 0 },
  batchMode: { type: Boolean, default: false },
  checked: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropTarget: { type: Boolean, default: false },
  showOrder: { type: Boolean, default: false },
  /** 是否可拖拽排序（筛选视图下暂停，避免序号错乱） */
  sortable: { type: Boolean, default: true },
  /** 是否为列表首行（上移按钮禁用） */
  isFirst: { type: Boolean, default: false },
  /** 是否为列表末行（下移按钮禁用） */
  isLast: { type: Boolean, default: false },
});
const emit = defineEmits(['open', 'edit', 'delete', 'view', 'drag-start', 'drag-enter', 'drag-end', 'drop', 'toggle-check', 'move-up', 'move-down']);

const thumbUrl = ref('');
watch(
  () => props.material,
  (m) => {
    if (thumbUrl.value) URL.revokeObjectURL(thumbUrl.value);
    thumbUrl.value = m.type === 'image' ? blobUrl(m.thumb || m.blob) : '';
  },
  { immediate: true }
);
onBeforeUnmount(() => thumbUrl.value && URL.revokeObjectURL(thumbUrl.value));

const typeMeta = computed(() =>
  ({
    text: { label: '攻略', cls: 'ts-tag-text', icon: FileText },
    image: { label: '图片', cls: 'ts-tag-image', icon: ImageIcon },
    audio: { label: '音频', cls: 'ts-tag-audio', icon: Music },
  })[props.material.type] || { label: '素材', cls: 'ts-tag-plain', icon: FileText }
);

const remarkPreview = computed(() => {
  const r = (props.material.remark || '').replace(/\n+/g, ' ').trim();
  return r.length > 40 ? `${r.slice(0, 40)}…` : r;
});
</script>

<template>
  <div
    class="ts-material-entry"
    :class="{ 'is-selected': batchMode && checked, 'is-dragging': dragging }"
    :style="dropTarget ? 'box-shadow: inset 0 2px 0 0 var(--ts-ink-soft)' : ''"
    :draggable="sortable"
    @dragstart="sortable && emit('drag-start', material)"
    @dragenter.prevent="sortable && emit('drag-enter', material)"
    @dragover.prevent
    @drop.prevent="sortable ? emit('drop', material) : null"
    @dragend="emit('drag-end')"
    @click="emit('open', material)"
  >
    <div class="ts-entry-row flex items-center gap-4 py-4 px-3 -mx-3">
      <!-- 勾选框（批量模式） -->
      <input
        v-if="batchMode"
        type="checkbox"
        class="ts-checkbox"
        :checked="checked"
        :aria-label="`选择 ${material.title}`"
        @click.stop
        @change.stop="emit('toggle-check', material)"
      />

      <!-- 拖拽把手（筛选视图下隐藏） -->
      <span
        v-if="sortable"
        class="ts-drag-handle"
        :class="{ 'is-batch': batchMode }"
        title="按住拖拽可调整导出顺序"
        aria-label="拖拽排序"
      >
        <GripVertical class="w-4 h-4" />
      </span>

      <!-- 序号（导出排序预览） -->
      <span v-if="showOrder && !batchMode" class="ts-caption w-5 text-center shrink-0" :title="`导出序号 ${seq}`">
        {{ seq }}
      </span>

      <!-- 缩略图（图片素材点击可查看大图） -->
      <img
        v-if="thumbUrl"
        :src="thumbUrl"
        class="ts-thumb"
        :class="{ 'ts-thumb-zoom': material.type === 'image' }"
        :alt="material.title"
        title="点击查看大图"
        @click.stop="material.type === 'image' && emit('view', material)"
      />
      <span v-else class="ts-thumb-placeholder">
        <component :is="typeMeta.icon" class="w-5 h-5" />
      </span>

      <!-- 内容 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h3 class="ts-heading text-base truncate">{{ material.title }}</h3>
          <span class="ts-tag" :class="typeMeta.cls">{{ typeMeta.label }}</span>
          <span v-if="material.sourceUrl" class="ts-tag ts-tag-plain" title="含来源链接">
            <Link2 class="w-3 h-3" />
          </span>
        </div>
        <p class="ts-caption mt-1 flex items-center gap-2 flex-wrap">
          <span>{{ formatDate(material.createTime) }}</span>
          <span class="opacity-40">·</span>
          <span>{{ sourceLabel(material) }}</span>
          <template v-if="remarkPreview">
            <span class="opacity-40">·</span>
            <span class="truncate" style="max-width: 320px" :title="material.remark">{{ remarkPreview }}</span>
          </template>
        </p>
      </div>

      <!-- 操作 -->
      <div class="ts-edit-actions flex items-center gap-1 shrink-0">
        <!-- 上移 / 下移（拖拽的触屏与键盘兜底，筛选视图下隐藏） -->
        <span v-if="sortable" class="ts-move-btns flex items-center gap-0.5 mr-1">
          <button
            class="ts-icon-btn"
            aria-label="上移"
            title="上移一位"
            :disabled="isFirst"
            @click.stop="emit('move-up', material)"
          >
            <ChevronUp class="w-4 h-4" />
          </button>
          <button
            class="ts-icon-btn"
            aria-label="下移"
            title="下移一位"
            :disabled="isLast"
            @click.stop="emit('move-down', material)"
          >
            <ChevronDown class="w-4 h-4" />
          </button>
        </span>
        <button class="ts-icon-btn" aria-label="编辑" @click.stop="emit('edit', material)">
          <Pencil class="w-4 h-4" />
        </button>
        <button class="ts-icon-btn" aria-label="删除" style="color: var(--state-error)" @click.stop="emit('delete', material)">
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 普通模式：把手悬浮时才显示；批量模式：常驻 */
.ts-material-entry:not(:hover) .ts-drag-handle:not(.is-batch) {
  opacity: 0;
}

/* 桌面：上移/下移按钮悬浮时显示（拖拽为主路径） */
.ts-material-entry:not(:hover) .ts-move-btns {
  opacity: 0;
}
.ts-move-btns button:disabled {
  opacity: 0.35;
  cursor: default;
}

/* 图片缩略图：悬停轻微提亮，提示可点开大图 */
.ts-thumb-zoom {
  cursor: zoom-in;
  transition: opacity 0.15s ease;
}
.ts-thumb-zoom:hover {
  opacity: 0.85;
}

/* 触屏（无 hover）：拖拽不可用，隐藏把手、常显上移/下移按钮 */
@media (hover: none) {
  .ts-material-entry:not(:hover) .ts-move-btns,
  .ts-material-entry .ts-move-btns {
    opacity: 1;
  }
  .ts-material-entry .ts-drag-handle:not(.is-batch) {
    display: none;
  }
}
</style>
