<script setup>
/**
 * 备份中心抽屉（含全局标签池管理 / 存储占用）
 * 标签池：使用计数徽标、行内重命名（同名自动合并）、删除前影响提示
 */
import { ref, computed, onMounted, watch } from 'vue';
import { NDrawer, NDrawerContent, useMessage } from 'naive-ui';
import {
  Download, Upload, Database, Tag as TagIcon, Trash2, HardDrive, TriangleAlert, Pencil,
} from 'lucide-vue-next';
import { store, removeTag, addTag, renameTag } from '../store';
import { dbStorageEstimate, dbTagUsageCounts } from '../db';
import { exportAllBackup, exportProjectBackup, importAllBackup, importProjectBackup } from '../utils/backup';
import { formatSize, formatDate } from '../utils/format';
import ConfirmModal from './ConfirmModal.vue';

const props = defineProps({ show: Boolean });
defineEmits(['update:show']);

const message = useMessage();
const importInput = ref(null);
const storage = ref({ usedBytes: 0, quota: 0 });
const newTagName = ref('');
const tagCounts = ref({});
const editingTag = ref(null);
const editingTagName = ref('');
const pendingDeleteTag = ref('');

onMounted(refreshStorage);
// 抽屉打开时刷新标签使用计数（导入恢复后也会变化）
watch(
  () => props.show,
  (v) => {
    if (v) refreshTagCounts();
  }
);

async function refreshStorage() {
  storage.value = await dbStorageEstimate();
}

async function refreshTagCounts() {
  tagCounts.value = await dbTagUsageCounts();
}

async function onExportAll() {
  if (!store.projects.length) {
    message.info('还没有项目可备份');
    return;
  }
  try {
    await exportAllBackup();
    message.success('全库备份已下载');
  } catch (e) {
    message.error(e.message || '备份失败');
  }
}

async function onExportProject(p) {
  try {
    await exportProjectBackup(p.id);
    message.success(`「${p.name}」备份已下载`);
  } catch (e) {
    message.error(e.message || '备份失败');
  }
}

async function onImport(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    // 自动识别备份类型：先按全库尝试，失败则按项目备份
    const text = await file.text();
    const head = JSON.parse(text);
    if (head?.app !== 'TripSnippet') throw new Error('这不是有效的 TripSnippet 备份文件');
    let result;
    if (head.kind === 'all') {
      const f = new File([text], file.name, { type: 'application/json' });
      const restored = await importAllBackup(f);
      result = `已恢复 ${restored.length} 个项目`;
    } else if (head.kind === 'project') {
      const f = new File([text], file.name, { type: 'application/json' });
      const r = await importProjectBackup(f);
      result = `已恢复项目「${r.name}」${r.count} 个素材`;
    } else {
      throw new Error('未知的备份类型');
    }
    message.success(result);
    await refreshStorage();
    await refreshTagCounts();
  } catch (e2) {
    message.error(e2.message || '恢复失败，请检查备份文件');
  }
}

/* ---- 标签池：重命名 / 删除（带影响提示） ---- */
function startRenameTag(name) {
  editingTag.value = name;
  editingTagName.value = name;
}

function cancelRename() {
  editingTag.value = null;
  editingTagName.value = '';
}

async function confirmRename() {
  const oldName = editingTag.value;
  if (!oldName) return;
  const n = editingTagName.value.trim();
  cancelRename();
  if (!n || n === oldName) return;
  const merged = store.tags.some((t) => t.name === n);
  await renameTag(oldName, n);
  message.success(merged ? `已重命名为「${n}」，与同名标签自动合并` : `标签已重命名为「${n}」，关联素材已同步`);
  await refreshTagCounts();
}

function askDeleteTag(name) {
  pendingDeleteTag.value = name;
}

async function doDeleteTag() {
  const name = pendingDeleteTag.value;
  pendingDeleteTag.value = '';
  if (!name) return;
  await removeTag(name);
  message.success(`已删除标签「${name}」`);
  await refreshTagCounts();
}

async function onAddTag() {
  const n = newTagName.value.trim();
  if (!n) return;
  if (store.tags.some((t) => t.name === n)) {
    message.warning('该标签已存在');
    return;
  }
  await addTag(n);
  newTagName.value = '';
  message.success('已添加标签');
  await refreshTagCounts();
}

const usagePercent = computed(() =>
  storage.value.quota ? Math.min(100, (storage.value.usedBytes / storage.value.quota) * 100) : 0
);
</script>

<template>
  <NDrawer :show="show" @update:show="$emit('update:show', $event)" :width="420" placement="right">
    <NDrawerContent :native-scrollbar="false">
      <div class="p-2">
        <h2 class="ts-heading text-xl flex items-center gap-2 mb-5">
          <Database class="w-5 h-5" />备份中心
        </h2>

        <!-- 隐私与占用 -->
        <div class="ts-preview-box p-4 mb-5">
          <p class="flex items-center gap-1.5 ts-caption mb-2">
            <HardDrive class="w-4 h-4" />本地存储占用
          </p>
          <p class="ts-body text-sm mb-2">
            {{ formatSize(storage.usedBytes) }}
            <span v-if="storage.quota" class="ts-caption">/ 浏览器配额约 {{ formatSize(storage.quota) }}</span>
          </p>
          <div class="modal-progress-track">
            <div class="modal-progress-fill" :style="{ width: `${usagePercent}%` }"></div>
          </div>
          <p class="ts-caption mt-3 leading-relaxed">
            所有素材仅存储在本机浏览器 IndexedDB，不上云、不上传用户数据。清理浏览器缓存会丢失数据，建议定期备份。
          </p>
        </div>

        <!-- 备份操作 -->
        <div class="flex gap-2.5 mb-5">
          <button class="ts-btn-primary ts-btn-sm flex-1 justify-center" @click="onExportAll">
            <Download class="w-3.5 h-3.5" />导出全库备份
          </button>
          <button class="ts-btn-secondary ts-btn-sm flex-1 justify-center" @click="importInput?.click()">
            <Upload class="w-3.5 h-3.5" />导入恢复备份
          </button>
          <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImport" />
        </div>

        <!-- 项目级备份 -->
        <p class="ts-caption mb-2.5 flex items-center gap-1.5"><TriangleAlert class="w-3.5 h-3.5" />项目级备份（可单独恢复）</p>
        <div class="ts-preview-box p-3 mb-5">
          <div v-if="!store.projects.length" class="text-center py-4">
            <p class="ts-caption">还没有旅行项目</p>
          </div>
          <div
            v-for="p in store.projects"
            :key="p.id"
            class="flex items-center gap-2 py-2 px-2 rounded-xl hover:bg-cream cursor-pointer transition-colors"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm truncate ts-body">{{ p.name }}</p>
              <p class="ts-caption">创建于 {{ formatDate(p.createTime) }}</p>
            </div>
            <button class="ts-btn-outline ts-btn-sm" @click.stop="onExportProject(p)">
              <Download class="w-3.5 h-3.5" />备份
            </button>
          </div>
        </div>

        <!-- 全局标签池 -->
        <p class="ts-caption mb-2.5 flex items-center gap-1.5">
          <TagIcon class="w-3.5 h-3.5" />全局标签池（{{ store.tags.length }} 个，徽标为引用数）
        </p>
        <div class="ts-preview-box p-3.5 mb-3">
          <div v-if="!store.tags.length" class="text-center py-3">
            <p class="ts-caption">暂无标签，可在素材编辑弹窗中添加</p>
          </div>
          <div v-else class="flex flex-wrap gap-2">
            <span v-for="t in store.tags" :key="t.name" class="ts-tag ts-tag-plain">
              <template v-if="editingTag === t.name">
                <input
                  v-model="editingTagName"
                  class="ts-tag-edit"
                  maxlength="10"
                  aria-label="重命名标签"
                  @keyup.enter="confirmRename"
                  @keyup.esc="cancelRename"
                  @blur="confirmRename"
                />
              </template>
              <template v-else>
                {{ t.name }}
                <span v-if="tagCounts[t.name]" class="ts-tag-count">{{ tagCounts[t.name] }}</span>
                <button
                  class="ml-1 opacity-60 hover:opacity-100"
                  :aria-label="`重命名标签 ${t.name}`"
                  @click="startRenameTag(t.name)"
                ><Pencil class="w-3 h-3" /></button>
                <button
                  class="ml-0.5 opacity-60 hover:opacity-100"
                  :aria-label="`删除标签 ${t.name}`"
                  @click="askDeleteTag(t.name)"
                ><Trash2 class="w-3 h-3" /></button>
              </template>
            </span>
          </div>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTagName"
            class="modal-input flex-1"
            maxlength="10"
            placeholder="新建标签名"
            @keyup.enter="onAddTag"
          />
          <button class="ts-btn-outline ts-btn-sm" @click="onAddTag">添加</button>
        </div>
      </div>
    </NDrawerContent>
  </NDrawer>

  <!-- 删除标签确认（提示影响素材数） -->
  <ConfirmModal
    :show="!!pendingDeleteTag"
    title="删除标签"
    :message="
      pendingDeleteTag && tagCounts[pendingDeleteTag]
        ? `将删除标签「${pendingDeleteTag}」，${tagCounts[pendingDeleteTag]} 个素材将移除该标签。此操作不可撤销。`
        : `将删除标签「${pendingDeleteTag}」，当前没有素材使用它。此操作不可撤销。`
    "
    confirm-text="删除"
    danger
    @update:show="(v) => !v && (pendingDeleteTag = '')"
    @confirm="doDeleteTag"
  />
</template>
