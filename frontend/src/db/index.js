/**
 * IndexedDB 数据层（Dexie）
 * 所有用户素材仅存本地，不上云。
 *
 * 数据模型：
 * - TravelProject: id, name, description, createTime
 * - Material: id, projectId, type(text|image|audio), title, content, blob, thumb,
 *             mime, size, ext, sourceUrl, tags[], remark, createTime, sourceType, order
 * - Tag（全局标签池）: id, name
 * - Setting: key
 */
import Dexie from 'dexie';

export const db = new Dexie('TripSnippetDB');

db.version(1).stores({
  projects: '++id, name, createTime',
  materials: '++id, projectId, type, createTime, order, [projectId+type]',
  tags: '++id, &name',
  settings: 'key',
});

/* ---------- 项目 ---------- */
export async function dbListProjects() {
  const list = await db.projects.orderBy('createTime').reverse().toArray();
  // 置顶项目排最前（Array.sort 稳定，组内保持创建时间倒序）
  return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}

export async function dbCreateProject({ name, description = '' }) {
  const id = await db.projects.add({
    name: name.trim(),
    description: (description || '').trim(),
    createTime: Date.now(),
  });
  return id;
}

export async function dbUpdateProject(id, patch) {
  await db.projects.update(id, patch);
}

export async function dbDeleteProject(id) {
  // 级联删除项目下所有素材
  await db.transaction('rw', db.projects, db.materials, async () => {
    await db.materials.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

/** 撤销删除：恢复项目（保留原 id） */
export async function dbRestoreProject(project) {
  await db.projects.put({ ...project });
}

/* ---------- 素材 ---------- */
export async function dbListMaterials(projectId) {
  const list = await db.materials.where('projectId').equals(projectId).toArray();
  return list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 首页画廊统计：projectId -> 素材数（只读索引键，不加载记录内容） */
export async function dbProjectMaterialCounts() {
  const counts = {};
  const keys = await db.materials.orderBy('projectId').keys();
  for (const pid of keys) counts[pid] = (counts[pid] || 0) + 1;
  return counts;
}

/** 项目封面：order 最小的图片素材（仅读取该项目图片记录，避免全表 blob 进内存） */
export async function dbProjectCover(projectId) {
  const imgs = await db.materials
    .where('[projectId+type]')
    .equals([projectId, 'image'])
    .sortBy('order');
  return imgs[0] || null;
}

export async function dbAddMaterials(records) {
  return db.materials.bulkAdd(records.map((r) => ({ ...r })), { allKeys: true });
}

export async function dbUpdateMaterial(id, patch) {
  await db.materials.update(id, patch);
}

export async function dbDeleteMaterials(ids) {
  await db.materials.bulkDelete(ids);
}

/** 撤销删除：恢复素材（保留原 id 与 order，排序引用不失效） */
export async function dbRestoreMaterials(records) {
  await db.materials.bulkPut(records.map((r) => ({ ...r })));
}

export async function dbNextOrder(projectId) {
  const list = await db.materials.where('projectId').equals(projectId).toArray();
  return list.reduce((max, m) => Math.max(max, m.order ?? 0), 0) + 1;
}

/** 拖拽排序：全量重排（项目内素材量级小，安全直接） */
export async function dbReorderMaterials(orderedIds) {
  await db.transaction('rw', db.materials, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.materials.update(orderedIds[i], { order: i + 1 });
    }
  });
}

/** 全局搜索：项目名 / 素材标题 / 素材备注 / 标签 / 文本内容
 *  流式扫描素材表：命中的仅保留轻量字段（blob/thumb 不进结果，避免大内存驻留） */
export async function dbGlobalSearch(keyword) {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return { projects: [], materials: [] };

  const projects = await db.projects.toArray();

  const matchProjects = projects.filter((p) => {
    const name = (p.name || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    return name.includes(kw) || desc.includes(kw);
  });

  const matchProjectIds = new Set(matchProjects.map((p) => p.id));
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const LIMIT = 50;
  const hits = [];
  await db.materials.each((m) => {
    if (hits.length >= LIMIT) return; // 后续仅遍历不再收集，控制内存
    const hit =
      (m.title || '').toLowerCase().includes(kw) ||
      (m.remark || '').toLowerCase().includes(kw) ||
      (m.type === 'text' && (m.content || '').toLowerCase().includes(kw)) ||
      (m.tags || []).some((t) => t.toLowerCase().includes(kw));
    if (hit && !matchProjectIds.has(m.projectId)) {
      hits.push({
        id: m.id,
        projectId: m.projectId,
        type: m.type,
        title: m.title,
        sourceType: m.sourceType,
      });
    }
  });
  return {
    projects: matchProjects,
    materials: hits.map((m) => ({
      ...m,
      projectName: nameById.get(m.projectId) || '未知项目',
    })),
  };
}

/* ---------- 全局标签池 ---------- */
export async function dbListTags() {
  return db.tags.orderBy('name').toArray();
}

export async function dbAddTag(name) {
  const n = name.trim();
  if (!n) return null;
  const exists = await db.tags.where('name').equals(n).first();
  if (exists) return exists.id;
  return db.tags.add({ name: n });
}

export async function dbAddTags(names) {
  const ids = [];
  for (const n of names) {
    const id = await dbAddTag(n);
    if (id) ids.push(id);
  }
  return ids;
}

export async function dbRenameTag(oldName, newName) {
  const n = newName.trim();
  if (!n || n === oldName) return;
  await db.transaction('rw', db.tags, db.materials, async () => {
    const exists = await db.tags.where('name').equals(n).first();
    if (exists) {
      // 目标名已存在：直接删除旧标签，素材指向新名
      await db.tags.where('name').equals(oldName).delete();
    } else {
      await db.tags.where('name').equals(oldName).modify({ name: n });
    }
    const affected = await db.materials.filter((m) => (m.tags || []).includes(oldName)).toArray();
    for (const m of affected) {
      await db.materials.update(m.id, {
        tags: [...new Set([...(m.tags || []).map((t) => (t === oldName ? n : t))])],
      });
    }
  });
}

export async function dbDeleteTag(name) {
  await db.transaction('rw', db.tags, db.materials, async () => {
    await db.tags.where('name').equals(name).delete();
    const affected = await db.materials.filter((m) => (m.tags || []).includes(name)).toArray();
    for (const m of affected) {
      await db.materials.update(m.id, { tags: (m.tags || []).filter((t) => t !== name) });
    }
  });
}

/** 统计各标签被素材引用的次数（删除/重命名前的影响提示） */
export async function dbTagUsageCounts() {
  const counts = {};
  await db.materials.each((m) => {
    for (const t of m.tags || []) counts[t] = (counts[t] || 0) + 1;
  });
  return counts;
}

/* ---------- 设置（KV） ---------- */
export async function dbGetSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function dbSetSetting(key, value) {
  await db.settings.put({ key, value });
}

/* ---------- 统计 ---------- */
export async function dbStorageEstimate() {
  let usedBytes = 0;
  await db.materials.each((m) => {
    if (m.blob) usedBytes += m.size || m.blob.size || 0;
  });
  let quota = 0;
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    quota = est.quota || 0;
  }
  return { usedBytes, quota };
}
