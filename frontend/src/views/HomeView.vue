<script setup>
/**
 * 首页：项目卡片画廊 / 空状态 / 全局搜索（项目名、素材标题、备注、标签）
 */
import { ref, reactive, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { Compass, Plus, Search, Settings2, FileText, Image as ImageIcon, Music, ArrowRight, TriangleAlert, Archive, Download, Sparkles } from 'lucide-vue-next';
import {
  store, loadProjects, loadTags, getSetting, setSetting,
  createProject, openProject, addMaterials, restoreProject,
} from '../store';
import { dbProjectMaterialCounts, dbProjectCover, dbGlobalSearch, dbStorageEstimate } from '../db';
import { blobUrl, sourceLabel } from '../utils/format';
import { buildDemoItems } from '../utils/demo-data';
import { offerUndo } from '../utils/undo';
import { isTypingTarget } from '../utils/hotkeys';
import ProjectCard from '../components/ProjectCard.vue';
import ProjectCreateModal from '../components/ProjectCreateModal.vue';
import BackupDrawer from '../components/BackupDrawer.vue';

const router = useRouter();
const message = useMessage();

const showCreate = ref(false);
const showBackup = ref(false);
const editProject = ref(null); // 编辑模式：当前编辑的项目（null = 新建）

function openCreate() {
  editProject.value = null;
  showCreate.value = true;
}

function openEdit(p) {
  editProject.value = p;
  showCreate.value = true;
}

/* 编辑弹窗内切换置顶 / 归档 */
function onFlagToggled({ field, value }) {
  if (field === 'pinned') message.success(value ? '已置顶' : '已取消置顶');
  else message.success(value ? '已归档，可在下方「已归档」区找到' : '已取消归档，回到画廊');
}

/* ---------- 已归档分区 ---------- */
const showArchived = ref(false);
const archivedProjects = computed(() => store.projects.filter((p) => p.archived));

/* ---------- 备份提醒（距上次备份 ≥ 7 天） ---------- */
const backupDays = ref(null); // null=不显示；-1=从未备份；其他=距上次备份天数
const backupDismissed = ref(false);

async function checkBackupReminder() {
  backupDays.value = null;
  if (backupDismissed.value || !store.projects.length) return;
  const last = await getSetting('lastBackupAt');
  if (!last) {
    backupDays.value = -1;
    return;
  }
  const days = Math.floor((Date.now() - last) / 86400000);
  if (days >= 7) backupDays.value = days;
}

/* ---------- 存储容量预警（本机存储使用率 ≥ 80%） ---------- */
const storageWarn = ref(null); // null=不显示；否则 { percent, usedMB, quotaMB }

async function checkStorageWarning() {
  storageWarn.value = null;
  // 7 天内点过「不再提醒」则跳过
  const dismissedAt = (await getSetting('storageWarnDismissedAt')) || 0;
  if (Date.now() - dismissedAt < 7 * 86400000) return;
  const { usedBytes, quota } = await dbStorageEstimate();
  if (!quota) return; // 浏览器不支持容量估算时不提示
  const ratio = usedBytes / quota;
  if (ratio >= 0.8) {
    storageWarn.value = {
      percent: Math.min(100, Math.round(ratio * 100)),
      usedMB: (usedBytes / 1048576).toFixed(1),
      quotaMB: (quota / 1048576).toFixed(0),
    };
  }
}

async function dismissStorageWarn() {
  storageWarn.value = null;
  await setSetting('storageWarnDismissedAt', Date.now());
}

/** 封面与统计：索引计数 + 按项目取首图（不再全表加载，避免大量 blob 进内存） */
const materialMeta = ref({}); // projectId -> { count, cover: objectURL }
const objectUrls = ref([]);

const searchState = reactive({
  keyword: '',
  projects: [],
  materials: [],
  searching: false,
});
const hasSearch = computed(() => searchState.keyword.trim().length > 0);

let searchTimer = null;
watch(
  () => searchState.keyword,
  (kw) => {
    clearTimeout(searchTimer);
    if (!kw.trim()) {
      searchState.projects = [];
      searchState.materials = [];
      return;
    }
    searchTimer = setTimeout(async () => {
      const { projects, materials } = await dbGlobalSearch(kw);
      searchState.projects = projects;
      searchState.materials = materials;
    }, 200);
  }
);

const visibleProjects = computed(() => {
  // 归档项目不在主画廊展示（搜索时同样不出现）
  const base = store.projects.filter((p) => !p.archived);
  if (!hasSearch.value) return base;
  const kw = searchState.keyword.trim().toLowerCase();
  return base.filter(
    (p) =>
      p.name.toLowerCase().includes(kw) ||
      (p.description || '').toLowerCase().includes(kw) ||
      searchState.projects.some((sp) => sp.id === p.id)
  );
});

const showEmpty = computed(() => !store.projects.length && !hasSearch.value);
const showGallery = computed(() => visibleProjects.value.length > 0 || !hasSearch.value);

async function computeCovers() {
  objectUrls.value.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.value = [];
  const counts = await dbProjectMaterialCounts();
  const meta = {};
  for (const p of store.projects) {
    const count = counts[p.id] || 0;
    const firstImage = count ? await dbProjectCover(p.id) : null;
    const url = firstImage ? blobUrl(firstImage.thumb || firstImage.blob) : '';
    if (url) objectUrls.value.push(url);
    meta[p.id] = { count, cover: url };
  }
  materialMeta.value = meta;
}

/* ---------- 全局快捷键（/ 聚焦搜索、N 新建项目，O3-4） ---------- */
const searchInput = ref(null);
function onGlobalKeydown(e) {
  if (isTypingTarget(e) || showCreate.value || showBackup.value) return; // 输入中或弹窗打开时不响应
  if (e.key === '/') {
    e.preventDefault();
    searchInput.value?.focus();
  } else if (e.key === 'n' || e.key === 'N') {
    openCreate();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown); // 快捷键尽早可用，不等待数据加载
  (async () => {
    await Promise.all([loadProjects(), loadTags()]);
    await computeCovers();
    await checkBackupReminder();
    await checkStorageWarning();
  })();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  objectUrls.value.forEach((u) => URL.revokeObjectURL(u));
});

function openProjectPage(p) {
  router.push(`/project/${p.id}`);
}

function openMaterialHit(m) {
  router.push(`/project/${m.projectId}?m=${m.id}`);
}

function created(project) {
  message.success(`已创建项目「${project.name}」`);
  router.push(`/project/${project.id}`);
}

async function updated() {
  message.success('项目已更新');
  editProject.value = null;
  await computeCovers();
}

/** 编辑弹窗内删除项目后：刷新画廊并挂撤销 */
async function deleted(snapshot) {
  const name = snapshot?.project?.name || '';
  editProject.value = null;
  await computeCovers();
  offerUndo({
    message,
    text: `已删除项目「${name}」`,
    restore: () => restoreProject(snapshot),
    onUndone: () => {
      message.success('项目已恢复，可在画廊找到');
      computeCovers();
    },
  });
}

/* ---------- 演示数据包（空状态一键体验） ---------- */
const demoLoading = ref(false);

async function loadDemo() {
  if (demoLoading.value) return;
  demoLoading.value = true;
  try {
    const project = await createProject({
      name: '示例 · 京都五日',
      description: '快速体验用示例：包含行程、攻略、图片与清单，可随时删除',
    });
    await openProject(project.id);
    const items = await buildDemoItems();
    await addMaterials(items);
    message.success('示例项目已创建，可随意体验与删除');
    router.push(`/project/${project.id}`);
  } catch (err) {
    message.error(err.message || '示例项目创建失败');
  } finally {
    demoLoading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen">
    <!-- 顶部导航 -->
    <nav class="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
      <a class="ts-logo" href="#" @click.prevent="searchState.keyword = ''">
        <Compass class="w-5 h-5" />
        <span>TripSnippet</span>
      </a>
      <div class="flex items-center gap-3 flex-wrap">
        <!-- 全局搜索 -->
        <div class="ts-search-box">
          <Search class="w-4 h-4 shrink-0" style="color: var(--ts-ink-faint)" />
          <input ref="searchInput" v-model="searchState.keyword" placeholder="搜索项目 / 素材标题 / 备注 / 标签" />
          <button v-if="searchState.keyword" class="text-[13px]" style="color: var(--ts-ink-faint)" @click="searchState.keyword = ''">清空</button>
        </div>
        <!-- 备份中心 -->
        <button class="ts-icon-btn" aria-label="备份中心" title="备份中心" @click="showBackup = true">
          <Settings2 class="w-4.5 h-4.5" />
        </button>
        <!-- 新建项目 -->
        <button class="ts-nav-btn" @click="openCreate">
          <Plus class="w-4 h-4" /><span>新建项目</span>
        </button>
      </div>
    </nav>

    <!-- 存储容量预警横幅（本机存储使用率 ≥ 80%） -->
    <div v-if="storageWarn" class="w-full max-w-6xl mx-auto px-6">
      <div class="ts-preview-box p-4 mb-2 flex items-center gap-3 flex-wrap">
        <TriangleAlert class="w-4 h-4 shrink-0" style="color: var(--state-warning)" />
        <p class="ts-body text-sm flex-1" style="min-width: 220px">
          本地存储已使用 {{ storageWarn.percent }}%（约 {{ storageWarn.usedMB }} MB / {{ storageWarn.quotaMB }} MB），存满后将无法保存新素材，建议清理不需要的项目或导出备份
        </p>
        <button class="ts-btn-primary ts-btn-sm" @click="showBackup = true">
          <Download class="w-3.5 h-3.5" /><span>去备份</span>
        </button>
        <button class="ts-btn-outline ts-btn-sm" @click="dismissStorageWarn">
          <span>7 天内不再提醒</span>
        </button>
      </div>
    </div>

    <!-- 备份提醒横幅（距上次备份 ≥ 7 天或有项目但从未备份） -->
    <div v-if="backupDays !== null" class="w-full max-w-6xl mx-auto px-6">
      <div class="ts-preview-box p-4 mb-2 flex items-center gap-3 flex-wrap">
        <TriangleAlert class="w-4 h-4 shrink-0" style="color: var(--state-warning)" />
        <p class="ts-body text-sm flex-1" style="min-width: 220px">
          素材仅保存在本机浏览器，<template v-if="backupDays === -1">创建项目后还没有导出过备份</template><template v-else>距上次备份已 {{ backupDays }} 天</template>，建议定期导出 JSON 备份
        </p>
        <button class="ts-btn-primary ts-btn-sm" @click="showBackup = true">
          <Download class="w-3.5 h-3.5" /><span>立即备份</span>
        </button>
        <button class="ts-btn-outline ts-btn-sm" @click="backupDismissed = true; backupDays = null">
          <span>本次不再提醒</span>
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <main v-if="showEmpty" class="w-full max-w-6xl mx-auto px-6 pb-16">
      <div class="flex flex-col items-center justify-center text-center py-20 md:py-28">
        <div class="ts-empty-illustration-wrap">
          <!-- 手绘复古行李箱插画 -->
          <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="40" y="62" width="100" height="82" rx="14" stroke="var(--ts-foreground)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M70 62 V50 Q70 40 80 40 H100 Q110 40 110 50 V62" stroke="var(--ts-foreground)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            <line x1="90" y1="62" x2="90" y2="144" stroke="var(--ts-foreground)" stroke-width="1.5" stroke-linecap="round" opacity="0.45" />
            <path d="M48 72 L48 78 M132 72 L132 78" stroke="var(--ts-foreground)" stroke-width="1.5" stroke-linecap="round" opacity="0.5" />
            <path d="M48 134 L48 140 M132 134 L132 140" stroke="var(--ts-foreground)" stroke-width="1.5" stroke-linecap="round" opacity="0.5" />
            <g transform="rotate(-6 88 100)">
              <rect x="73" y="90" width="34" height="22" rx="5" fill="var(--ts-surface-mint)" opacity="0.65" stroke="var(--ts-foreground)" stroke-width="1.5" stroke-linejoin="round" />
              <circle cx="80" cy="101" r="2.2" fill="var(--ts-foreground)" opacity="0.5" />
              <line x1="85" y1="99" x2="101" y2="99" stroke="var(--ts-foreground)" stroke-width="1.3" stroke-linecap="round" opacity="0.5" />
              <line x1="85" y1="104" x2="97" y2="104" stroke="var(--ts-foreground)" stroke-width="1.3" stroke-linecap="round" opacity="0.5" />
            </g>
            <path d="M132 70 L134.2 75.4 L140 76 L135.8 80 L137 86 L132 83 L127 86 L128.2 80 L124 76 L129.8 75.4 Z" fill="var(--ts-surface-lilac)" opacity="0.45" stroke="var(--ts-foreground)" stroke-width="1.2" stroke-linejoin="round" />
            <path d="M24 48 L25 51 L28 51.3 L25.7 53.3 L26.5 56.2 L24 54.7 L21.5 56.2 L22.3 53.3 L20 51.3 L23 51 Z" fill="var(--ts-foreground)" opacity="0.35" />
            <g transform="translate(146 132)">
              <circle cx="0" cy="-4" r="2.6" fill="none" stroke="var(--ts-foreground)" stroke-width="1.4" />
              <circle cx="3.8" cy="1.2" r="2.6" fill="none" stroke="var(--ts-foreground)" stroke-width="1.4" />
              <circle cx="-3.8" cy="1.2" r="2.6" fill="none" stroke="var(--ts-foreground)" stroke-width="1.4" />
              <circle cx="0" cy="3" r="2.6" fill="none" stroke="var(--ts-foreground)" stroke-width="1.4" />
              <circle cx="0" cy="0" r="1.6" fill="var(--ts-foreground)" opacity="0.4" />
            </g>
            <ellipse cx="90" cy="152" rx="52" ry="5" fill="var(--ts-foreground)" opacity="0.08" />
          </svg>
        </div>

        <h2 class="ts-heading text-2xl md:text-3xl mt-10">还没有旅行项目</h2>
        <p class="ts-body mt-3 text-center max-w-md">创建你的第一个旅行项目，开始收集旅途中的美好素材</p>
        <button class="ts-btn-primary mt-8 !px-7 !py-3 !text-[15px]" @click="openCreate">
          <Plus class="w-4 h-4" /><span>创建旅行项目</span>
        </button>
        <!-- 演示数据包：一键创建可体验的示例项目 -->
        <div>
          <button class="ts-btn-outline mt-4" :disabled="demoLoading" @click="loadDemo">
            <Sparkles class="w-4 h-4" /><span>{{ demoLoading ? '正在生成示例…' : '先看看示例项目' }}</span>
          </button>
        </div>
      </div>
    </main>

    <!-- 画廊 / 搜索结果 -->
    <main v-else class="w-full max-w-6xl mx-auto px-6 pb-16">
      <!-- 项目画廊 -->
      <section v-if="showGallery" class="ts-flow-gallery">
        <ProjectCard
          v-for="(p, i) in visibleProjects"
          :key="p.id"
          :project="p"
          :cover-url="materialMeta[p.id]?.cover || ''"
          :material-count="materialMeta[p.id]?.count || 0"
          :index="i"
          @open="openProjectPage"
          @edit="openEdit"
        />
        <!-- 新建占位卡片（仅无搜索时） -->
        <div
          v-if="!hasSearch"
          class="ts-collage-card ts-card-new flex flex-col items-center justify-center text-center min-h-[240px]"
          @click="openCreate"
        >
          <div class="ts-photo-placeholder w-full flex-1">
            <Plus class="w-10 h-10 ts-plus-icon" />
            <span class="ts-caption">新建旅行项目</span>
          </div>
          <p class="ts-caption mt-4 px-2">开始规划下一趟旅程</p>
        </div>
      </section>

      <!-- 已归档项目分区 -->
      <section v-if="archivedProjects.length" class="mt-8">
        <button
          class="flex items-center gap-2 ts-caption mb-3 hover:opacity-70"
          @click="showArchived = !showArchived"
        >
          <Archive class="w-4 h-4" />
          <span>已归档（{{ archivedProjects.length }}）</span>
          <span class="opacity-60">{{ showArchived ? '收起' : '展开' }}</span>
        </button>
        <div v-if="showArchived" class="ts-flow-gallery">
          <ProjectCard
            v-for="(p, i) in archivedProjects"
            :key="p.id"
            :project="p"
            :cover-url="materialMeta[p.id]?.cover || ''"
            :material-count="materialMeta[p.id]?.count || 0"
            :index="i"
            @open="openProjectPage"
            @edit="openEdit"
          />
        </div>
      </section>

      <p v-if="hasSearch && !visibleProjects.length" class="ts-caption text-center mt-8">
        没有匹配「{{ searchState.keyword }}」的项目
      </p>

      <!-- 素材搜索结果 -->
      <section v-if="hasSearch" class="mt-10">
        <h3 class="ts-heading text-lg mb-4">素材匹配（{{ searchState.materials.length }} 条）</h3>
        <div v-if="!searchState.materials.length" class="ts-caption">未在素材中找到匹配内容</div>
        <div class="ts-preview-box p-2">
          <div
            v-for="m in searchState.materials"
            :key="m.id"
            class="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors hover:bg-warm"
            @click="openMaterialHit(m)"
          >
            <span class="ts-thumb-placeholder !w-10 !h-10">
              <FileText v-if="m.type === 'text'" class="w-4 h-4" />
              <ImageIcon v-else-if="m.type === 'image'" class="w-4 h-4" />
              <Music v-else class="w-4 h-4" />
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm ts-body truncate">{{ m.title }}</p>
              <p class="ts-caption truncate">{{ m.projectName }} · {{ sourceLabel(m) }}</p>
            </div>
            <ArrowRight class="w-4 h-4 shrink-0" style="color: var(--ts-ink-faint)" />
          </div>
        </div>
      </section>
    </main>

    <!-- 页脚 -->
    <footer class="w-full max-w-6xl mx-auto px-6 py-8 text-center">
      <p class="ts-caption">隐私说明：所有素材仅本地 IndexedDB 存储，不上传云端 · 仅供个人学习收藏，禁止商用</p>
    </footer>

    <!-- 弹窗 -->
    <ProjectCreateModal
      v-model:show="showCreate"
      :project="editProject"
      @created="created"
      @updated="updated"
      @deleted="deleted"
      @toggled="onFlagToggled"
    />
    <BackupDrawer
      :show="showBackup"
      @update:show="(v) => { showBackup = v; if (!v) { computeCovers(); checkBackupReminder(); } }"
    />
  </div>
</template>