/**
 * 打包导出（主线程薄壳）
 * 实际打包在 Web Worker 中执行（export-worker.js），主线程只触发下载
 * - ZIP 固定目录结构：{项目名}/旅行汇总笔记.md + images/ + audio/
 * - 图片可选 原图 / 压缩图；笔记可选 完整版 / 精简版
 * - 图片文件名自动清洗特殊字符 + 序号前缀
 */
import { toRaw } from 'vue';
import { packSizeInfo } from './packer-core';
import { runExportWorker, downloadBlob } from './export-worker-client';
import { sanitizeFilename } from './format';

export { packSizeInfo };

/** 规范化 payload：剥离 onProgress 等函数，reactive Proxy → 纯对象（可结构化克隆） */
function buildPayload({ project, materials, imageMode, noteMode }) {
  return {
    project: { ...toRaw(project) },
    materials: materials.map((m) => ({ ...toRaw(m) })),
    imageMode,
    noteMode,
  };
}

/**
 * 打包并触发下载（ZIP 素材包）
 * @param {object} opts
 * @param {object} opts.project 项目
 * @param {Array} opts.materials 已按拖拽顺序排序的素材
 * @param {'original'|'compressed'} opts.imageMode
 * @param {'full'|'brief'} opts.noteMode
 * @param {string} opts.zipName zip 文件名（不含扩展名）
 * @param {Function} opts.onProgress (percent: 0-100, stage: string)
 * @returns {Promise<number>} 文件字节数
 */
export async function packAndDownload({ project, materials, imageMode, noteMode, zipName, onProgress }) {
  const { blob } = await runExportWorker(
    'pack-zip',
    buildPayload({ project, materials, imageMode, noteMode }),
    onProgress
  );
  downloadBlob(blob, `${sanitizeFilename(zipName || `${project.name}_素材包`, 60)}.zip`);
  return blob.size;
}

/**
 * 单文件 Markdown 导出：图片以 base64 data URI 内嵌，音频不包含
 * 参数与 packAndDownload 一致（zipName 作为 .md 文件名）
 */
export async function exportSingleMarkdown({ project, materials, imageMode, noteMode, zipName, onProgress }) {
  const { blob } = await runExportWorker(
    'pack-md',
    buildPayload({ project, materials, imageMode, noteMode }),
    onProgress
  );
  downloadBlob(blob, `${sanitizeFilename(zipName || `${project.name}_旅行笔记`, 60)}.md`);
  return blob.size;
}
