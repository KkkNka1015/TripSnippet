/**
 * 图片处理：入库压缩 / 缩略图生成 / 导出压缩
 * 策略（已与产品确认）：入库时即压缩（最长边 ≤1600px 高画质 JPEG），
 * 该版本作为库内最高画质；导出"压缩图"时再压一次（≤1024px）。
 */

const MAX_IMPORT_EDGE = 1600;
const IMPORT_QUALITY = 0.86;
const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.72;
const EXPORT_COMPRESS_EDGE = 1024;
const EXPORT_QUALITY = 0.72;

/** 兼容性良好的图片解码：createImageBitmap 优先，降级为 <img> */
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* 降级 */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片解码失败'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  // OffscreenCanvas（Web Worker）无 toBlob，走 convertToBlob
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('图片编码失败'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * 压缩图片；GIF（动图）直接原样返回，避免丢帧。
 * 返回 { blob, width, height }
 */
export async function compressImage(blob, { maxEdge = MAX_IMPORT_EDGE, quality = IMPORT_QUALITY } = {}) {
  if (blob.type === 'image/gif') {
    return { blob, width: 0, height: 0 };
  }
  const img = await decode(blob);
  const w = img.width || img.naturalWidth;
  const h = img.height || img.naturalHeight;
  if (!w || !h) return { blob, width: 0, height: 0 };

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  // Worker 环境无 document，优先 OffscreenCanvas
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(cw, ch)
      : document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  // 白底填充，避免 PNG 透明区转 JPEG 后变黑
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const out = await canvasToBlob(canvas, quality);
  if ('close' in img && typeof img.close === 'function') img.close();
  // 压缩失败或反而更大时保留原结果
  if (!out || out.size >= blob.size) return { blob, width: w, height: h };
  return { blob: out, width: cw, height: ch };
}

/** 生成列表展示用小缩略图 */
export async function makeThumb(blob) {
  if (blob.type === 'image/gif') return null; // gif 直接原图展示
  try {
    const { blob: t } = await compressImage(blob, { maxEdge: THUMB_EDGE, quality: THUMB_QUALITY });
    return t.size < blob.size ? t : null;
  } catch {
    return null;
  }
}

/** 导出用压缩（"压缩图"选项） */
export async function compressForExport(blob) {
  try {
    const { blob: out } = await compressImage(blob, {
      maxEdge: EXPORT_COMPRESS_EDGE,
      quality: EXPORT_QUALITY,
    });
    return out;
  } catch {
    return blob;
  }
}

/** 校验本地文件类型与大小 */
export const FILE_RULES = {
  image: {
    accept: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSize: 10 * 1024 * 1024,
    label: '图片（jpg/png/webp/gif，≤10MB）',
  },
  audio: {
    accept: ['audio/mpeg', 'audio/mp3'],
    maxSize: 20 * 1024 * 1024,
    label: 'mp3 音频（≤20MB）',
  },
  text: {
    accept: ['text/plain', 'text/markdown'],
    maxSize: 1 * 1024 * 1024,
    label: '文本（txt/md，≤1MB）',
  },
};

/** 校验并分类文件，返回 { ok, type, reason } */
export function validateFile(file) {
  for (const [type, rule] of Object.entries(FILE_RULES)) {
    const okMime = rule.accept.includes(file.type);
    const okName = type === 'audio' ? /\.mp3$/i.test(file.name) : true;
    if (okMime || (okName && type === 'audio')) {
      if (file.size > rule.maxSize) {
        return { ok: false, type, reason: `文件过大（${rule.label}）` };
      }
      return { ok: true, type };
    }
  }
  // 未知后缀拦截：拦截非法格式
  return { ok: false, type: null, reason: '仅支持图片、mp3 音频与文本素材' };
}
