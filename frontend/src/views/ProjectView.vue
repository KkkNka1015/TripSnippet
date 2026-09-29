<script setup>
/**
 * 项目详情页：素材管理核心
 * - 素材列表（拖拽排序 = 导出序号）、预览编辑弹窗
 * - 批量模式：全选 / 删除 / 移动项目 / 加标签 / 打包选中
 * - 导入、打包、备份、项目设置
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NModal, NSelect, NDropdown, useMessage } from 'naive-ui';
import {
  ArrowLeft, Compass, Plus, Archive, CheckSquare, MoreHorizontal, Pencil,
  Download, Trash2, Inbox, Tags, X, Check, FolderInput, Upload,
} from 'lucide-vue-next';
import {
  store, loadProjects, loadTags, openProject, reorderMaterials, deleteMaterials,
  moveMaterials, appendTagsToMaterials, deleteProject, addMaterials, materialStats,
  snapshotMaterials, snapshotProject, restoreMaterials, restoreProject,
} from '../store';
import { formatDate, formatSize } from '../utils/format';
import { compressImage, makeThumb, validateFile } from '../utils/image';
import { exportProjectBackup } from '../utils/backup';
import { offerUndo } from '../utils/undo';
import { isTypingTarget } from '../utils/hotkeys';
import MaterialRow from '../components/MaterialRow.vue';
import ImportModal from '../components/ImportModal.vue';
import PackModal from '../components/PackModal.vue';
import MaterialEditModal from '../components/MaterialEditModal.vue';
import ImageViewer from '../components/ImageViewer.vue';
import BatchBar from '../components/BatchBar.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ProjectCreateModal from '../components/ProjectCreateModal.vue';

const route = useRoute();
const router = useRouter();
const message = useMessage();

/* ---------- 弹窗状态 ---------- */
const showImport = ref(false);
const showPack = ref(false);
const showEditProject = ref(false);
const editingMaterial = ref(null); // 素材预览编辑
const showMoveModal = ref(false);
const showTagsModal = ref(false);

/* ---------- 图片大图查看（O3-1）---------- */
const viewer = reactive({ show: false, index: 0 });
const viewerImages = computed(() =>
  store.materials.filter((m) => m.type === 'image' && m.blob).map((m) => ({ id: m.id, title: m.title, blob: m.blob }))
);
function openViewer(m) {
  const i = viewerImages.value.findIndex((x) => x.id === m.id);
  viewer.index = i >= 0 ? i : 0;
  viewer.show = true;
}

/* ---------- 导入弹窗快捷入口（Ctrl+V 拉起剪贴板导入，O3-4）---------- */
const importTab = ref('url'); // url | clipboard
function openImport(tab = 'url') {
  importTab.value = tab;
  showImport.value = true;
}
function onGlobalKeydown(e) {
  if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
    if (isTypingTarget(e)) return; // 输入框内保持正常粘贴行为
    if (showImport.value) return; // 弹窗已开时不拦截，让粘贴区正常接收 paste
    e.preventDefault();
    openImport('clipboard');
  }
}

/* ---------- 批量模式 ---------- */
const batchMode = ref(false);
const selectedIds = ref([]); // number[]

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  selectedIds.value = [];
}

function toggleCheck(m) {
  const i = selectedIds.value.indexOf(m.id);
  if (i >= 0) selectedIds.value.splice(i, 1);
  else selectedIds.value.push(m.id);
}

/* ---------- 素材筛选（类型 + 标签） ---------- */
const filterType = ref('all'); // all | text | image | audio
const filterTag = ref(null); // 标签名或 null
const filterActive = computed(() => filterType.value !== 'all' || filterTag.value != null);

const typeChips = computed(() => [
  { key: 'all', label: '全部', count: materialStats.value.total },
  { key: 'text', label: '文本', count: materialStats.value.text },
  { key: 'image', label: '图片', count: materialStats.value.image },
  { key: 'audio', label: '音频', count: materialStats.value.audio },
]);

const tagOptions = computed(() => store.tags.map((t) => ({ label: t.name, value: t.name })));

/** 筛选后的可见素材（序号仍按真实导出顺序展示） */
const visibleMaterials = computed(() =>
  store.materials.filter(
    (m) =>
      (filterType.value === 'all' || m.type === filterType.value) &&
      (filterTag.value == null || (m.tags || []).includes(filterTag.value))
  )
);

function clearFilter() {
  filterType.value = 'all';
  filterTag.value = null;
}

/* 全选作用于当前可见集合（筛选时只勾选可见素材） */
const allSelected = computed(() => {
  const vis = visibleMaterials.value;
  return vis.length > 0 && vis.every((m) => selectedIds.value.includes(m.id));
});

function toggleSelectAll() {
  const visIds = visibleMaterials.value.map((m) => m.id);
  selectedIds.value = allSelected.value
    ? selectedIds.value.filter((id) => !visIds.includes(id))
    : [...new Set([...selectedIds.value, ...visIds])];
}

/* ---------- 删除确认 ---------- */
const confirmState = reactive({
  show: false,
  title: '',
  message: '',
  danger: true,
  onConfirm: null,
});

function askDeleteMaterial(m) {
  confirmState.title = '删除素材';
  confirmState.message = `确定删除「${m.title}」吗？删除后 10 秒内可撤销。`;
  confirmState.onConfirm = async () => {
    const snapshot = await snapshotMaterials([m.id]);
    await deleteMaterials([m.id]);
    selectedIds.value = selectedIds.value.filter((id) => id !== m.id);
    confirmState.show = false;
    offerUndo({
      message,
      text: '已删除',
      restore: () => restoreMaterials(snapshot),
      onUndone: () => message.success(`已恢复「${snapshot[0]?.title || '素材'}」`),
    });
  };
  confirmState.show = true;
}

function askBatchDelete() {
  confirmState.title = '批量删除素材';
  confirmState.message = `确定删除选中的 ${selectedIds.value.length} 个素材吗？删除后 10 秒内可撤销。`;
  confirmState.onConfirm = async () => {
    const snapshot = await snapshotMaterials([...selectedIds.value]);
    await deleteMaterials([...selectedIds.value]);
    selectedIds.value = [];
    confirmState.show = false;
    offerUndo({
      message,
      text: `已删除 ${snapshot.length} 个素材`,
      restore: () => restoreMaterials(snapshot),
      onUndone: () => message.success('已恢复'),
    });
  };
  confirmState.show = true;
}

function askDeleteProject() {
  const p = store.currentProject;
  confirmState.title = '删除项目';
  confirmState.message = `确定删除项目「${p.name}」及其全部素材吗？建议先导出项目备份。删除后 10 秒内可撤销。`;
  confirmState.onConfirm = async () => {
    const pid = p.id;
    const snapshot = await snapshotProject(pid);
    await deleteProject(pid);
    confirmState.show = false;
    router.push('/');
    offerUndo({
      message,
      text: `已删除项目「${p.name}」`,
      restore: () => restoreProject(snapshot),
      onUndone: () => message.success('项目已恢复，可在首页画廊找到'),
    });
  };
  confirmState.show = true;
}

/* ---------- 拖拽排序 ---------- */
const dragId = ref(null);
const overId = ref(null);

async function onDrop(target) {
  const fromId = dragId.value;
  if (fromId == null || fromId === target.id) return endDrag();
  const ids = store.materials.map((m) => m.id);
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(target.id);
  if (from < 0 || to < 0) return endDrag();
  ids.splice(to, 0, ...ids.splice(from, 1));
  await reorderMaterials(ids);
  message.success('顺序已更新，导出笔记序号同步生效');
  endDrag();
}

function endDrag() {
  dragId.value = null;
  overId.value = null;
}

/* ---------- 上移 / 下移（触屏与键盘用户的拖拽兜底） ---------- */
async function moveStep(m, step) {
  const ids = store.materials.map((x) => x.id);
  const i = ids.indexOf(m.id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await reorderMaterials(ids);
}

/* ---------- 拖放文件导入（整个页面都是拖放区） ---------- */
const dragOverlay = ref(false);

function isFileDrag(e) {
  return [...(e.dataTransfer?.types || [])].includes('Files');
}

function onWinDragOver(e) {
  if (!isFileDrag(e)) return; // 行内拖拽排序不触发
  e.preventDefault();
  dragOverlay.value = true;
}

function onWinDragLeave(e) {
  if (!e.relatedTarget) dragOverlay.value = false; // 离开窗口
}

async function onWinDrop(e) {
  const hasFiles = isFileDrag(e);
  dragOverlay.value = false;
  if (!hasFiles) return;
  e.preventDefault();
  await importDroppedFiles([...(e.dataTransfer?.files || [])]);
}

/** 校验并入库拖入的文件（复用导入弹窗同款规则） */
async function importDroppedFiles(files) {
  if (!files.length) return;
  const okFiles = [];
  const failed = [];
  for (const f of files) {
    const { ok, reason } = validateFile(f);
    if (ok) okFiles.push(f);
    else failed.push(`${f.name}（${reason}）`);
  }
  if (!okFiles.length) {
    message.error(`未能导入：${failed[0] || '未识别的文件'}`);
    return;
  }
  try {
    const records = [];
    for (const f of okFiles) {
      try {
        const title = f.name.replace(/\.[^.]+$/, '');
        if (f.type.startsWith('image/')) {
          const { blob } = await compressImage(f);
          records.push({
            type: 'image', title, blob,
            thumb: await makeThumb(blob),
            mime: blob.type, size: blob.size, sourceType: 'file',
          });
        } else if (f.type.startsWith('audio/')) {
          records.push({ type: 'audio', title, blob: f, mime: f.type, size: f.size, sourceType: 'file' });
        } else {
          const content = await f.text();
          records.push({ type: 'text', title, content, size: content.length, sourceType: 'file' });
        }
      } catch {
        failed.push(`${f.name}（文件读取失败）`);
      }
    }
    if (!records.length) {
      message.error(`未能导入：${failed[0] || '文件读取失败'}`);
      return;
    }
    await addMaterials(records);
    if (failed.length) message.warning(`已导入 ${records.length} 个文件，${failed.length} 个被拦截：${failed[0]}`);
    else message.success(`已导入 ${records.length} 个文件`);
  } catch (err) {
    message.error(err.message || '导入失败');
  }
}

onMounted(() => {
  window.addEventListener('dragover', onWinDragOver);
  window.addEventListener('dragleave', onWinDragLeave);
  window.addEventListener('drop', onWinDrop);
  window.addEventListener('keydown', onGlobalKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragover', onWinDragOver);
  window.removeEventListener('dragleave', onWinDragLeave);
  window.removeEventListener('drop', onWinDrop);
  window.removeEventListener('keydown', onGlobalKeydown);
});

/* ---------- 批量移动 ---------- */
const moveTarget = ref(null);
const moveOptions = computed(() =>
  store.projects
    .filter((p) => p.id !== store.currentProject?.id)
    .map((p) => ({ label: p.name, value: p.id }))
);

async function confirmMove() {
  if (!moveTarget.value) return;
  await moveMaterials([...selectedIds.value], moveTarget.value);
  const targetName = moveOptions.value.find((o) => o.value === moveTarget.value)?.label;
  selectedIds.value = [];
  moveTarget.value = null;
  showMoveModal.value = false;
  message.success(`已移动至「${targetName}」`);
}

/* ---------- 批量加标签 ---------- */
const tagDraft = reactive({ pool: [], picked: [], input: '' });
const poolLeft = computed(() => tagDraft.pool.filter((t) => !tagDraft.picked.includes(t)));

async function confirmTags() {
  const names = [...tagDraft.picked];
  const n = tagDraft.input.trim();
  if (n && !names.includes(n)) names.push(n);
  if (!names.length) return;
  await appendTagsToMaterials([...selectedIds.value], names);
  tagDraft.picked = [];
  tagDraft.input = '';
  showTagsModal.value = false;
  message.success(`已为 ${selectedIds.value.length} 个素材添加 ${names.length} 个标签`);
}

watch(showTagsModal, (v) => {
  if (v) tagDraft.pool = store.tags.map((t) => t.name);
});

/* ---------- 项目菜单 ---------- */
const icon = (C) => () => h(C, { size: 14 });
const projectMenuOptions = [
  { label: '编辑项目', key: 'edit', icon: icon(Pencil) },
  { label: '导出项目备份', key: 'backup', icon: icon(Download) },
  { type: 'divider', key: 'd1' },
  { label: '删除项目', key: 'delete', icon: icon(Trash2) },
];

function onProjectMenuAction(key) {
  if (key === 'edit') showEditProject.value = true;
  if (key === 'backup') doExportProjectBackup();
  if (key === 'delete') askDeleteProject();
}

async function doExportProjectBackup() {
  try {
    await exportProjectBackup(store.currentProject.id);
    message.success('项目备份已下载');
  } catch (e) {
    message.error(e.message || '备份失败');
  }
}

/* 编辑弹窗内切换置顶 / 归档 */
function onFlagToggled({ field, value }) {
  if (field === 'pinned') message.success(value ? '已置顶，将排在首页画廊最前' : '已取消置顶');
  else message.success(value ? '已归档，可在首页「已归档」区找到' : '已取消归档，回到首页画廊');
}

/* ---------- 页面数据 ---------- */
const seqMap = reactive({}); // materialId -> 序号

async function refresh() {
  const p = await openProject(Number(route.params.id));
  if (!p) {
    message.error('项目不存在或已被删除');
    router.replace('/');
    return;
  }
  store.materials.forEach((m, i) => (seqMap[m.id] = i + 1));
  // 支持 ?m=<id> 直达素材弹窗
  const qm = Number(route.query.m);
  if (qm) {
    const m = store.materials.find((x) => x.id === qm);
    if (m) editingMaterial.value = m;
  }
}

onMounted(async () => {
  await Promise.all([loadProjects(), loadTags()]);
  await refresh();
});

/* 同组件跨项目跳转（如 /project/1 → /project/2）时重新加载 */
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId && oldId && newId !== oldId) {
      editingMaterial.value = null;
      endDrag();
      refresh();
    }
  }
);

const stats = computed(() => ({
  total: store.materials.length,
  bytes: store.materials.reduce((s, m) => s + (m.size || 0), 0),
}));

/* 排序变化时刷新序号 */
watch(
  () => store.materials.map((m) => m.id).join(','),
  () => {
    store.materials.forEach((m, i) => (seqMap[m.id] = i + 1));
  }
);

function openMaterial(m) {
  editingMaterial.value = m;
}

function afterMaterialChange() {
  // 素材被编辑 / 删除后刷新列表
  const id = Number(route.params.id);
  openProject(id).then(() => {
    store.materials.forEach((m, i) => (seqMap[m.id] = i + 1));
  });
  editingMaterial.value = null;
}

function goHome() {
  router.push('/');
}
</script>

<template>
  <div v-if="store.currentProject" class="min-h-screen">
    <!-- 顶部导航 -->
    <nav class="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button class="ts-btn-back" aria-label="返回首页" @click="goHome">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ts-heading text-lg flex items-center gap-2 cursor-pointer" @click="goHome">
          <Compass class="w-4.5 h-4.5" />TripSnippet
        </span>
      </div>
      <div></div>
    </nav>

    <!-- 项目标题栏 -->
    <div class="w-full max-w-6xl mx-auto px-6 pt-4 pb-6">
      <div class="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div v-if="batchMode" class="ts-batch-badge mb-2">
            <CheckSquare class="w-3.5 h-3.5" /><span>批量模式</span>
          </div>
          <h1 class="ts-heading text-2xl md:text-3xl">{{ store.currentProject.name }}</h1>
          <p class="ts-caption mt-1">
            {{ stats.total }} 个素材 · {{ formatSize(stats.bytes) }} ·
            {{ formatDate(store.currentProject.createTime) }}
            <template v-if="batchMode"> · 已选 {{ selectedIds.length }} 个</template>
          </p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <template v-if="!batchMode">
            <button id="btn-import" class="ts-btn-primary" @click="openImport()">
              <Plus class="w-4 h-4" /><span>导入素材</span>
            </button>
            <!-- 空项目隐藏打包 / 批量，让「导入素材」成为唯一焦点 -->
            <button v-if="store.materials.length" id="btn-pack-zip" class="ts-btn-secondary" @click="showPack = true">
              <Archive class="w-4 h-4" /><span>打包 ZIP</span>
            </button>
            <button v-if="store.materials.length" id="btn-batch-mode" class="ts-btn-outline" @click="toggleBatchMode">
              <CheckSquare class="w-4 h-4" /><span>批量管理</span>
            </button>
            <NDropdown :options="projectMenuOptions" @select="onProjectMenuAction" trigger="click" placement="bottom-end">
              <button class="ts-icon-btn" aria-label="项目设置">
                <MoreHorizontal class="w-4 h-4" />
              </button>
            </NDropdown>
          </template>
          <template v-else>
            <button class="ts-btn-outline" @click="toggleBatchMode">
              <X class="w-4 h-4" /><span>退出批量</span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 素材列表 -->
    <main class="w-full max-w-6xl mx-auto px-6 pb-24">
      <template v-if="store.materials.length">
        <!-- 筛选条：类型 + 标签 -->
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <button
            v-for="c in typeChips"
            :key="c.key"
            class="ts-tag"
            :class="filterType === c.key ? 'ts-tag-text' : 'ts-tag-plain'"
            :aria-pressed="filterType === c.key"
            @click="filterType = c.key"
          >
            {{ c.label }} {{ c.count }}
          </button>
          <NSelect
            v-model:value="filterTag"
            :options="tagOptions"
            clearable
            size="small"
            placeholder="按标签筛选"
            class="!w-44"
            :consistent-menu-width="false"
          />
          <button v-if="filterActive" class="ts-btn-outline ts-btn-sm" @click="clearFilter">
            <X class="w-3.5 h-3.5" /><span>清除筛选</span>
          </button>
        </div>

        <p class="ts-caption mb-2 flex items-center gap-1.5">
          <Inbox class="w-3.5 h-3.5" />
          <template v-if="filterActive">
            筛选中：显示 {{ visibleMaterials.length }} / {{ store.materials.length }} 条，拖拽排序已暂停
          </template>
          <template v-else>
            列表顺序即导出笔记序号，拖拽把手或点行尾箭头即可调整
          </template>
        </p>

        <div v-if="visibleMaterials.length" class="space-y-0.5">
          <MaterialRow
            v-for="(m, i) in visibleMaterials"
            :key="m.id"
            :material="m"
            :seq="seqMap[m.id] || 0"
            :show-order="true"
            :sortable="!filterActive"
            :batch-mode="batchMode"
            :checked="selectedIds.includes(m.id)"
            :dragging="dragId === m.id"
            :drop-target="overId === m.id"
            :is-first="i === 0"
            :is-last="i === visibleMaterials.length - 1"
            @open="openMaterial"
            @edit="openMaterial"
            @view="openViewer"
            @delete="askDeleteMaterial"
            @drag-start="(mm) => (dragId = mm.id)"
            @drag-enter="(mm) => (overId = mm.id)"
            @drag-end="endDrag"
            @drop="onDrop"
            @toggle-check="toggleCheck"
            @move-up="(m) => moveStep(m, -1)"
            @move-down="(m) => moveStep(m, 1)"
          />
        </div>

        <!-- 筛选无结果 -->
        <div v-else class="ts-preview-box p-8 text-center">
          <p class="ts-caption">没有符合当前筛选条件的素材</p>
          <button class="ts-btn-outline ts-btn-sm mt-4" @click="clearFilter">
            <X class="w-3.5 h-3.5" /><span>清除筛选</span>
          </button>
        </div>
      </template>

      <!-- 空素材状态 -->
      <div v-else class="flex flex-col items-center justify-center text-center py-20">
        <div class="ts-empty-illustration-wrap">
          <Inbox class="w-16 h-16" style="color: var(--ts-ink-faint)" />
        </div>
        <h2 class="ts-heading text-2xl mt-8">还没有素材</h2>
        <p class="ts-body mt-2 text-center max-w-md">
          通过网页链接解析、剪贴板粘贴或本地文件，把攻略、图片、音频收集到这个项目；
          也可以把文件直接拖进页面
        </p>
        <button class="ts-btn-primary mt-6" @click="openImport()">
          <Plus class="w-4 h-4" /><span>导入素材</span>
        </button>
      </div>
    </main>

    <!-- 批量操作栏 -->
    <BatchBar
      :show="batchMode"
      :selected-count="selectedIds.length"
      :total-count="store.materials.length"
      :all-selected="allSelected"
      @toggle-all="toggleSelectAll"
      @delete="askBatchDelete"
      @move="showMoveModal = true"
      @tags="showTagsModal = true"
      @pack="showPack = true"
      @exit="toggleBatchMode"
    />

    <!-- 弹窗组 -->
    <ImportModal v-model:show="showImport" :initial-tab="importTab" @imported="afterMaterialChange" />
    <PackModal
      v-model:show="showPack"
      :project="store.currentProject"
      :materials="store.materials"
      :selected-ids="selectedIds"
      :preselect-selected="batchMode"
    />
    <MaterialEditModal
      :show="editingMaterial !== null"
      :material="editingMaterial"
      @update:show="(v) => { if (!v) editingMaterial = null; }"
      @saved="afterMaterialChange"
      @delete="(m) => { editingMaterial = null; askDeleteMaterial(m); }"
      @preview="openViewer"
    />
    <ProjectCreateModal
      v-model:show="showEditProject"
      :project="store.currentProject"
      @updated="message.success('项目已更新')"
      @toggled="onFlagToggled"
    />
    <ConfirmModal
      v-model:show="confirmState.show"
      :title="confirmState.title"
      :message="confirmState.message"
      :danger="confirmState.danger"
      confirm-text="删除"
      @confirm="confirmState.onConfirm?.()"
    />

    <!-- 图片大图查看（O3-1） -->
    <ImageViewer v-model:show="viewer.show" :images="viewerImages" v-model:index="viewer.index" />

    <!-- 批量移动弹窗 -->
    <NModal :show="showMoveModal" @update:show="showMoveModal = $event" :auto-focus="false">
      <div class="modal-vintage p-7 w-[420px] max-w-[calc(100vw-32px)] relative">
        <div class="paper-tape-modal"></div>
        <h3 class="ts-heading text-lg mb-1 flex items-center gap-2">
          <FolderInput class="w-5 h-5" />批量移动素材
        </h3>
        <p class="ts-caption mb-4">将选中的 {{ selectedIds.length }} 个素材移动到其他项目</p>
        <NSelect
          v-model:value="moveTarget"
          :options="moveOptions"
          class="ts-select"
          placeholder="选择目标项目"
          filterable
        />
        <div v-if="!moveOptions.length" class="ts-caption mt-2">暂无其他项目可移动，先去首页创建一个吧</div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="ts-btn-secondary" @click="showMoveModal = false">
            <X class="w-4 h-4" /><span>取消</span>
          </button>
          <button class="ts-btn-primary" :disabled="!moveTarget" @click="confirmMove">
            <Check class="w-4 h-4" /><span>移动</span>
          </button>
        </div>
      </div>
    </NModal>

    <!-- 批量加标签弹窗 -->
    <NModal :show="showTagsModal" @update:show="showTagsModal = $event" :auto-focus="false">
      <div class="modal-vintage p-7 w-[420px] max-w-[calc(100vw-32px)] relative">
        <div class="paper-tape-modal"></div>
        <h3 class="ts-heading text-lg mb-1 flex items-center gap-2">
          <Tags class="w-5 h-5" />批量添加标签
        </h3>
        <p class="ts-caption mb-4">为选中的 {{ selectedIds.length }} 个素材追加标签（不会覆盖已有标签）</p>

        <div v-if="tagDraft.picked.length" class="flex flex-wrap gap-2 mb-3">
          <span v-for="t in tagDraft.picked" :key="t" class="ts-tag ts-tag-text">{{ t }} <button class="ml-0.5" @click="tagDraft.picked = tagDraft.picked.filter(x => x !== t)">×</button></span>
        </div>
        <div v-if="poolLeft.length" class="flex flex-wrap gap-1.5 mb-3">
          <button
            v-for="t in poolLeft"
            :key="t"
            class="ts-tag ts-tag-plain hover:opacity-70"
            @click="tagDraft.picked.push(t)"
          >+ {{ t }}</button>
        </div>
        <input
          v-model="tagDraft.input"
          class="modal-input"
          maxlength="10"
          placeholder="输入新标签，回车添加"
          @keyup.enter.prevent="() => { if (tagDraft.input.trim() && !tagDraft.picked.includes(tagDraft.input.trim())) tagDraft.picked.push(tagDraft.input.trim()); tagDraft.input = ''; }"
        />

        <div class="flex justify-end gap-3 mt-6">
          <button class="ts-btn-secondary" @click="showTagsModal = false">
            <X class="w-4 h-4" /><span>取消</span>
          </button>
          <button class="ts-btn-primary" :disabled="!tagDraft.picked.length && !tagDraft.input.trim()" @click="confirmTags">
            <Check class="w-4 h-4" /><span>添加</span>
          </button>
        </div>
      </div>
    </NModal>

    <!-- 拖放文件导入遮罩 -->
    <div
      v-if="dragOverlay"
      class="fixed inset-0 z-[80] flex items-center justify-center"
      style="background: rgba(64, 52, 60, 0.45)"
    >
      <div class="modal-vintage p-10 text-center pointer-events-none">
        <Upload class="w-12 h-12 mx-auto" style="color: var(--ts-ink-soft)" />
        <h3 class="ts-heading text-xl mt-4">松开鼠标，导入到本项目</h3>
        <p class="ts-caption mt-2">支持图片 / mp3 音频 / 文本，自动校验类型与大小</p>
      </div>
    </div>
  </div>
</template>
