/**
 * 导出 Worker 客户端（主线程）
 * - 单例 module worker，按任务 id 匹配消息，进度回调透传
 * - 下载触发（DOM 行为）统一在此，供 packer / backup 薄壳复用
 */
let worker = null;
let taskId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type, percent, stage, result, error } = e.data || {};
      const task = pending.get(id);
      if (!task) return;
      if (type === 'progress') {
        task.onProgress?.(percent, stage);
      } else if (type === 'done') {
        pending.delete(id);
        task.resolve(result);
      } else if (type === 'error') {
        pending.delete(id);
        task.reject(new Error(error));
      }
    };
    worker.onerror = (e) => {
      // Worker 脚本加载/执行崩溃：拒绝所有等待中的任务并复位，允许下次重试
      const err = new Error(e.message || '导出组件加载失败');
      for (const task of pending.values()) task.reject(err);
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  return worker;
}

/**
 * 运行一个导出任务
 * @param {'pack-zip'|'pack-md'|'backup-json'} action
 * @param {object} payload 可结构化克隆的纯数据（Blob 直接按引用传递，高效）
 * @param {Function} [onProgress] (percent: 0-100, stage: string)
 * @returns {Promise<{ blob: Blob }>}
 */
export function runExportWorker(action, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++taskId;
    pending.set(id, { resolve, reject, onProgress });
    try {
      getWorker().postMessage({ id, action, payload });
    } catch (err) {
      pending.delete(id);
      // DataCloneError：payload 混入了函数或未解包的 reactive Proxy
      reject(new Error(`导出任务无法启动（${err.message || '数据不可序列化'}）`));
    }
  });
}

/** 触发浏览器下载 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
