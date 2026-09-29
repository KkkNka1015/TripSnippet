/**
 * 全局响应式 Store（轻量自实现，无额外依赖）
 * 负责项目 / 素材 / 标签池的内存状态与 IndexedDB 同步
 */
import { reactive, computed, toRaw } from 'vue';
import {
  dbListProjects,
  dbCreateProject,
  dbUpdateProject,
  dbDeleteProject,
  dbListMaterials,
  dbAddMaterials,
  dbUpdateMaterial,
  dbDeleteMaterials,
  dbRestoreMaterials,
  dbRestoreProject,
  dbReorderMaterials,
  dbNextOrder,
  dbListTags,
  dbAddTag,
  dbDeleteTag,
  dbRenameTag,
  dbGetSetting,
  dbSetSetting,
} from '../db';

export const store = reactive({
  /** @type {Array} 旅行项目列表 */
  projects: [],
  /** @type {Array} 全局标签池 */
  tags: [],
  /** 当前打开的项目（ProjectView 使用） */
  currentProject: null,
  /** 当前项目素材列表（已按 order 排序） */
  materials: [],
  /** 全局搜索关键词 */
  searchKeyword: '',
  /** 素材编号表：projectId -> Map<materialId, 序号>（按拖拽顺序） */
  _seqMaps: {},
});

/* ==================== 加载 ==================== */
export async function loadProjects() {
  store.projects = await dbListProjects();
}

export async function loadTags() {
  store.tags = await dbListTags();
}

export async function openProject(projectId) {
  const project = store.projects.find((p) => p.id === Number(projectId)) || null;
  store.currentProject = project;
  if (project) {
    store.materials = await dbListMaterials(project.id);
    buildSeqMap();
  } else {
    store.materials = [];
  }
  return project;
}

export function buildSeqMap() {
  const map = new Map();
  store.materials.forEach((m, i) => map.set(m.id, i + 1));
  const pid = store.currentProject?.id;
  if (pid != null) store._seqMaps[pid] = map;
}

/* ==================== 项目 ==================== */
/**
 * 首次创建项目后申请浏览器「持久化存储」，降低 IndexedDB 被自动清理的风险。
 * 每台设备只尝试一次（结果记入 settings），失败静默、不阻塞主流程。
 */
let persistRequesting = false;
async function requestPersistenceOnce() {
  if (persistRequesting) return;
  try {
    const done = await dbGetSetting('persistRequested');
    if (done || typeof navigator.storage?.persist !== 'function') return;
    persistRequesting = true;
    await dbSetSetting('persistRequested', true);
    navigator.storage.persist().catch(() => {});
  } catch {
    /* 环境不支持时静默跳过 */
  }
}

export async function createProject({ name, description }) {
  const id = await dbCreateProject({ name, description });
  requestPersistenceOnce();
  await loadProjects();
  const created = store.projects.find((p) => p.id === id);
  return created;
}

export async function updateProject(id, patch) {
  await dbUpdateProject(id, patch);
  await loadProjects();
  if (store.currentProject?.id === id) {
    store.currentProject = store.projects.find((p) => p.id === id);
  }
}

export async function deleteProject(id) {
  await dbDeleteProject(id);
  await loadProjects();
}

/* ==================== 删除撤销（快照 / 恢复） ====================
 * 约定：调用方先 snapshot，再执行删除；撤销时按原主键恢复，排序引用不失效。
 */

/** 删除前快照素材（含 blob），供窗口期内撤销 */
export async function snapshotMaterials(ids) {
  const set = new Set(ids.map(Number));
  return store.materials
    .filter((m) => set.has(m.id))
    .map((m) => ({ ...toRaw(m) }));
}

/** 删除前快照整个项目（项目 + 全部素材），供项目删除撤销 */
export async function snapshotProject(id) {
  const project = store.projects.find((p) => p.id === Number(id));
  if (!project) throw new Error('项目不存在，无法快照');
  const materials = await dbListMaterials(Number(id));
  return {
    project: { ...toRaw(project) },
    materials: materials.map((m) => ({ ...m })),
  };
}

/** 撤销删除：恢复素材（保留原 id 与顺序） */
export async function restoreMaterials(records) {
  const pid = records[0]?.projectId;
  if (pid != null && !store.projects.some((p) => p.id === pid)) {
    throw new Error('原项目已不存在，无法恢复素材');
  }
  await dbRestoreMaterials(records);
  if (store.currentProject) await openProject(store.currentProject.id);
}

/** 撤销删除：恢复整个项目及其素材 */
export async function restoreProject(snapshot) {
  if (!snapshot?.project) throw new Error('快照已失效');
  await dbRestoreProject(snapshot.project);
  if (snapshot.materials?.length) await dbRestoreMaterials(snapshot.materials);
  await loadProjects();
}

export const projectCount = computed(() => store.projects.length);

/* ==================== 素材 ==================== */

/**
 * 批量入库素材（导入统一入口）
 * @param {Array} items 素材描述数组：
 *   { type, title, content?, blob?, thumb?, mime?, size?, ext?, sourceUrl?, tags?, remark?, sourceType }
 */
export async function addMaterials(items) {
  const projectId = store.currentProject?.id;
  if (projectId == null) throw new Error('未打开任何项目');
  let order = await dbNextOrder(projectId);
  const records = items.map((it) => ({
    projectId,
    type: it.type,
    title: (it.title || '未命名素材').trim().slice(0, 200),
    content: it.content || '',
    blob: it.blob || null,
    thumb: it.thumb || null,
    mime: it.mime || null,
    size: it.size ?? (it.blob?.size ?? (it.content ? it.content.length : 0)),
    ext: it.ext || null,
    sourceUrl: it.sourceUrl || '',
    tags: [...(it.tags || [])],
    remark: it.remark || '',
    travelDate: it.travelDate || '',
    createTime: Date.now(),
    sourceType: it.sourceType || 'manual',
    order: order++,
  }));
  const ids = await dbAddMaterials(records);
  // 新增标签同步进全局标签池
  const newTags = [...new Set(records.flatMap((r) => r.tags))];
  await dbAddTagsSafe(newTags);
  await openProject(projectId);
  return ids;
}

async function dbAddTagsSafe(names) {
  for (const n of names) await dbAddTag(n);
  await loadTags();
}

export async function updateMaterial(id, patch) {
  if (patch.tags) await dbAddTagsSafe(patch.tags);
  await dbUpdateMaterial(id, toRaw({ ...patch }));
  if (store.currentProject) await openProject(store.currentProject.id);
}

export async function deleteMaterials(ids) {
  await dbDeleteMaterials(ids);
  if (store.currentProject) await openProject(store.currentProject.id);
}

/** 拖拽排序落库 */
export async function reorderMaterials(orderedIds) {
  await dbReorderMaterials(orderedIds);
  if (store.currentProject) await openProject(store.currentProject.id);
}

/** 批量移动素材到其他项目 */
export async function moveMaterials(ids, targetProjectId) {
  const order = await dbNextOrder(targetProjectId);
  for (let i = 0; i < ids.length; i++) {
    await dbUpdateMaterial(ids[i], { projectId: targetProjectId, order: order + i });
  }
  if (store.currentProject) await openProject(store.currentProject.id);
}

/** 批量为素材追加标签 */
export async function appendTagsToMaterials(ids, tagNames) {
  for (const id of ids) {
    const m = store.materials.find((x) => x.id === id);
    if (m) {
      await dbUpdateMaterial(id, { tags: [...new Set([...(m.tags || []), ...tagNames])] });
    }
  }
  await dbAddTagsSafe(tagNames);
  if (store.currentProject) await openProject(store.currentProject.id);
}

/* ==================== 标签池 ==================== */
export async function addTag(name) {
  await dbAddTag(name);
  await loadTags();
}

export async function removeTag(name) {
  await dbDeleteTag(name);
  await loadTags();
  if (store.currentProject) await openProject(store.currentProject.id);
}

export async function renameTag(oldName, newName) {
  await dbRenameTag(oldName, newName);
  await loadTags();
  if (store.currentProject) await openProject(store.currentProject.id);
}

/* ==================== 设置 ==================== */
export async function getSetting(key, fallback = null) {
  return dbGetSetting(key, fallback);
}

export async function setSetting(key, value) {
  return dbSetSetting(key, value);
}

/* ==================== 临时素材预览工具（内存态） ==================== */
export const importDraft = reactive({
  /** 网页解析结果 { title, siteName, text, images: [{url, blob, thumb, failed}] , url } */
  urlResult: null,
  /** 剪贴板草稿 { text, images: [...] } */
  clipboardDraft: null,
});

export function resetImportDraft() {
  importDraft.urlResult = null;
  importDraft.clipboardDraft = null;
}

export const materialStats = computed(() => {
  const total = store.materials.length;
  return {
    total,
    text: store.materials.filter((m) => m.type === 'text').length,
    image: store.materials.filter((m) => m.type === 'image').length,
    audio: store.materials.filter((m) => m.type === 'audio').length,
    bytes: store.materials.reduce((s, m) => s + (m.size || 0), 0),
  };
});
