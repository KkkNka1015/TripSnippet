/**
 * packer-core.js 单元测试：导出大小估算与超大包阈值
 */
import { describe, it, expect } from 'vitest';
import { estimatePack, packSizeInfo } from '../../src/utils/packer-core';

describe('estimatePack', () => {
  it('图片按导出模式估算（压缩模式取 55%）', () => {
    const images = [{ type: 'image', blob: {}, size: 10000 }];
    expect(estimatePack(images, 'original')).toBe(10000);
    expect(estimatePack(images, 'compressed')).toBe(5500);
  });
  it('音频按素材 size 估算', () => {
    expect(estimatePack([{ type: 'audio', blob: {}, size: 4096 }], 'original')).toBe(4096);
  });
  it('文本按正文字节数估算', () => {
    expect(estimatePack([{ type: 'text', content: 'hello' }], 'original')).toBe(5);
  });
  it('空素材列表估值为 0', () => {
    expect(estimatePack([], 'compressed')).toBe(0);
  });
});

describe('packSizeInfo', () => {
  const THRESHOLD = 50 * 1024 * 1024;
  it('低于阈值不提示超大包', () => {
    const info = packSizeInfo([{ type: 'text', content: '很小' }], 'original');
    expect(info.bytes).toBeGreaterThan(0);
    expect(info.tooBig).toBe(false);
    expect(info.threshold).toBe(THRESHOLD);
  });
  it('超过阈值提示超大包', () => {
    const big = THRESHOLD + 1;
    const info = packSizeInfo([{ type: 'image', blob: {}, size: big }], 'original');
    expect(info.bytes).toBe(big);
    expect(info.tooBig).toBe(true);
  });
});