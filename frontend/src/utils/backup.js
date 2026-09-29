/**
 * 项目级 JSON 备份 / 恢复
 * - 导出：项目 + 全部素材 + 相关标签；blob→base64 与 JSON 序列化在 Web Worker 执行
 * - 恢复：先做 schema 校验（防呆，拒非法结构），id 不冲突时按原 id 恢复，冲突时创建新副本
 * - 防止浏览器清缓存导致数据丢失
 */
import { db, dbSetSetting } from '../db';
import { sanitizeFilename, extFromMime } from './format';
import { loadProjects, loadTags, openProject, store } from '../store';
import { runExportWorker, downloadBlob } from './export-worker-client';
import { BACKUP_VERSION, validateBackup } from './backup-schema';

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'application/octet-stream' });
}

/* ---- 导出（序列化在 Web Worker 执行，不卡主线程） ---- */

/** 导出单个项目的备份 JSON */
export async function exportProjectBackup(projectId) {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('项目不存在');
  const materials = await db.materials.where('projectId').equals(projectId).toArray();

  const { blob } = await runExportWorker('backup-json', {
    data: {
      app: 'TripSnippet',
      version: BACKUP_VERSION,
      kind: 'project',
      exportedAt: Date.now(),
      project,
      materials,
    },
    pretty: true,
  });
  downloadBlob(blob, `TripSnippet备份_${sanitizeFilename(project.name)}.json`);
  // 记录备份时间，供首页备份提醒判断
  await dbSetSetting('lastBackupAt', Date.now());
}

/** 校验项目备份对象并落库 */
async function restoreProjectObject(backup) {
  const existing = await db.projects.get(backup.project.id);
  const asCopy = !!existing;
  const projectId = await db.projects.add({
    name: asCopy ? `${backup.project.name}（恢复副本）` : backup.project.name,
    description: backup.project.description || '',
    createTime: asCopy ? Date.now() : backup.project.createTime,
  });

  let order = 1;
  const records = [];
  for (const m of backup.materials || []) {
    records.push({
      projectId,
      type: m.type,
      title: m.title || '未命名素材',
      content: m.content || '',
      blob: m.blob ? base64ToBlob(m.blob, m.mime) : null,
      thumb: m.thumb ? base64ToBlob(m.thumb, m.mime) : null,
      mime: m.mime || null,
      size: m.size || 0,
      ext: m.ext || (m.mime ? extFromMime(m.mime) : null),
      sourceUrl: m.sourceUrl || '',
      tags: m.tags || [],
      remark: m.remark || '',
      createTime: m.createTime || Date.now(),
      sourceType: m.sourceType || 'manual',
      order: order++,
    });
  }
  if (records.length) await db.materials.bulkAdd(records);

  // 恢复相关标签到全局标签池
  for (const t of [...new Set(records.flatMap((r) => r.tags))]) {
    const exists = await db.tags.where('name').equals(t).first();
    if (!exists) await db.tags.add({ name: t });
  }
  return { projectId, asCopy, count: records.length, name: backup.project.name };
}

/** 恢复备份（项目级）：id 冲突时创建副本 */
export async function importProjectBackup(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('备份文件格式错误（无法解析 JSON）');
  }
  validateBackup(backup, 'project');
  const result = await restoreProjectObject(backup);
  await loadProjects();
  await loadTags();
  return result;
}

/** 全库备份：所有项目 + 标签池 */
export async function exportAllBackup() {
  const projects = await db.projects.toArray();
  const materials = await db.materials.toArray();
  const tags = await db.tags.toArray();

  const { blob } = await runExportWorker('backup-json', {
    data: {
      app: 'TripSnippet',
      version: BACKUP_VERSION,
      kind: 'all',
      exportedAt: Date.now(),
      projects,
      materials,
      tags,
    },
    pretty: false,
  });
  downloadBlob(blob, `TripSnippet全库备份_${new Date().toISOString().slice(0, 10)}.json`);
  // 记录备份时间，供首页备份提醒判断
  await dbSetSetting('lastBackupAt', Date.now());
}

/** 全库恢复：每个项目独立恢复（冲突则建副本） */
export async function importAllBackup(file) {
  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    throw new Error('备份文件格式错误（无法解析 JSON）');
  }
  validateBackup(backup, 'all');

  const restored = [];
  for (const p of backup.projects) {
    const sub = {
      app: 'TripSnippet',
      version: BACKUP_VERSION,
      kind: 'project',
      project: p,
      materials: backup.materials.filter((m) => m.projectId === p.id),
    };
    restored.push(await restoreProjectObject(sub));
  }
  await loadProjects();
  await loadTags();
  if (store.currentProject) await openProject(store.currentProject.id);
  return restored;
}
