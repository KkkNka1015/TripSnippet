import { describe, it, expect } from 'vitest';
import { buildStandaloneHtml, escapeHtml } from '../../src/utils/html-note';

const project = { name: '京都秋日漫游', description: '五日红叶行程' };

/** 快速构造素材 */
function mat(overrides = {}) {
  return {
    id: 'm1',
    type: 'text',
    title: '素材标题',
    content: '正文内容',
    travelDate: '',
    remark: '',
    sourceUrl: '',
    tags: [],
    order: 0,
    ...overrides,
  };
}

const emptyUris = new Map();

describe('escapeHtml', () => {
  it('转义全部危险字符', () => {
    expect(escapeHtml(`<script>&"'</script>`)).toBe('&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;');
  });
});

describe('buildStandaloneHtml 基础结构', () => {
  it('包含项目名、描述与统计行', () => {
    const html = buildStandaloneHtml({
      project,
      materials: [mat(), mat({ id: 'm2', type: 'image', title: '一张图' })],
      imageUris: new Map([['m2', 'data:image/jpeg;base64,AAA']]),
      audioUris: emptyUris,
    });
    expect(html).toContain('<title>京都秋日漫游 · 旅行笔记</title>');
    expect(html).toContain('京都秋日漫游');
    expect(html).toContain('五日红叶行程');
    expect(html).toContain('文本 1 · 图片 1 · 音频 0');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('name="viewport"');
  });

  it('图片素材内嵌 data URI，音频素材输出 audio 控件', () => {
    const html = buildStandaloneHtml({
      project,
      materials: [
        mat({ id: 'i1', type: 'image', title: '图' }),
        mat({ id: 'a1', type: 'audio', title: '录音' }),
      ],
      imageUris: new Map([['i1', 'data:image/jpeg;base64,BBB']]),
      audioUris: new Map([['a1', 'data:audio/webm;base64,CCC']]),
    });
    expect(html).toContain('<img src="data:image/jpeg;base64,BBB"');
    expect(html).toContain('<audio controls preload="metadata" src="data:audio/webm;base64,CCC"');
  });

  it('完整版输出卡片与素材清单标题', () => {
    const html = buildStandaloneHtml({ project, materials: [mat()], imageUris: emptyUris, audioUris: emptyUris });
    expect(html).toContain('<h2>素材清单</h2>');
    expect(html).toContain('<article class="card">');
    expect(html).toContain('正文内容');
  });

  it('精简版输出紧凑列表与提示', () => {
    const html = buildStandaloneHtml({
      project,
      materials: [mat()],
      noteMode: 'brief',
      imageUris: emptyUris,
      audioUris: emptyUris,
    });
    expect(html).toContain('素材清单（精简版）');
    expect(html).not.toContain('<article class="card">');
    expect(html).toContain('「完整版」重新导出');
  });

  it('用户内容被 HTML 转义，防止注入', () => {
    const html = buildStandaloneHtml({
      project: { ...project, name: '<script>alert(1)</script>' },
      materials: [
        mat({
          title: '<img src=x onerror=alert(2)>',
          remark: '<b>备注</b>',
          sourceUrl: 'https://example.com/?a=1&b=2',
        }),
      ],
      imageUris: emptyUris,
      audioUris: emptyUris,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;b&gt;备注&lt;/b&gt;');
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('buildStandaloneHtml 行程时间轴', () => {
  it('按 Day 分组并按时段排序输出', () => {
    const html = buildStandaloneHtml({
      project,
      materials: [
        mat({ id: 'd1', title: '下午活动', remark: 'Day2 下午：清水寺' }),
        mat({ id: 'd2', title: '上午活动', travelDate: 'Day2 上午：伏见稻荷' }),
        mat({ id: 'd3', title: '前一天', travelDate: 'Day1 中午：抵达' }),
      ],
      imageUris: emptyUris,
      audioUris: emptyUris,
    });
    expect(html).toContain('<h2>行程时间轴</h2>');
    const day1 = html.indexOf('Day 1');
    const day2 = html.indexOf('Day 2');
    const am = html.indexOf('上午</strong> · 上午活动');
    const pm = html.indexOf('下午</strong> · 下午活动');
    expect(day1).toBeGreaterThan(-1);
    expect(day2).toBeGreaterThan(day1);
    expect(am).toBeGreaterThan(-1);
    expect(pm).toBeGreaterThan(am);
  });

  it('无 Day 标记时不输出时间轴区块', () => {
    const html = buildStandaloneHtml({ project, materials: [mat()], imageUris: emptyUris, audioUris: emptyUris });
    expect(html).not.toContain('行程时间轴');
  });
});
