/**
 * 旅行汇总笔记（Markdown）生成器
 * - 序号严格按用户拖拽排序顺序生成
 * - 汇总全部攻略文案、素材备注、来源链接
 * - 识别素材备注内的行程时间标记（Day2 下午：xxx）并结构化展示
 * - 支持完整版 / 精简版
 */
import { formatDate } from './format';

/** 时段解析顺序 */
const SLOT_ORDER = ['凌晨', '上午', '中午', '下午', '傍晚', '晚上', '夜里'];

/**
 * 从备注中解析行程时间标记，如 "Day2 下午：海边打卡"
 * @returns {{ day:number, slot:string } | null}
 */
export function parseDayMarker(remark) {
  if (!remark) return null;
  const m = /day\s*(\d{1,2})/i.exec(remark);
  if (!m) return null;
  const day = Number(m[1]);
  let slot = '未标注时段';
  const slotMatch = /(凌晨|上午|中午|下午|傍晚|晚上|夜里)/.exec(remark.slice(0, m.index + m[0].length + 12));
  if (slotMatch) slot = slotMatch[1];
  return { day, slot };
}

function slotIndex(slot) {
  return slot === '未标注时段' ? 99 : SLOT_ORDER.indexOf(slot);
}

/** 生成「行程时间轴」结构化段落（行程时间字段优先，备注 Day 标记后备） */
function buildTimelineSection(materials) {
  const withDay = [];
  const noDay = [];
  materials.forEach((m) => {
    const marker = parseDayMarker(m.travelDate) || parseDayMarker(m.remark);
    if (marker) withDay.push({ m, marker });
    else noDay.push(m);
  });
  if (!withDay.length) return '';

  const byDay = new Map();
  for (const { m, marker } of withDay) {
    if (!byDay.has(marker.day)) byDay.set(marker.day, []);
    byDay.get(marker.day).push({ m, marker });
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  const lines = ['## 行程时间轴', ''];
  lines.push('> 依据素材备注中的「Day + 时段」标记自动整理，可作为行程清单直接使用', '');
  for (const day of days) {
    const items = byDay.get(day).sort((a, b) => {
      const sa = slotIndex(a.marker.slot);
      const sb = slotIndex(b.marker.slot);
      if (sa !== sb) return sa - sb;
      return (a.m.order ?? 0) - (b.m.order ?? 0);
    });
    lines.push(`### Day ${day}`, '');
    const grouped = new Map();
    for (const it of items) {
      if (!grouped.has(it.marker.slot)) grouped.set(it.marker.slot, []);
      grouped.get(it.marker.slot).push(it.m);
    }
    for (const slot of SLOT_ORDER.concat('未标注时段')) {
      if (!grouped.has(slot)) continue;
      for (const m of grouped.get(slot)) {
        const brief = (m.remark || '').replace(/\n+/g, ' ');
        lines.push(`- **${slot}** · ${m.title}${brief && !brief.startsWith(m.title) ? ` — ${brief}` : ''}`);
      }
    }
    lines.push('');
  }
  if (noDay.length) {
    lines.push(`### 其他素材（未标注 Day，共 ${noDay.length} 项）`, '');
    for (const m of noDay) lines.push(`- ${m.title}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** 单个素材的完整条目 */
function buildFullEntry(m, index, imageFiles, opts = {}) {
  const { imageRefPrefix = 'images/', outputMode = 'zip' } = opts;
  const lines = [`## ${index}. ${m.title}`, ''];
  if (m.type === 'image') {
    const file = imageFiles.get(m.id);
    lines.push(`![${m.title}](${imageRefPrefix}${file})`, '');
  } else if (m.type === 'audio') {
    lines.push(
      outputMode === 'single'
        ? '> 该素材含音频，请使用「ZIP 素材包」导出获取'
        : '> 配套音频见 `audio/` 目录',
      ''
    );
  }
  if (m.content) {
    lines.push(m.content.trim(), '');
  }
  if (m.travelDate) {
    lines.push(`**行程时间：** ${m.travelDate.trim()}`, '');
  }
  if (m.remark) {
    lines.push(`**备注：** ${m.remark.trim()}`, '');
  }
  if (m.sourceUrl) {
    lines.push(`**来源：** ${m.sourceUrl}`, '');
  }
  if (m.tags?.length) {
    lines.push(`**标签：** ${m.tags.map((t) => `\`${t}\``).join(' ')}`, '');
  }
  lines.push('---', '');
  return lines.join('\n');
}

/** 单个素材的精简行 */
function buildBriefEntry(m, index) {
  const typeLabel = { text: '攻略', image: '图片', audio: '音频' }[m.type] || '素材';
  const briefSource = m.remark || m.content || '';
  const firstLine = briefSource.split('\n').find((l) => l.trim()) || '';
  const brief = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
  const dayMark = parseDayMarker(m.travelDate) || parseDayMarker(m.remark);
  const dayText = dayMark ? `（Day ${dayMark.day}）` : '';
  return `${index}. [${typeLabel}]${dayText} ${m.title}${brief && brief !== m.title ? ` — ${brief}` : ''}`;
}

/**
 * 生成 旅行汇总笔记.md
 * @param {object} opts
 * @param {object} opts.project 项目
 * @param {Array} opts.materials 已按拖拽顺序排序的素材
 * @param {'full'|'brief'} opts.noteMode 完整版 / 精简版
 * @param {Map} opts.imageFiles materialId -> zip 内文件名（单文件模式为 data URI）
 * @param {string} opts.imageRefPrefix 图片引用前缀，ZIP 为 'images/'，单文件为 ''
 * @param {'zip'|'single'} opts.outputMode 输出形态（影响音频提示与结尾说明）
 */
export function generateTravelNote({ project, materials, noteMode = 'full', imageFiles, imageRefPrefix = 'images/', outputMode = 'zip' }) {
  const now = formatDate(Date.now());
  const counts = {
    text: materials.filter((m) => m.type === 'text').length,
    image: materials.filter((m) => m.type === 'image').length,
    audio: materials.filter((m) => m.type === 'audio').length,
  };

  const head = [
    `# ${project.name} · 旅行汇总笔记`,
    '',
    `> 由 TripSnippet 本地生成于 ${now} ｜ 文本 ${counts.text} · 图片 ${counts.image} · 音频 ${counts.audio}`,
    '',
  ];
  if (project.description) head.push(project.description, '');

  const timeline = buildTimelineSection(materials);

  const body = [];
  if (noteMode === 'full') {
    body.push('## 素材清单', '');
    materials.forEach((m, i) => body.push(buildFullEntry(m, i + 1, imageFiles, { imageRefPrefix, outputMode })));
  } else {
    body.push('## 素材清单（精简版）', '');
    materials.forEach((m, i) => body.push(buildBriefEntry(m, i + 1)));
    body.push('', '> 展示完整文案与配图请选择「完整版」重新导出', '');
  }

  const tail =
    outputMode === 'single'
      ? [
          '## 使用说明',
          '',
          '- 本笔记为单文件版本，图片已内嵌，可直接在任何 Markdown 阅读器打开',
          '- 含音频素材时请使用「ZIP 素材包」格式导出获取音频文件',
          '- 本笔记序号即素材在 TripSnippet 中的排序，可拖拽调整后重新导出',
          '- 所有素材仅供个人学习与旅行规划使用，请遵守原网站版权协议，禁止商用',
          '',
        ]
      : [
          '## 使用说明',
          '',
          '- 本笔记序号即素材在 TripSnippet 中的排序，可拖拽调整后重新导出',
          '- 图片位于 `images/`，音频位于 `audio/` 目录',
          '- 所有素材仅供个人学习与旅行规划使用，请遵守原网站版权协议，禁止商用',
          '',
        ];

  return head.filter((l) => l !== undefined).join('\n') + '\n' + timeline + '\n' + body.join('\n') + '\n' + tail.join('\n');
}
