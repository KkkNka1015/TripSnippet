/**
 * format.js 纯函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { formatDate, formatSize, sanitizeFilename, extFromMime, sourceLabel } from '../../src/utils/format';

describe('formatDate', () => {
  it('格式化为 YYYY.MM.DD', () => {
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe('2026.01.05');
    expect(formatDate(new Date(2026, 11, 31).getTime())).toBe('2026.12.31');
  });
  it('空值返回空字符串', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(0)).toBe('');
  });
});

describe('formatSize', () => {
  it('空值显示占位符', () => {
    expect(formatSize(null)).toBe('—');
    expect(formatSize(undefined)).toBe('—');
  });
  it('按数量级换算单位', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
  });
});

describe('sanitizeFilename', () => {
  it('特殊字符替换为下划线', () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h')).toBe('a_b_c_d_e_f_g_h');
  });
  it('连续空白与下划线合并为单个下划线', () => {
    expect(sanitizeFilename('京都  五日   游')).toBe('京都_五日_游');
  });
  it('空输入回退为「未命名」', () => {
    expect(sanitizeFilename('')).toBe('未命名');
    expect(sanitizeFilename(null)).toBe('未命名');
  });
  it('超长文件名按 maxLen 截断', () => {
    expect(sanitizeFilename('x'.repeat(60), 10)).toBe('xxxxxxxxxx');
  });
});

describe('extFromMime', () => {
  it('识别常见 mime 类型', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg');
    expect(extFromMime('image/png')).toBe('png');
    expect(extFromMime('audio/mpeg')).toBe('mp3');
  });
  it('兼容带 codecs 参数的 mime（如录音 webm）', () => {
    expect(extFromMime('audio/webm;codecs=opus')).toBe('webm');
  });
  it('未知或空 mime 回退到 fallback', () => {
    expect(extFromMime('application/xyz')).toBe('bin');
    expect(extFromMime(null)).toBe('bin');
    expect(extFromMime(null, 'mp3')).toBe('mp3');
  });
});

describe('sourceLabel', () => {
  it('按来源类型映射展示名', () => {
    expect(sourceLabel({ sourceType: 'record' })).toBe('在线录音');
    expect(sourceLabel({ sourceType: 'url' })).toBe('网页链接导入');
    expect(sourceLabel({ sourceType: 'clipboard' })).toBe('剪贴板导入');
  });
  it('未知来源回退为「手动导入」', () => {
    expect(sourceLabel({})).toBe('手动导入');
    expect(sourceLabel(null)).toBe('手动导入');
  });
});
