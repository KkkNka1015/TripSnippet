<script setup>
/**
 * 图片大图查看器（全屏灯箱）
 * - 展示原图（非缩略图），支持左右切换同项目内的图片素材
 * - Esc / 点击遮罩关闭；← → 切换；150ms 淡入淡出，无位移缩放
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { X, ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 按素材顺序的图片集 [{ id, title, blob }] */
  images: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
});
const emit = defineEmits(['update:show', 'update:index']);

const current = computed(() => props.images[props.index] || null);

/* 原图 blob URL：随打开状态/索引生成与回收 */
const url = ref('');
watch(
  () => [props.show, props.index, props.images.length],
  () => {
    if (url.value) {
      URL.revokeObjectURL(url.value);
      url.value = '';
    }
    if (props.show && current.value?.blob) url.value = URL.createObjectURL(current.value.blob);
  },
  { immediate: true }
);
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value));

function close() {
  emit('update:show', false);
}

function step(d) {
  const next = props.index + d;
  if (next >= 0 && next < props.images.length) emit('update:index', next);
}

function onKey(e) {
  if (!props.show) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    step(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    step(1);
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="ts-viewer-fade">
      <div v-if="show" class="ts-viewer-mask" @click="close">
        <img v-if="url" :src="url" :alt="current?.title || '素材大图'" class="ts-viewer-img" @click.stop />
        <p v-if="current" class="ts-viewer-caption">{{ current.title }} · {{ index + 1 }} / {{ images.length }}</p>
        <button class="ts-viewer-btn ts-viewer-close" aria-label="关闭大图" @click.stop="close">
          <X class="w-6 h-6" />
        </button>
        <button
          v-if="images.length > 1 && index > 0"
          class="ts-viewer-btn ts-viewer-prev"
          aria-label="上一张"
          @click.stop="step(-1)"
        >
          <ChevronLeft class="w-7 h-7" />
        </button>
        <button
          v-if="images.length > 1 && index < images.length - 1"
          class="ts-viewer-btn ts-viewer-next"
          aria-label="下一张"
          @click.stop="step(1)"
        >
          <ChevronRight class="w-7 h-7" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ts-viewer-mask {
  position: fixed;
  inset: 0;
  z-index: 3000; /* 置于 NaiveUI 弹窗（素材编辑弹窗入口）之上 */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 18, 15, 0.92);
}
.ts-viewer-img {
  max-width: 92vw;
  max-height: 86vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5);
}
.ts-viewer-caption {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  text-align: center;
  color: rgba(255, 252, 240, 0.78);
  font-size: 13px;
  letter-spacing: 0.04em;
}
.ts-viewer-btn {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 252, 240, 0.28);
  background: rgba(20, 18, 15, 0.55);
  color: rgba(255, 252, 240, 0.9);
  cursor: pointer;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.ts-viewer-btn:hover {
  background: rgba(60, 55, 46, 0.8);
  opacity: 1;
}
.ts-viewer-close {
  top: 20px;
  right: 20px;
}
.ts-viewer-prev {
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
}
.ts-viewer-next {
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
}

/* 150ms 淡入淡出（轻过渡，无位移缩放） */
.ts-viewer-fade-enter-active,
.ts-viewer-fade-leave-active {
  transition: opacity 0.15s ease;
}
.ts-viewer-fade-enter-from,
.ts-viewer-fade-leave-to {
  opacity: 0;
}
</style>
