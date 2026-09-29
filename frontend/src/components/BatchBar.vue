<script setup>
/**
 * 批量管理底部操作栏
 */
import { CheckSquare, Trash2, FolderInput, Tags, Archive, X, CheckCheck } from 'lucide-vue-next';

defineProps({
  show: Boolean,
  selectedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  allSelected: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle-all', 'delete', 'move', 'tags', 'pack', 'exit']);
</script>

<template>
  <Transition name="ts-slide-up">
    <div v-if="show" class="ts-batch-bar">
      <span class="ts-batch-badge">
        <CheckSquare class="w-3.5 h-3.5" />已选 {{ selectedCount }} / {{ totalCount }}
      </span>

      <span class="ts-batch-bar-divider"></span>

      <button class="ts-btn-outline ts-btn-sm" @click="emit('toggle-all')">
        <CheckCheck class="w-3.5 h-3.5" /><span>{{ allSelected ? '取消全选' : '全选' }}</span>
      </button>
      <button class="ts-btn-outline ts-btn-sm" :disabled="!selectedCount" @click="emit('move')">
        <FolderInput class="w-3.5 h-3.5" /><span>移动到项目</span>
      </button>
      <button class="ts-btn-outline ts-btn-sm" :disabled="!selectedCount" @click="emit('tags')">
        <Tags class="w-3.5 h-3.5" /><span>添加标签</span>
      </button>
      <button class="ts-btn-outline ts-btn-sm" :disabled="!selectedCount" @click="emit('pack')">
        <Archive class="w-3.5 h-3.5" /><span>打包选中</span>
      </button>

      <span class="ts-batch-bar-divider"></span>

      <button
        class="ts-btn-outline ts-btn-sm"
        style="color: var(--state-error); border-color: rgba(184, 137, 143, 0.45)"
        :disabled="!selectedCount"
        @click="emit('delete')"
      >
        <Trash2 class="w-3.5 h-3.5" /><span>批量删除</span>
      </button>
      <button class="ts-btn-secondary ts-btn-sm" @click="emit('exit')">
        <X class="w-3.5 h-3.5" /><span>退出批量</span>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.ts-slide-up-enter-active,
.ts-slide-up-leave-active {
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.ts-slide-up-enter-from,
.ts-slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 80px);
}
</style>
