/**
 * 素材去重：内容指纹（sha256）
 * - 文本：text| + 去首尾空白后的内容
 * - 图片：img| + 压缩后的二进制（导入统一走 compressImage，同源图片指纹一致）
 * - 老素材没有 contentHash 时现算并惰性回写 IndexedDB，下次直接命中
 * - 音频不入指纹（大文件、重复概率低），指纹算不出时不拦截导入
 */
import { db } from '../db';

async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 文本素材指纹 */
export function textHash(content) {
  const bytes = new TextEncoder().encode(`text|${(content || '').trim()}`);
  return sha256Hex(bytes);
}

/** 图片素材指纹（Blob 二进制） */
export async function blobHash(blob) {
  if (!blob) return null;
  const prefix = new TextEncoder().encode('img|');
  const body = new Uint8Array(await blob.arrayBuffer());
  const merged = new Uint8Array(prefix.length + body.length);
  merged.set(prefix, 0);
  merged.set(body, prefix.length);
  return sha256Hex(merged);
}

/** 按素材类型计算指纹；音频 / 计算失败返回 null（不影响导入） */
export async function contentHashOf(item) {
  try {
    if (item.type === 'text') return await textHash(item.content);
    if (item.type === 'image') return await blobHash(item.blob);
  } catch {
    return null;
  }
  return null;
}

const memCache = new Map(); // materialId -> hash（会话内复用，避免重复算大图）

/** 已入库素材的指纹：优先存量字段，缺失则现算并回写 */
export async function hashOfMaterial(m) {
  if (memCache.has(m.id)) return memCache.get(m.id);
  let h = m.contentHash || (await contentHashOf(m));
  if (h) {
    memCache.set(m.id, h);
    if (!m.contentHash) db.materials.update(m.id, { contentHash: h }).catch(() => {});
  }
  return h;
}

/**
 * 把待导入 items 与当前项目素材比对，拆出重复项
 * @returns {{ unique: Array, dups: Array }} unique / dups 均已带上 contentHash
 */
export async function splitDuplicates(items, existingMaterials) {
  const known = new Set();
  for (const m of existingMaterials) {
    const h = await hashOfMaterial(m);
    if (h) known.add(h);
  }
  const unique = [];
  const dups = [];
  for (const it of items) {
    const h = await contentHashOf(it);
    if (h) {
      it.contentHash = h;
      if (known.has(h)) {
        dups.push(it);
        continue;
      }
      known.add(h); // 同批次内重复也只保留一条
    }
    unique.push(it);
  }
  return { unique, dups };
}
