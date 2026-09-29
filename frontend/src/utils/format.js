/** 格式化工具 */

export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${m}.${day}`;
}

export function formatMonth(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 素材来源展示名 */
export const SOURCE_TYPE_LABEL = {
  clipboard: '剪贴板导入',
  url: '网页链接导入',
  manual: '手动粘贴',
  file: '本地导入',
  record: '在线录音',
};

export function sourceLabel(m) {
  return SOURCE_TYPE_LABEL[m?.sourceType] || '手动导入';
}

/** 清洗文件名：去除特殊字符，避免压缩包报错/乱码 */
export function sanitizeFilename(name, maxLen = 40) {
  const cleaned = (name || '')
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!'@+`=~^|[\]]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  // 故意保留：剔除文件名中的控制字符，防止压缩包报错/乱码
  // eslint-disable-next-line no-control-regex
  const kept = cleaned.replace(/[\u0000-\u001f\u007f]/g, '');
  return (kept || '未命名').slice(0, maxLen);
}

/** 依据 mime 判断扩展名（兼容带 codecs 参数的 mime，如 audio/webm;codecs=opus） */
export function extFromMime(mime, fallback = 'bin') {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/webm': 'webm',
    'text/plain': 'txt',
  };
  return map[(mime || '').split(';')[0].trim()] || fallback;
}

/** blob -> objectURL（组件卸载时可 revoke） */
export function blobUrl(blob) {
  return blob ? URL.createObjectURL(blob) : '';
}
