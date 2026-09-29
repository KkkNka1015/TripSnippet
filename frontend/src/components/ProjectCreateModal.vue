<script setup>
/**
 * 项目新建 / 编辑弹窗（复古纸张风）
 * 通过 NModal 承载，内部完全使用手账风自定义样式
 */
import { reactive, ref, watch } from 'vue';
import { NModal } from 'naive-ui';
import { X, Check, Map, Trash2, Pin, Archive } from 'lucide-vue-next';
import { createProject, updateProject, deleteProject, snapshotProject } from '../store';
import ConfirmModal from './ConfirmModal.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** 编辑模式传入项目对象，新建模式传 null */
  project: { type: Object, default: null },
});
const emit = defineEmits(['update:show', 'created', 'updated', 'deleted', 'toggled']);

/* 置顶 / 归档（编辑模式，切换即时保存） */
const flags = reactive({ pinned: false, archived: false });

async function toggleFlag(field) {
  const value = !flags[field];
  flags[field] = value;
  await updateProject(props.project.id, { [field]: value });
  emit('toggled', { field, value });
}

const showDeleteConfirm = ref(false);

/** 二次确认后删除项目（连带项目下全部素材，10 秒内可由首页撤销） */
async function confirmDelete() {
  const snapshot = await snapshotProject(props.project.id);
  await deleteProject(props.project.id);
  showDeleteConfirm.value = false;
  emit('deleted', snapshot);
  close();
}

const form = reactive({ name: '', description: '' });

watch(
  () => props.show,
  (v) => {
    if (v) {
      form.name = props.project?.name || '';
      form.description = props.project?.description || '';
      flags.pinned = !!props.project?.pinned;
      flags.archived = !!props.project?.archived;
    }
  }
);

function close() {
  emit('update:show', false);
}

async function submit() {
  if (!form.name.trim()) return;
  if (props.project) {
    await updateProject(props.project.id, {
      name: form.name.trim(),
      description: form.description.trim(),
    });
    emit('updated');
  } else {
    const created = await createProject({
      name: form.name,
      description: form.description,
    });
    emit('created', created);
  }
  close();
}
</script>

<template>
  <NModal
    :show="show"
    @update:show="$emit('update:show', $event)"
    :auto-focus="false"
    :mask-closable="true"
  >
    <div class="modal-vintage p-8 w-[520px] max-w-[calc(100vw-32px)] relative">
      <div class="paper-tape-modal"></div>

      <div class="flex items-center justify-between mb-6">
        <h2 class="ts-heading text-xl flex items-center gap-2">
          <Map class="w-5 h-5" />
          {{ project ? '编辑项目' : '新建旅行项目' }}
        </h2>
        <button class="ts-modal-close" aria-label="关闭" @click="close">
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="mb-5">
        <label class="ts-caption modal-label">项目名称</label>
        <input
          v-model="form.name"
          class="modal-input"
          maxlength="40"
          placeholder="例如：京都秋日漫游"
          @keyup.enter="submit"
        />
      </div>

      <div class="mb-6">
        <label class="ts-caption modal-label">项目描述（可选）</label>
        <textarea
          v-model="form.description"
          class="modal-input resize-none"
          rows="3"
          maxlength="200"
          placeholder="简单记录这趟旅行的期待与计划…"
        ></textarea>
      </div>

      <!-- 置顶 / 归档（编辑模式） -->
      <div v-if="project" class="flex items-center gap-2.5 mb-6">
        <button
          class="ts-flag-btn"
          :class="{ 'is-active': flags.pinned }"
          :aria-pressed="flags.pinned"
          @click="toggleFlag('pinned')"
        >
          <Pin class="w-3.5 h-3.5" /><span>{{ flags.pinned ? '已置顶' : '置顶' }}</span>
        </button>
        <button
          class="ts-flag-btn"
          :class="{ 'is-active': flags.archived }"
          :aria-pressed="flags.archived"
          @click="toggleFlag('archived')"
        >
          <Archive class="w-3.5 h-3.5" /><span>{{ flags.archived ? '已归档' : '归档' }}</span>
        </button>
        <span class="ts-caption text-xs">归档后从首页隐藏，可随时在此恢复</span>
      </div>

      <div class="flex items-center justify-between gap-3">
        <!-- 编辑模式：删除项目入口（二次确认） -->
        <button
          v-if="project"
          class="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-75"
          style="color: var(--state-error)"
          @click="showDeleteConfirm = true"
        >
          <Trash2 class="w-4 h-4" /><span>删除此项目</span>
        </button>
        <div class="flex gap-3 ml-auto">
          <button class="ts-btn-secondary" @click="close">
            <X class="w-4 h-4" /><span>取消</span>
          </button>
          <button class="ts-btn-primary" :disabled="!form.name.trim()" @click="submit">
            <Check class="w-4 h-4" /><span>{{ project ? '保存' : '创建' }}</span>
          </button>
        </div>
      </div>
    </div>
  </NModal>

  <!-- 删除项目二次确认 -->
  <ConfirmModal
    :show="showDeleteConfirm"
    title="删除项目"
    :message="`确定删除项目「${project?.name}」及其全部素材吗？建议先导出项目备份。删除后 10 秒内可撤销。`"
    confirm-text="删除"
    danger
    @update:show="(v) => (showDeleteConfirm = v)"
    @confirm="confirmDelete"
  />
</template>
