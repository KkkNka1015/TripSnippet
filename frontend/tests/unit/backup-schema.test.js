/**
 * backup-schema.js 单元测试：备份恢复前的防呆校验
 * - 全部非法分支必须拦截并给出可理解的中文文案
 */
import { describe, it, expect } from 'vitest';
import {
  BACKUP_VERSION,
  MATERIAL_TYPES,
  validateMaterial,
  validateProject,
  validateBackup,
} from '../../src/utils/backup-schema';

const validProjectBackup = {
  app: 'TripSnippet',
  version: 1,
  kind: 'project',
  project: { id: 1, name: '京都五日' },
  materials: [
    { type: 'text', title: '攻略', content: '正文' },
    { type: 'image', title: '照片', blob: 'base64', thumb: 'base64', tags: ['红叶'] },
  ],
};

const validAllBackup = {
  app: 'TripSnippet',
  version: 1,
  kind: 'all',
  projects: [{ id: 1, name: '京都五日' }],
  materials: [{ type: 'audio', title: '录音', blob: 'base64', tags: [] }],
  tags: ['红叶', '寺庙'],
};

describe('常量', () => {
  it('备份版本与素材类型定义完整', () => {
    expect(BACKUP_VERSION).toBe(1);
    expect(MATERIAL_TYPES).toEqual(['text', 'image', 'audio']);
  });
});

describe('validateMaterial', () => {
  it('合法素材通过校验', () => {
    expect(() => validateMaterial({ type: 'text', title: 'a' }, 0)).not.toThrow();
    expect(() => validateMaterial({ type: 'image', blob: 'b64', thumb: 'b64', tags: [] }, 0)).not.toThrow();
  });
  it('非对象记录被拦截', () => {
    expect(() => validateMaterial(null, 2)).toThrow('第 3 条素材记录无效');
  });
  it('素材类型无效被拦截', () => {
    expect(() => validateMaterial({ type: 'video', title: 'x' }, 0)).toThrow('素材「x」的类型无效');
  });
  it('文件与缩略图数据损坏被拦截', () => {
    expect(() => validateMaterial({ type: 'image', blob: 123 }, 0)).toThrow('文件数据已损坏');
    expect(() => validateMaterial({ type: 'image', thumb: {} }, 0)).toThrow('缩略图数据已损坏');
  });
  it('标签非数组被拦截', () => {
    expect(() => validateMaterial({ type: 'text', tags: '红叶' }, 0)).toThrow('标签数据无效');
  });
});

describe('validateProject', () => {
  it('合法项目通过校验', () => {
    expect(() => validateProject({ name: '京都' }, '项目「京都」')).not.toThrow();
  });
  it('缺名称 / 空名称 / 非对象被拦截', () => {
    expect(() => validateProject(null, '备份内')).toThrow('备份内缺少有效的项目名称');
    expect(() => validateProject({ name: '  ' }, '备份内')).toThrow('备份内缺少有效的项目名称');
    expect(() => validateProject({ id: 1 }, '备份内')).toThrow('备份内缺少有效的项目名称');
  });
});

describe('validateBackup · 项目备份', () => {
  it('合法项目备份通过校验', () => {
    expect(() => validateBackup(validProjectBackup, 'project')).not.toThrow();
  });
  it('根节点非对象被拦截', () => {
    expect(() => validateBackup(null, 'project')).toThrow('备份文件格式错误（根节点不是 JSON 对象）');
    expect(() => validateBackup('x', 'project')).toThrow('备份文件格式错误（根节点不是 JSON 对象）');
  });
  it('非 TripSnippet 备份被拦截', () => {
    expect(() => validateBackup({ app: 'Other', version: 1 }, 'project')).toThrow(
      '这不是有效的 TripSnippet 备份文件'
    );
  });
  it('版本号非法被拦截', () => {
    expect(() => validateBackup({ app: 'TripSnippet', version: 0 }, 'project')).toThrow('备份版本号无效');
    expect(() => validateBackup({ app: 'TripSnippet', version: '1' }, 'project')).toThrow('备份版本号无效');
    expect(() => validateBackup({ app: 'TripSnippet', version: 1.5 }, 'project')).toThrow('备份版本号无效');
  });
  it('来自更新版本的备份被拦截', () => {
    expect(() => validateBackup({ app: 'TripSnippet', version: BACKUP_VERSION + 1 }, 'project')).toThrow(
      '备份来自更新版本的应用，请先升级 TripSnippet'
    );
  });
  it('备份类型不匹配被拦截', () => {
    expect(() => validateBackup({ ...validProjectBackup, kind: 'all' }, 'project')).toThrow(
      '这不是有效的 TripSnippet 项目备份文件'
    );
    expect(() => validateBackup(validProjectBackup, 'all')).toThrow('这不是有效的 TripSnippet 全库备份文件');
  });
  it('素材列表非法被拦截', () => {
    const bad = { ...validProjectBackup, materials: '不是数组' };
    expect(() => validateBackup(bad, 'project')).toThrow('备份内的素材列表无效');
  });
});

describe('validateBackup · 全库备份', () => {
  it('合法全库备份通过校验', () => {
    expect(() => validateBackup(validAllBackup, 'all')).not.toThrow();
  });
  it('没有可恢复项目被拦截', () => {
    const empty = { ...validAllBackup, projects: [] };
    expect(() => validateBackup(empty, 'all')).toThrow('备份内没有可恢复的项目');
  });
  it('项目缺名称被拦截（带项目名提示）', () => {
    const bad = { ...validAllBackup, projects: [{ id: 2, name: '' }] };
    expect(() => validateBackup(bad, 'all')).toThrow('项目「未命名」缺少有效的项目名称');
  });
  it('标签池非法被拦截', () => {
    const bad = { ...validAllBackup, tags: '红叶' };
    expect(() => validateBackup(bad, 'all')).toThrow('备份内的标签池数据无效');
  });
  it('素材类型无效被拦截', () => {
    const bad = { ...validAllBackup, materials: [{ type: 'video', title: 'x' }] };
    expect(() => validateBackup(bad, 'all')).toThrow('素材「x」的类型无效');
  });
});
