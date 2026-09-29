/**
 * markdown.js 单元测试：行程时间标记解析与旅行汇总笔记生成
 * - 序号必须严格按传入（拖拽）顺序生成
 * - Day + 时段标记自动排入行程时间轴
 */
import { describe, it, expect } from 'vitest';
import { parseDayMarker, generateTravelNote } from '../../src/utils/markdown';

describe('parseDayMarker', () => {
  it('解析「Day + 时段」标记', () => {
    expect(parseDayMarker('Day2 下午：海边打卡')).toEqual({ day: 2, slot: '下午' });
    expect(parseDayMarker('Day12 傍晚 灯笼节')).toEqual({ day: 12, slot: '傍晚' });
  });
  it('大小写不敏感，无时段时标记为未标注', () => {
    expect(parseDayMarker('day 3')).toEqual({ day: 3, slot: '未标注时段' });
  });
  it('无标记内容返回 null', () => {
    expect(parseDayMarker('')).toBeNull();
    expect(parseDayMarker(null)).toBeNull();
    expect(parseDayMarker('随便写写没有天数')).toBeNull();
  });
});

describe('generateTravelNote', () => {
  const project = { name: '京都五日', description: '秋季红叶之旅' };
  const materials = [
    { id: 3, type: 'text', title: '第三站', content: '行程收尾', order: 2 },
    { id: 1, type: 'text', title: '第一站', content: '行程开篇', order: 0 },
    { id: 2, type: 'image', title: '清水寺', travelDate: 'Day2 上午', order: 1 },
  ];
  const imageFiles = new Map([[2, '01_清水寺.jpg']]);

  it('序号严格按传入顺序（拖拽顺序）生成', () => {
    const note = generateTravelNote({ project, materials, noteMode: 'full', imageFiles });
    expect(note).toContain('# 京都五日 · 旅行汇总笔记');
    const firstIdx = note.indexOf('## 1. 第三站');
    const secondIdx = note.indexOf('## 2. 第一站');
    const thirdIdx = note.indexOf('## 3. 清水寺');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it('图片素材引用 imageFiles 提供的 zip 内文件名', () => {
    const note = generateTravelNote({ project, materials, noteMode: 'full', imageFiles });
    expect(note).toContain('![清水寺](images/01_清水寺.jpg)');
  });

  it('含 Day 标记的素材进入行程时间轴，备注与行程时间字段均可识别', () => {
    const note = generateTravelNote({ project, materials, noteMode: 'full', imageFiles });
    expect(note).toContain('## 行程时间轴');
    expect(note).toContain('### Day 2');
    expect(note).toContain('**上午** · 清水寺');
    expect(note).toContain('### 其他素材（未标注 Day，共 2 项）');
  });

  it('精简版输出精简行与提示', () => {
    const note = generateTravelNote({ project, materials, noteMode: 'brief', imageFiles });
    expect(note).toContain('## 素材清单（精简版）');
    expect(note).toContain('1. [攻略] 第三站');
    expect(note).toContain('3. [图片]（Day 2） 清水寺');
    expect(note).toContain('> 展示完整文案与配图请选择「完整版」重新导出');
  });

  it('项目描述缺失时不输出描述行', () => {
    const note = generateTravelNote({ project: { name: '空项目' }, materials: [], noteMode: 'full', imageFiles });
    expect(note).toContain('# 空项目 · 旅行汇总笔记');
    expect(note).not.toContain('空描述');
  });
});