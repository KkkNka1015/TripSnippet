/**
 * 单文件 HTML 旅行笔记生成器（纯字符串拼接，无 DOM 依赖）
 * - 图片 / 音频以 base64 data URI 内嵌，任何设备浏览器双击即可查看
 * - 复用 markdown.js 的行程时间标记解析，时间轴按 Day + 时段分组
 * - 用户内容全部经过 HTML 转义；主线程与导出 Worker 共用，可单测
 */
import { formatDate } from './format';
import { parseDayMarker } from './markdown';

const SLOT_ORDER = ['凌晨', '上午', '中午', '下午', '傍晚', '晚上', '夜里'];

function slotIndex(slot) {
  return slot === '未标注时段' ? 99 : SLOT_ORDER.indexOf(slot);
}

/** HTML 文本转义（标题 / 备注 / 正文等用户内容） */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 多行文本 → <p> 段落（保留换行） */
function textToParagraphs(str) {
  return escapeHtml(str)
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** 行程时间轴 HTML（Day + 时段分组） */
function buildTimelineHtml(materials) {
  const withDay = [];
  materials.forEach((m) => {
    const marker = parseDayMarker(m.travelDate) || parseDayMarker(m.remark);
    if (marker) withDay.push({ m, marker });
  });
  if (!withDay.length) return '';

  const byDay = new Map();
  for (const { m, marker } of withDay) {
    if (!byDay.has(marker.day)) byDay.set(marker.day, []);
    byDay.get(marker.day).push({ m, marker });
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  const parts = ['<section class="timeline"><h2>行程时间轴</h2>', '<p class="hint">依据素材备注中的「Day + 时段」标记自动整理，可作为行程清单使用</p>'];
  for (const day of days) {
    const items = byDay.get(day).sort((a, b) => {
      const sa = slotIndex(a.marker.slot);
      const sb = slotIndex(b.marker.slot);
      if (sa !== sb) return sa - sb;
      return (a.m.order ?? 0) - (b.m.order ?? 0);
    });
    parts.push(`<h3>Day ${day}</h3><ul>`);
    for (const it of items) {
      const brief = (it.m.remark || '').replace(/\s+/g, ' ').trim();
      const briefText = brief && !brief.startsWith(it.m.title) ? ` —— ${escapeHtml(brief)}` : '';
      parts.push(`<li><strong>${escapeHtml(it.marker.slot)}</strong> · ${escapeHtml(it.m.title)}${briefText}</li>`);
    }
    parts.push('</ul>');
  }
  parts.push('</section>');
  return parts.join('\n');
}

/** 单个素材卡片（完整版） */
function buildCard(m, index, imageUris, audioUris) {
  const typeLabel = { text: '攻略', image: '图片', audio: '音频' }[m.type] || '素材';
  const chips = [`<span class="chip">${typeLabel}</span>`];
  if (m.tags?.length) {
    for (const t of m.tags) chips.push(`<span class="chip chip-tag">${escapeHtml(t)}</span>`);
  }

  const media =
    m.type === 'image' && imageUris.get(m.id)
      ? `<img src="${imageUris.get(m.id)}" alt="${escapeHtml(m.title)}" loading="lazy">`
      : m.type === 'audio' && audioUris.get(m.id)
        ? `<audio controls preload="metadata" src="${audioUris.get(m.id)}"></audio>`
        : '';

  const row = (label, val, isUrl = false) =>
    val
      ? `<p class="meta"><span class="meta-label">${label}</span>${
          isUrl ? `<a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer">${escapeHtml(val)}</a>` : escapeHtml(val)
        }</p>`
      : '';

  return [
    `<article class="card">`,
    `<div class="card-head"><span class="index">${index}</span><h3>${escapeHtml(m.title)}</h3><span class="chips">${chips.join('')}</span></div>`,
    media,
    m.content ? `<div class="content">${textToParagraphs(m.content)}</div>` : '',
    row('行程时间', (m.travelDate || '').trim()),
    row('备注', (m.remark || '').trim()),
    row('来源', (m.sourceUrl || '').trim(), true),
    `</article>`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 精简版列表 */
function buildBriefList(materials) {
  const items = materials.map((m, i) => {
    const typeLabel = { text: '攻略', image: '图片', audio: '音频' }[m.type] || '素材';
    const briefSource = m.remark || m.content || '';
    const firstLine = briefSource.split('\n').find((l) => l.trim()) || '';
    const brief = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
    const dayMark = parseDayMarker(m.travelDate) || parseDayMarker(m.remark);
    const dayText = dayMark ? `<span class="day-mark">Day ${dayMark.day}</span>` : '';
    const briefText = brief && brief !== m.title ? ` —— ${escapeHtml(brief)}` : '';
    return `<li>${i + 1}. <span class="chip">${typeLabel}</span>${dayText} <strong>${escapeHtml(m.title)}</strong>${briefText}</li>`;
  });
  return `<section class="brief"><h2>素材清单（精简版）</h2><ul>${items.join('\n')}</ul><p class="hint">展示完整文案与配图请选择「完整版」重新导出</p></section>`;
}

const BASE_CSS = `
:root{--paper:#f5efe2;--card:#fffdf7;--ink:#3e332a;--ink-soft:#7a6c58;--gold:#c4a876;--line:#d9c9a8}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:"Noto Serif SC","Songti SC",Georgia,system-ui,serif;line-height:1.75;padding:24px 16px 48px}
.wrap{max-width:760px;margin:0 auto}
header{border-bottom:3px double var(--gold);padding-bottom:20px;margin-bottom:28px}
header h1{font-size:26px;letter-spacing:1px;margin-bottom:8px}
.stats{color:var(--ink-soft);font-size:13px}
.desc{margin-top:10px;color:var(--ink-soft)}
h2{font-size:19px;margin:30px 0 12px;padding-left:10px;border-left:4px solid var(--gold)}
h3{font-size:16px;margin:18px 0 8px;color:var(--ink)}
.hint{color:var(--ink-soft);font-size:12.5px;margin-bottom:12px}
.timeline ul,.brief ul{list-style:none}
.timeline li,.brief li{padding:6px 0;border-bottom:1px dashed var(--line);font-size:14.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:18px;box-shadow:0 1px 3px rgba(62,51,42,.06)}
.card-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.card-head .index{background:var(--gold);color:#fff;border-radius:6px;padding:0 8px;font-size:13px;flex-shrink:0}
.card-head h3{margin:0;font-size:17px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.chip{background:rgba(196,168,118,.16);color:#8a6f3c;border:1px solid rgba(196,168,118,.4);border-radius:999px;padding:0 10px;font-size:12px;white-space:nowrap}
.day-mark{background:rgba(196,168,118,.16);border-radius:4px;padding:0 6px;font-size:12px;color:#8a6f3c;margin:0 2px}
.card img{width:100%;max-width:100%;border-radius:8px;border:1px solid var(--line);margin:8px 0}
.card audio{width:100%;margin:8px 0}
.content p{margin:8px 0;font-size:14.5px;white-space:normal;word-break:break-word}
.meta{font-size:13.5px;margin:6px 0;color:var(--ink)}
.meta-label{display:inline-block;background:rgba(62,51,42,.06);border-radius:4px;padding:0 8px;margin-right:8px;font-size:12px;color:var(--ink-soft)}
.meta a{color:#8a6f3c;word-break:break-all}
footer{margin-top:36px;border-top:1px solid var(--line);padding-top:14px;color:var(--ink-soft);font-size:12.5px}
footer ul{list-style:disc;padding-left:20px}
footer li{margin:4px 0}
@media print{body{background:#fff;padding:0}.card{box-shadow:none;break-inside:avoid}}
`;

/**
 * 生成单文件 HTML 旅行笔记
 * @param {object} opts
 * @param {object} opts.project 项目
 * @param {Array} opts.materials 已按拖拽顺序排序的素材
 * @param {'full'|'brief'} opts.noteMode
 * @param {Map} opts.imageUris materialId -> data URI
 * @param {Map} opts.audioUris materialId -> data URI
 * @returns {string} 完整 HTML 文档
 */
export function buildStandaloneHtml({ project, materials, noteMode = 'full', imageUris, audioUris }) {
  const counts = {
    text: materials.filter((m) => m.type === 'text').length,
    image: materials.filter((m) => m.type === 'image').length,
    audio: materials.filter((m) => m.type === 'audio').length,
  };
  const title = `${project.name} · 旅行笔记`;

  const body = [
    buildTimelineHtml(materials),
    noteMode === 'full'
      ? `<section><h2>素材清单</h2>${materials.map((m, i) => buildCard(m, i + 1, imageUris, audioUris)).join('\n')}</section>`
      : buildBriefList(materials),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="TripSnippet">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="wrap">
<header>
<h1>${escapeHtml(project.name)}</h1>
<p class="stats">由 TripSnippet 本地生成于 ${formatDate(Date.now())} ｜ 文本 ${counts.text} · 图片 ${counts.image} · 音频 ${counts.audio}</p>
${project.description ? `<p class="desc">${escapeHtml(project.description)}</p>` : ''}
</header>
${body}
<footer>
<ul>
<li>本文件为单文件网页，图片与音频已内嵌，用任意浏览器打开即可查看，可随意转发携带</li>
<li>素材序号即 TripSnippet 中的排序，可在应用内拖拽调整后重新导出</li>
<li>换设备想在应用内查看：在首页打开「导入恢复备份」，导入 JSON 备份文件即可还原</li>
<li>所有素材仅供个人学习与旅行规划使用，请遵守原网站版权协议，禁止商用</li>
</ul>
</footer>
</div>
</body>
</html>`;
}
