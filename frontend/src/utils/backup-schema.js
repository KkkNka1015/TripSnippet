/**
 * 备份文件 schema 常量与校验（纯函数、零依赖，便于单元测试）
 * - 恢复前防呆校验：拒非法结构、防数据损坏
 * - backup.js 在恢复入口调用；单元测试直接测本模块
 */
export const BACKUP_VERSION = 1;
export const MATERIAL_TYPES = ['text', 'image', 'audio'];

/** 校验单条素材记录 */
export function validateMaterial(m, idx) {
  const label = m?.title ? `素材「${m.title}」` : `第 ${idx + 1} 条素材`;
  if (!m || typeof m !== 'object') throw new Error(`${label}记录无效`);
  if (!MATERIAL_TYPES.includes(m.type)) throw new Error(`${label}的类型无效`);
  if (m.blob != null && typeof m.blob !== 'string') throw new Error(`${label}的文件数据已损坏`);
  if (m.thumb != null && typeof m.thumb !== 'string') throw new Error(`${label}的缩略图数据已损坏`);
  if (m.tags != null && !Array.isArray(m.tags)) throw new Error(`${label}的标签数据无效`);
}

/** 校验单个项目记录 */
export function validateProject(p, label) {
  if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) {
    throw new Error(`${label}缺少有效的项目名称`);
  }
}

/**
 * 备份 schema 校验
 * @param {object} backup 解析后的备份 JSON
 * @param {'project'|'all'} expectedKind 期望的备份类型
 */
export function validateBackup(backup, expectedKind) {
  if (!backup || typeof backup !== 'object') throw new Error('备份文件格式错误（根节点不是 JSON 对象）');
  if (backup.app !== 'TripSnippet') throw new Error('这不是有效的 TripSnippet 备份文件');
  if (typeof backup.version !== 'number' || !Number.isInteger(backup.version) || backup.version < 1) {
    throw new Error('备份版本号无效');
  }
  if (backup.version > BACKUP_VERSION) throw new Error('备份来自更新版本的应用，请先升级 TripSnippet');
  if (backup.kind !== expectedKind) {
    throw new Error(
      expectedKind === 'all' ? '这不是有效的 TripSnippet 全库备份文件' : '这不是有效的 TripSnippet 项目备份文件'
    );
  }

  if (expectedKind === 'project') {
    validateProject(backup.project, '备份内');
    if (!Array.isArray(backup.materials)) throw new Error('备份内的素材列表无效');
    backup.materials.forEach(validateMaterial);
  } else {
    if (!Array.isArray(backup.projects) || !backup.projects.length) {
      throw new Error('备份内没有可恢复的项目');
    }
    backup.projects.forEach((p) => validateProject(p, `项目「${p?.name || '未命名'}」`));
    if (!Array.isArray(backup.materials)) throw new Error('备份内的素材列表无效');
    backup.materials.forEach(validateMaterial);
    if (backup.tags != null && !Array.isArray(backup.tags)) throw new Error('备份内的标签池数据无效');
  }
}
