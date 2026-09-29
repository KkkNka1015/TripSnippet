/**
 * 打包核心（无 DOM 依赖，主线程与导出 Web Worker 共用）
 * - ZIP 组装 / 单文件 Markdown 生成 / 导出大小估算
 * - 下载触发等 DOM 行为在 packer.js（主线程薄壳）处理
 */
import JSZip from 'jszip';
import { sanitizeFilename, extFromMime } from './format';
import { compressForExport } from './image';
import { generateTravelNote } from './markdown';

const BIG_PACK_BYTES = 50 * 1024 * 1024; // 超大包提示阈值

/** 统计导出内容预估大小 */
export function estimatePack(materials, imageMode) {
  let bytes = 0;
  for (const m of materials) {
    if (m.type === 'image' && m.blob) {
      bytes += imageMode === 'compressed' ? Math.round((m.size || 0) * 0.55) : m.size || 0;
    } else if (m.blob) {
      bytes += m.size || m.blob.size || 0;
    } else if (m.content) {
      bytes += new Blob([m.content]).size;
    }
  }
  return bytes;
}

/** 计算素材预计大小（用于导出前提示） */
export function packSizeInfo(materials, imageMode) {
  const bytes = estimatePack(materials, imageMode);
  return { bytes, tooBig: bytes > BIG_PACK_BYTES, threshold: BIG_PACK_BYTES };
}

/**
 * 生成唯一化的 zip 内文件名：序号_清洗标题.扩展名
 */
function buildZipNames(materials) {
  const imageFiles = new Map();
  const audioFiles = new Map();
  const used = new Set();

  let imgIdx = 0;
  let audIdx = 0;
  for (const m of materials) {
    if (m.type === 'image') {
      imgIdx += 1;
      const base = sanitizeFilename(m.title || `图片${imgIdx}`);
      const ext = extFromMime(m.mime, m.ext || 'jpg');
      let name = `${String(imgIdx).padStart(2, '0')}_${base}.${ext}`;
      let n = 1;
      while (used.has(name)) name = `${String(imgIdx).padStart(2, '0')}_${base}_${n++}.${ext}`;
      used.add(name);
      imageFiles.set(m.id, name);
    } else if (m.type === 'audio') {
      audIdx += 1;
      const base = sanitizeFilename(m.title || `音频${audIdx}`);
      const ext = extFromMime(m.mime, 'mp3'); // 录音为 webm，导入 mp3 为 mp3
      let name = `${String(audIdx).padStart(2, '0')}_${base}.${ext}`;
      let n = 1;
      while (used.has(name)) name = `${String(audIdx).padStart(2, '0')}_${base}_${n++}.${ext}`;
      used.add(name);
      audioFiles.set(m.id, name);
    }
  }
  return { imageFiles, audioFiles };
}

/**
 * ZIP 打包核心：返回 zip Blob（下载由调用方处理）
 * @param {object} opts 与 packer.packAndDownload 一致（不含 onProgress 外的 DOM 依赖）
 */
export async function packZipCore({ project, materials, imageMode, noteMode, onProgress }) {
  const zip = new JSZip();
  const rootName = sanitizeFilename(project.name, 50) || '旅行项目';
  const root = zip.folder(rootName);

  // 固定标准目录：即使项目内没有图片 / 音频素材也保留空目录
  root.folder('images');
  root.folder('audio');

  const { imageFiles, audioFiles } = buildZipNames(materials);

  // 1) 旅行汇总笔记.md
  const note = generateTravelNote({ project, materials, noteMode, imageFiles });
  root.file('旅行汇总笔记.md', note);
  onProgress?.(8, '正在生成汇总笔记');

  // 2) 图片
  const images = materials.filter((m) => m.type === 'image' && m.blob);
  for (let i = 0; i < images.length; i++) {
    const m = images[i];
    let blob = m.blob;
    if (imageMode === 'compressed') {
      blob = await compressForExport(blob);
    }
    // 已经压缩的媒体无需二次 deflate，直接 STORE 更快
    root.file(`images/${imageFiles.get(m.id)}`, blob, { compression: 'STORE' });
    onProgress?.(8 + Math.round(((i + 1) / Math.max(images.length, 1)) * 70), '正在写入图片');
  }

  // 3) 音频
  const audios = materials.filter((m) => m.type === 'audio' && m.blob);
  for (let i = 0; i < audios.length; i++) {
    const m = audios[i];
    root.file(`audio/${audioFiles.get(m.id)}`, m.blob, { compression: 'STORE' });
    onProgress?.(80 + Math.round(((i + 1) / Math.max(audios.length, 1)) * 10), '正在写入音频');
  }

  // 4) 生成压缩包
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } },
    (meta) => onProgress?.(90 + Math.round(meta.percent * 0.1), '正在压缩')
  );
  onProgress?.(100, '打包完成');
  return blob;
}

/** blob → base64 data URI（主线程 FileReader / Worker arrayBuffer+btoa 自适应） */
export async function toDataUri(blob) {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('图片读取失败'));
      r.readAsDataURL(blob);
    });
  }
  // Worker 环境：无 FileReader，分块转 base64
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

/**
 * 单文件 Markdown 核心：图片以 base64 data URI 内嵌，音频不包含
 * 返回 { blob, note }（下载由调用方处理）
 */
export async function packMarkdownCore({ project, materials, imageMode, noteMode, onProgress }) {
  // 1) 图片转 data URI（遵循压缩选项）
  const images = materials.filter((m) => m.type === 'image' && m.blob);
  const dataUris = new Map();
  for (let i = 0; i < images.length; i++) {
    const m = images[i];
    let blob = m.blob;
    if (imageMode === 'compressed') blob = await compressForExport(blob);
    dataUris.set(m.id, await toDataUri(blob));
    onProgress?.(Math.round(((i + 1) / Math.max(images.length, 1)) * 85), '正在内嵌图片');
  }

  // 2) 生成笔记（图片直接内嵌，音频给出说明）
  const note = generateTravelNote({
    project,
    materials,
    noteMode,
    imageFiles: dataUris,
    imageRefPrefix: '',
    outputMode: 'single',
  });
  onProgress?.(95, '正在生成文件');
  return { blob: new Blob([note], { type: 'text/markdown;charset=utf-8' }), note };
}
