/**
 * 导出 Web Worker：ZIP 打包 / 单文件 Markdown / 备份 JSON 序列化
 * 重活（图片压缩、base64 编码、zip 压缩）在此执行，不卡主线程
 * 由 export-worker-client.js 统一调用，进度经 postMessage 回传
 */
import { packZipCore, packMarkdownCore } from './packer-core';

/** Worker 内 blob → base64（无 FileReader，分块转换避免参数栈溢出） */
async function blobToBase64Worker(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** 备份 JSON 核心：素材 blob/thumb 转 base64 后序列化为 Blob */
async function backupJsonCore({ data, pretty, onProgress }) {
  const materials = [];
  const total = (data.materials || []).length;
  for (let i = 0; i < total; i++) {
    const m = data.materials[i];
    materials.push({
      ...m,
      blob: m.blob ? await blobToBase64Worker(m.blob) : null,
      thumb: m.thumb ? await blobToBase64Worker(m.thumb) : null,
    });
    onProgress?.(Math.round(((i + 1) / Math.max(total, 1)) * 100), '正在编码备份素材');
  }
  const json = JSON.stringify({ ...data, materials }, null, pretty ? 2 : undefined);
  onProgress?.(100, '备份生成完成');
  return new Blob([json], { type: 'application/json' });
}

self.onmessage = async (e) => {
  const { id, action, payload } = e.data || {};
  const post = (msg) => self.postMessage({ id, ...msg });
  const onProgress = (percent, stage) => post({ type: 'progress', percent, stage });
  try {
    if (action === 'pack-zip') {
      const blob = await packZipCore({ ...payload, onProgress });
      post({ type: 'done', result: { blob } });
    } else if (action === 'pack-md') {
      const { blob } = await packMarkdownCore({ ...payload, onProgress });
      post({ type: 'done', result: { blob } });
    } else if (action === 'backup-json') {
      const blob = await backupJsonCore({ ...payload, onProgress });
      post({ type: 'done', result: { blob } });
    } else {
      post({ type: 'error', error: '未知的导出任务' });
    }
  } catch (err) {
    post({ type: 'error', error: err.message || '导出失败' });
  }
};
