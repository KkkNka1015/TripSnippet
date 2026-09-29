<script setup>
/**
 * 素材导入弹窗 —— 四种导入方式
 * 1. 网页链接：后端代理解析正文 + 配图（阶段 Loading / 超时降级 / 首次版权提示），配图可勾选
 * 2. 剪贴板粘贴：自动识别纯文本 / 图片 / 图文混合，预览编辑后入库
 * 3. 本地文件：图片(mp3/文本) 严格类型与大小校验
 * 4. 在线录音：MediaRecorder 录制（webm 格式，浏览器可直连播放）
 */
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue';
import { NModal, useMessage } from 'naive-ui';
import {
  X, Check, Link2, ClipboardPaste, FolderOpen, Search, Loader2, CircleCheck,
  Trash2, ImageOff, FileText, Music, Info, TriangleAlert,
  Mic, Square,
} from 'lucide-vue-next';
import { addMaterials, getSetting, setSetting } from '../store';
import { apiExtract, apiFetchImage, ApiError } from '../utils/api';
import { compressImage, makeThumb, validateFile, FILE_RULES } from '../utils/image';
import { formatSize, formatDate } from '../utils/format';
import { store } from '../store';
import CopyrightNotice from './CopyrightNotice.vue';

const props = defineProps({ show: Boolean, initialTab: { type: String, default: 'url' } });
const emit = defineEmits(['update:show', 'imported']);

const message = useMessage();

/* ============ 通用状态 ============ */
const tab = ref('url'); // url | clipboard | file
const importing = ref(false);

/* 弹窗打开时按外部指定的入口页切换（Ctrl+V 拉起剪贴板导入，O3-4） */
watch(
  () => props.show,
  (v) => {
    if (!v) return;
    tab.value = props.initialTab || 'url';
    if (tab.value === 'clipboard') readClipboard(); // 自动尝试读取（含降级提示）
  }
);

function close() {
  emit('update:show', false);
}

/** 预览图片行 */
function makeImageRow(blob, extra = {}) {
  return {
    blob,
    url: URL.createObjectURL(blob),
    size: blob.size,
    ...extra,
  };
}

/* ============ 网页链接导入 ============ */
const urlInput = ref('');
const STAGES = [
  { key: 'fetch', label: '正在请求网页' },
  { key: 'text', label: '正在提取正文' },
  { key: 'images', label: '正在提取配图' },
  { key: 'finish', label: '即将完成' },
];
const stageIndex = ref(-1); // -1 未开始；0-3 进行中；4 完成
const parsing = computed(() => stageIndex.value >= 0 && stageIndex.value < 4);
const parseError = ref('');
const showCopyright = ref(false);
const copyrightAcked = ref(true);

const urlDraft = reactive({
  title: '',
  siteName: '',
  text: '',
  url: '',
  images: [], // { blob, url, failed, reason }
});
const importMode = ref('both'); // text | both

const imageOkCount = computed(() => urlDraft.images.filter((i) => !i.failed).length);
/** 已勾选待入库的配图数 */
const checkedCount = computed(() => urlDraft.images.filter((i) => !i.failed && i.checked).length);

/** 全选 / 取消全选配图 */
function toggleAllImages() {
  const target = checkedCount.value < imageOkCount.value;
  urlDraft.images.forEach((i) => {
    if (!i.failed) i.checked = target;
  });
}

async function initCopyright() {
  copyrightAcked.value = await getSetting('copyrightAck', false);
}

initCopyright();

async function startParse() {
  const url = urlInput.value.trim();
  if (!url || parsing.value) return;
  if (!/^https?:\/\//i.test(url)) {
    parseError.value = '请输入以 http/https 开头的网页链接';
    return;
  }
  parseError.value = '';
  urlDraft.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
  urlDraft.images = [];

  // 首次使用网页解析 → 版权提示
  if (!copyrightAcked.value) {
    showCopyright.value = true;
    return;
  }
  await doParse(url);
}

async function acknowledgeCopyright() {
  copyrightAcked.value = true;
  await setSetting('copyrightAck', true);
  showCopyright.value = false;
  await doParse(urlInput.value.trim());
}

async function doParse(url) {
  stageIndex.value = 0;
  try {
    // 阶段 1：请求网页（含超时 20s，超时自动终止并降级）
    const data = await apiExtract(url);
    stageIndex.value = 1;
    // 阶段 2：提取正文
    await new Promise((r) => setTimeout(r, 260));
    urlDraft.title = data.title;
    urlDraft.siteName = data.siteName;
    urlDraft.text = data.text;
    urlDraft.url = data.url;
    urlDraft.degraded = data.degraded;
    stageIndex.value = 2;
    // 阶段 3：提取图片（逐张经代理下载，容忍单张失败）
    const imgs = data.images || [];
    for (const imgUrl of imgs) {
      try {
        const blob = await apiFetchImage(imgUrl);
        urlDraft.images.push(makeImageRow(blob, { origin: imgUrl, failed: false, checked: true }));
      } catch (e) {
        urlDraft.images.push({ blob: null, url: '', failed: true, reason: e.friendly || '抓取失败（防盗链）' });
      }
    }
    stageIndex.value = 3;
    await new Promise((r) => setTimeout(r, 200));
    stageIndex.value = 4;
    if (data.degraded) {
      message.warning('该网页正文提取精度有限，已进入可用状态，建议核对文字内容');
    }
  } catch (e) {
    stageIndex.value = -1;
    const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', e.message || '解析失败');
    parseError.value = err.friendly || err.message;
    // 超时 / SPA / 登录页 → 自动降级为手动粘贴模式
    if (['TIMEOUT', 'SPA_OR_EMPTY', 'AUTH_BLOCKED', 'NOT_HTML', 'TOO_LARGE', 'NETWORK'].includes(err.code)) {
      degradeToClipboard(url);
    }
  }
}

function degradeToClipboard(url) {
  tab.value = 'clipboard';
  clipDraft.sourceUrl = url;
  message.info('已自动切换为手动粘贴模式，可直接 Ctrl+V 粘贴网页内容', { duration: 5000 });
}

function removeDraftImage(idx) {
  const img = urlDraft.images[idx];
  if (img.url) URL.revokeObjectURL(img.url);
  urlDraft.images.splice(idx, 1);
}

async function confirmUrlImport() {
  if (importing.value) return;
  importing.value = true;
  try {
    const items = [];
    if (urlDraft.text.trim() || importMode.value === 'text') {
      if (urlDraft.text.trim()) {
        items.push({
          type: 'text',
          title: urlDraft.title || '网页素材',
          content: urlDraft.text,
          sourceUrl: urlDraft.url,
          sourceType: 'url',
        });
      }
    }
    if (importMode.value === 'both') {
      const okImages = urlDraft.images.filter((i) => !i.failed && i.blob && i.checked);
      let n = 0;
      for (const img of okImages) {
        n += 1;
        const { blob } = await compressImage(img.blob);
        items.push({
          type: 'image',
          title: `${urlDraft.title} · 配图${n}`,
          blob,
          thumb: await makeThumb(blob),
          mime: blob.type,
          size: blob.size,
          sourceUrl: urlDraft.url,
          sourceType: 'url',
        });
      }
    }
    if (!items.length) {
      message.warning('没有可导入的内容');
      return;
    }
    await addMaterials(items);
    message.success(`已导入 ${items.length} 条素材`);
    emit('imported');
    resetUrlDraft();
    close();
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function resetUrlDraft() {
  urlDraft.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
  urlDraft.images = [];
  urlDraft.title = '';
  urlDraft.text = '';
  urlDraft.url = '';
  urlInput.value = '';
  stageIndex.value = -1;
  parseError.value = '';
}

/* ============ 剪贴板导入 ============ */
const clipDraft = reactive({
  text: '',
  sourceUrl: '',
  images: [], // { blob, url }
  reading: false,
});

const pasteZone = ref(null);
const clipHasContent = computed(() => clipDraft.text.trim() || clipDraft.images.length);

/** 处理 paste 事件：自动识别 纯文本 / 图片 / 图文混合 */
async function onPaste(e) {
  const cd = e.clipboardData;
  if (!cd) return;
  let handled = false;

  // 图片文件
  const imageFiles = [...(cd.items || [])]
    .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);

  // html（可能内嵌远程图片 → 走代理抓取）
  const html = cd.getData('text/html');
  const text = cd.getData('text/plain');

  if (text && !imageFiles.length && !/\S/.test(clipDraft.text)) {
    clipDraft.text = text;
    handled = true;
  } else if (text) {
    clipDraft.text = (clipDraft.text ? `${clipDraft.text}\n${text}` : text).slice(0, 100000);
    handled = true;
  }

  for (const f of imageFiles) {
    await pushClipImage(f);
    handled = true;
  }

  // html 中的远程图片：走代理补齐
  if (html && !imageFiles.length) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const srcs = [...doc.querySelectorAll('img')]
      .map((im) => im.getAttribute('src'))
      .filter((s) => /^https?:/i.test(s))
      .slice(0, 8);
    for (const s of srcs) {
      try {
        const blob = await apiFetchImage(s);
        await pushClipImage(blob);
        handled = true;
      } catch {
        /* 单张失败跳过 */
      }
    }
  }

  if (handled) message.success('已读取剪贴板内容，可在下方编辑确认');
}

async function pushClipImage(blobLike) {
  const { blob } = await compressImage(blobLike);
  clipDraft.images.push(makeImageRow(blob, {}));
}

/** 主动读取剪贴板（部分浏览器需授权） */
async function readClipboard() {
  if (!navigator.clipboard?.read) {
    message.info('当前浏览器不支持主动读取，请在下方粘贴区按 Ctrl+V');
    return;
  }
  clipDraft.reading = true;
  try {
    const items = await navigator.clipboard.read();
    let handled = false;
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      const textType = item.types.find((t) => t === 'text/plain');
      if (textType) {
        const b = await item.getType(textType);
        clipDraft.text = (await b.text()).slice(0, 100000);
        handled = true;
      }
      if (imgType) {
        const b = await item.getType(imgType);
        await pushClipImage(b);
        handled = true;
      }
    }
    if (handled) message.success('已读取剪贴板内容');
    else message.info('剪贴板中未发现文本或图片内容');
  } catch {
    message.info('无法直接读取剪贴板（浏览器限制），请在粘贴区按 Ctrl+V');
  } finally {
    clipDraft.reading = false;
  }
}

function removeClipImage(idx) {
  const img = clipDraft.images[idx];
  if (img.url) URL.revokeObjectURL(img.url);
  clipDraft.images.splice(idx, 1);
}

async function confirmClipImport() {
  if (importing.value || !clipHasContent.value) return;
  importing.value = true;
  try {
    const items = [];
    if (clipDraft.text.trim()) {
      items.push({
        type: 'text',
        title: clipDraft.text.trim().split('\n')[0].slice(0, 30) || '剪贴板素材',
        content: clipDraft.text,
        sourceUrl: clipDraft.sourceUrl || '',
        sourceType: 'clipboard',
      });
    }
    let n = 0;
    for (const img of clipDraft.images) {
      n += 1;
      const { blob } = await compressImage(img.blob); // 已压缩过则接近原样返回
      items.push({
        type: 'image',
        title: `剪贴板图片 ${n}`,
        blob,
        thumb: await makeThumb(blob),
        mime: blob.type,
        size: blob.size,
        sourceType: 'clipboard',
      });
    }
    await addMaterials(items);
    message.success(`已导入 ${items.length} 条素材`);
    emit('imported');
    resetClipDraft();
    close();
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function resetClipDraft() {
  clipDraft.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
  clipDraft.images = [];
  clipDraft.text = '';
  clipDraft.sourceUrl = '';
}

/* ============ 本地文件导入 ============ */
const fileItems = reactive([]); // { file, kind: image|audio|text, error?, blob?, content? }
const fileInput = ref(null);

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,audio/mpeg,.mp3,text/plain,text/markdown,.txt,.md';

function onPickFiles(e) {
  const files = [...e.target.files];
  e.target.value = '';
  for (const f of files) {
    const { ok, reason } = validateFile(f);
    fileItems.push({ file: f, ok, reason });
  }
  processFiles();
}

async function processFiles() {
  for (const item of fileItems) {
    if (!item.ok || item.processed) continue;
    item.processed = true;
    try {
      if (item.file.type.startsWith('image/')) {
        const { blob } = await compressImage(item.file);
        item.blob = blob;
        item.thumb = await makeThumb(blob);
        item.preview = blob.type === 'image/gif' ? URL.createObjectURL(item.file) : makeImageRow(blob).url;
      } else if (item.file.type.startsWith('audio/')) {
        item.blob = item.file;
      } else {
        item.content = await item.file.text();
      }
    } catch {
      item.ok = false;
      item.reason = '文件读取失败';
    }
  }
}

function removeFileItem(idx) {
  const item = fileItems[idx];
  if (item.preview) URL.revokeObjectURL(item.preview);
  fileItems.splice(idx, 1);
}

const okFileCount = computed(() => fileItems.filter((i) => i.ok).length);

async function confirmFileImport() {
  if (importing.value || !okFileCount.value) return;
  importing.value = true;
  try {
    const items = fileItems
      .filter((i) => i.ok)
      .map((i) => {
        if (i.file.type.startsWith('image/')) {
          return {
            type: 'image',
            title: i.file.name.replace(/\.[^.]+$/, ''),
            blob: i.blob,
            thumb: i.thumb,
            mime: i.blob.type,
            size: i.blob.size,
            sourceType: 'file',
          };
        }
        if (i.file.type.startsWith('audio/')) {
          return {
            type: 'audio',
            title: i.file.name.replace(/\.[^.]+$/, ''),
            blob: i.blob,
            mime: i.blob.type,
            size: i.blob.size,
            sourceType: 'file',
          };
        }
        return {
          type: 'text',
          title: i.file.name.replace(/\.[^.]+$/, ''),
          content: i.content || '',
          size: (i.content || '').length,
          sourceType: 'file',
        };
      });
    await addMaterials(items);
    message.success(`已导入 ${items.length} 条素材`);
    emit('imported');
    resetFileDraft();
    close();
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

function resetFileDraft() {
  fileItems.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
  fileItems.splice(0);
}

/* ============ 在线录音（webm） ============ */
const recState = ref('idle'); // idle | recording | done
const recBlob = ref(null);
const recUrl = ref('');
const recSeconds = ref(0);
const recTitle = ref('');
const recError = ref('');
let recorder = null;
let recTimer = null;
let recStream = null;
const MAX_REC_SECONDS = 600; // 最长 10 分钟

const recSupported = computed(() => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));

/** 秒数 → mm:ss */
function recFmt(s) {
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

async function startRecord() {
  if (recState.value === 'recording' || !recSupported.value) return;
  recError.value = '';
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      if (recUrl.value) URL.revokeObjectURL(recUrl.value);
      recBlob.value = blob;
      recUrl.value = URL.createObjectURL(blob);
      recState.value = 'done';
    };
    recorder.start(250);
    recState.value = 'recording';
    recSeconds.value = 0;
    recTimer = setInterval(() => {
      recSeconds.value += 1;
      if (recSeconds.value >= MAX_REC_SECONDS) stopRecord();
    }, 1000);
  } catch (e) {
    cleanupRecStream();
    recError.value =
      e?.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器地址栏允许后重试'
        : '无法启动录音（未检测到可用麦克风）';
  }
}

function stopRecord() {
  if (recState.value !== 'recording') return;
  clearInterval(recTimer);
  recTimer = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  cleanupRecStream();
}

function cleanupRecStream() {
  if (recStream) {
    recStream.getTracks().forEach((t) => t.stop());
    recStream = null;
  }
}

function resetRec() {
  stopRecord();
  if (recUrl.value) URL.revokeObjectURL(recUrl.value);
  recBlob.value = null;
  recUrl.value = '';
  recSeconds.value = 0;
  recTitle.value = '';
  recState.value = 'idle';
  recError.value = '';
}

async function confirmRecImport() {
  if (importing.value || recState.value !== 'done' || !recBlob.value) return;
  importing.value = true;
  try {
    await addMaterials([
      {
        type: 'audio',
        title: recTitle.value.trim() || `现场录音 ${formatDate(Date.now())}`,
        blob: recBlob.value,
        mime: recBlob.value.type || 'audio/webm',
        size: recBlob.value.size,
        sourceType: 'record',
      },
    ]);
    message.success('录音已入库');
    emit('imported');
    resetRec();
    close();
  } catch (e) {
    message.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

/* ============ 弹窗开关清理 ============ */
function onShowChange(v) {
  if (!v) {
    // 关闭时清理预览；录音中途关闭则停止（已录内容保留，重开可继续确认）
    urlDraft.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    clipDraft.images.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    fileItems.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
    stopRecord();
    stageIndex.value = -1;
    parseError.value = '';
  }
  emit('update:show', v);
}

onBeforeUnmount(() => {
  [urlDraft.images, clipDraft.images].flat().forEach((i) => i.url && URL.revokeObjectURL(i.url));
  fileItems.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
  stopRecord();
  if (recUrl.value) URL.revokeObjectURL(recUrl.value);
});
</script>

<template>
  <NModal :show="show" @update:show="onShowChange" :auto-focus="false" :mask-closable="false">
    <div class="modal-vintage modal-vintage-wide p-8 relative">
      <div class="paper-tape-modal"></div>

      <!-- 标题 -->
      <div class="flex items-center justify-between mb-5">
        <h2 class="ts-heading text-xl flex items-center gap-2">
          <FolderOpen class="w-5 h-5" />
          导入素材
          <span class="ts-caption ml-1">当前项目：{{ store.currentProject?.name }}</span>
        </h2>
        <button class="ts-modal-close" aria-label="关闭" @click="close">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Tabs：三个主入口 + 录音（降权为右置辅助入口） -->
      <div class="flex gap-2 mb-5 flex-wrap items-center">
        <button
          v-for="t in [
            { key: 'url', label: '网页链接', icon: Link2 },
            { key: 'clipboard', label: '剪贴板粘贴', icon: ClipboardPaste },
            { key: 'file', label: '本地文件', icon: FolderOpen },
          ]"
          :key="t.key"
          class="ts-btn-outline"
          :style="tab === t.key ? 'background: var(--ts-surface-mint); color: var(--ts-foreground); border-style: solid;' : ''"
          @click="tab = t.key"
        >
          <component :is="t.icon" class="w-4 h-4" /><span>{{ t.label }}</span>
        </button>
        <button
          class="ts-btn-outline ts-tab-minor ml-auto"
          :style="tab === 'record' ? 'background: var(--ts-surface-mint); color: var(--ts-foreground); border-style: solid; opacity: 1;' : ''"
          @click="tab = 'record'"
        >
          <Mic class="w-3.5 h-3.5" /><span>录音</span>
        </button>
      </div>

      <!-- ================= 网页链接 ================= -->
      <div v-if="tab === 'url'">
        <div class="mb-4">
          <label class="ts-caption modal-label">网页链接（任意旅游攻略页面）</label>
          <div class="relative">
            <input
              v-model="urlInput"
              type="url"
              class="ts-url-input pr-12"
              placeholder="粘贴网址，如 https://..."
              :disabled="parsing"
              @keyup.enter="startParse"
            />
            <button class="ts-url-search" aria-label="解析" :disabled="parsing || !urlInput.trim()" @click="startParse">
              <Search v-if="!parsing" class="w-4 h-4" />
              <Loader2 v-else class="w-4 h-4 animate-spin" />
            </button>
          </div>
        </div>

        <!-- 阶段 Loading -->
        <div v-if="parsing || stageIndex === 4" class="ts-preview-box p-4 mb-4">
          <div class="space-y-2.5">
            <div
              v-for="(s, i) in STAGES"
              :key="s.key"
              class="ts-stage"
              :class="{
                active: stageIndex === i && stageIndex < 4,
                done: stageIndex > i,
                pending: stageIndex < i,
              }"
            >
              <span class="ts-stage-dot">
                <Loader2 v-if="stageIndex === i && stageIndex < 4" class="w-3 h-3" />
                <CircleCheck v-else-if="stageIndex > i" class="w-3.5 h-3.5" />
              </span>
              <span>{{ s.label }}</span>
              <span v-if="stageIndex === 2 && s.key === 'images'" class="ts-caption ml-1">
                {{ urlDraft.images.length }} 张
              </span>
            </div>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="parseError" class="flex items-start gap-2 ts-preview-box p-3.5 mb-4" style="border-color: rgba(184, 137, 143, 0.4)">
          <TriangleAlert class="w-4 h-4 mt-0.5 shrink-0" style="color: var(--state-error)" />
          <p class="ts-body text-sm">{{ parseError }}</p>
        </div>

        <!-- 解析预览 -->
        <template v-if="stageIndex === 4">
          <p class="ts-caption mb-3">解析预览（可直接编辑文字、删除多余图片）</p>
          <div class="ts-preview-box p-4 mb-4 max-h-[240px] overflow-y-auto">
            <div class="flex gap-4 mb-3">
              <img
                v-if="urlDraft.images.find((i) => !i.failed)"
                :src="urlDraft.images.find((i) => !i.failed).url"
                class="vintage-photo w-[100px] h-[100px]"
                alt="首图"
              />
              <div class="flex-1 min-w-0">
                <input v-model="urlDraft.title" class="modal-input mb-1.5" maxlength="60" placeholder="素材标题" />
                <p class="ts-caption flex items-center gap-1.5">
                  <Link2 class="w-3 h-3" />{{ urlDraft.siteName }}
                  <span class="opacity-40">·</span>
                  <span>{{ urlDraft.images.length }} 张配图</span>
                </p>
                <span class="ts-type-badge mt-2">
                  <FileText class="w-3 h-3" /> 攻略 · 自动识别
                </span>
              </div>
            </div>
            <textarea
              v-model="urlDraft.text"
              class="modal-input resize-none text-sm"
              rows="6"
              placeholder="正文内容"
            ></textarea>

            <!-- 图片墙（可勾选，仅勾选者入库） -->
            <div v-if="urlDraft.images.length" class="mt-3">
              <div class="flex items-center justify-between mb-1.5">
                <span class="ts-caption">配图（已选 {{ checkedCount }} / {{ imageOkCount }} 张）</span>
                <button v-if="imageOkCount" class="ts-btn-outline ts-btn-sm" @click="toggleAllImages">
                  <Check class="w-3 h-3" /><span>{{ checkedCount === imageOkCount ? '取消全选' : '全选' }}</span>
                </button>
              </div>
              <div class="grid grid-cols-4 gap-2">
                <div v-for="(img, i) in urlDraft.images" :key="i" class="relative group">
                  <img
                    v-if="!img.failed"
                    :src="img.url"
                    class="vintage-photo w-full h-[72px] cursor-pointer"
                    :class="!img.checked ? 'opacity-35' : ''"
                    alt="配图"
                    @click="img.checked = !img.checked"
                  />
                  <div
                    v-else
                    class="vintage-photo w-full h-[72px] flex flex-col items-center justify-center gap-1"
                    :title="img.reason"
                  >
                    <ImageOff class="w-4 h-4" style="color: var(--state-error)" />
                    <span class="text-[10px] ts-caption">抓取失败</span>
                  </div>
                  <input
                    v-if="!img.failed"
                    v-model="img.checked"
                    type="checkbox"
                    class="ts-checkbox absolute -top-1.5 -left-1.5 z-10"
                    :aria-label="`勾选配图 ${i + 1}`"
                  />
                  <button
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
                    style="background: var(--ts-surface-warm); border: 1px dashed var(--ts-border)"
                    aria-label="删除图片"
                    @click="removeDraftImage(i)"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 导入选项 -->
          <div class="mb-5 space-y-2">
            <label class="ts-option-row">
              <input v-model="importMode" type="radio" value="both" class="modal-radio" />
              <span class="ts-body text-sm">文字 + 配图（已选 {{ checkedCount }} 张）</span>
            </label>
            <label class="ts-option-row">
              <input v-model="importMode" type="radio" value="text" class="modal-radio" />
              <span class="ts-body text-sm">仅导入文字</span>
            </label>
          </div>

          <div class="flex justify-end gap-3">
            <button class="ts-btn-secondary" @click="resetUrlDraft">
              <X class="w-4 h-4" /><span>清空</span>
            </button>
            <button class="ts-btn-primary" :disabled="importing" @click="confirmUrlImport">
              <Check class="w-4 h-4" /><span>{{ importing ? '导入中…' : '确认导入' }}</span>
            </button>
          </div>
        </template>

        <div v-else class="ts-caption flex items-center gap-1.5 mt-1">
          <Info class="w-3.5 h-3.5" />
          仅支持静态网页；SPA / 登录页 / 防盗链页面会自动提示并降级为手动粘贴
        </div>
      </div>

      <!-- ================= 剪贴板 ================= -->
      <div v-else-if="tab === 'clipboard'">
        <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p class="ts-caption">支持纯文本、单张图片、图文混合内容</p>
          <button class="ts-btn-outline ts-btn-sm" :disabled="clipDraft.reading" @click="readClipboard">
            <Loader2 v-if="clipDraft.reading" class="w-3.5 h-3.5 animate-spin" />
            <ClipboardPaste v-else class="w-3.5 h-3.5" />
            读取剪贴板
          </button>
        </div>

        <!-- 粘贴区 -->
        <div
          ref="pasteZone"
          class="ts-preview-box p-6 mb-4 text-center cursor-text outline-none"
          tabindex="0"
          @paste.prevent="onPaste"
        >
          <template v-if="!clipHasContent">
            <ClipboardPaste class="w-8 h-8 mx-auto mb-2" style="color: var(--ts-ink-faint)" />
            <p class="ts-body text-sm">点击此处后按 <b>Ctrl + V</b> 粘贴</p>
            <p class="ts-caption mt-1">从网页 / 聊天窗口复制的内容可自动识别文字与图片</p>
          </template>
          <template v-else>
            <div class="max-h-[180px] overflow-y-auto text-left">
              <textarea
                v-if="clipDraft.text"
                v-model="clipDraft.text"
                class="modal-input resize-none text-sm mb-3"
                rows="4"
                placeholder="文字内容（可编辑）"
              ></textarea>
              <div v-if="clipDraft.images.length" class="grid grid-cols-4 gap-2">
                <div v-for="(img, i) in clipDraft.images" :key="i" class="relative">
                  <img :src="img.url" class="vintage-photo w-full h-[72px]" alt="剪贴板图片" />
                  <button
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow"
                    style="background: var(--ts-surface-warm); border: 1px dashed var(--ts-border)"
                    aria-label="删除图片"
                    @click="removeClipImage(i)"
                  >
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-if="clipDraft.sourceUrl" class="ts-caption mb-3 flex items-center gap-1.5">
          <Link2 class="w-3.5 h-3.5" />
          将保留来源链接：{{ clipDraft.sourceUrl }}
        </div>

        <div class="flex justify-end gap-3">
          <button class="ts-btn-secondary" :disabled="!clipHasContent" @click="resetClipDraft">
            <X class="w-4 h-4" /><span>清空</span>
          </button>
          <button class="ts-btn-primary" :disabled="!clipHasContent || importing" @click="confirmClipImport">
            <Check class="w-4 h-4" /><span>{{ importing ? '导入中…' : '确认导入' }}</span>
          </button>
        </div>
      </div>

      <!-- ================= 本地文件 ================= -->
      <div v-else-if="tab === 'file'">
        <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p class="ts-caption">严格校验：{{ FILE_RULES.image.label }} · {{ FILE_RULES.audio.label }} · {{ FILE_RULES.text.label }}</p>
          <button class="ts-btn-outline ts-btn-sm" @click="fileInput?.click()">
            <FolderOpen class="w-3.5 h-3.5" />选择文件
          </button>
          <input ref="fileInput" type="file" multiple :accept="ACCEPT" class="hidden" @change="onPickFiles" />
        </div>

        <div class="ts-preview-box p-4 mb-4 min-h-[120px]">
          <template v-if="!fileItems.length">
            <div class="text-center py-8">
              <FolderOpen class="w-8 h-8 mx-auto mb-2" style="color: var(--ts-ink-faint)" />
              <p class="ts-body text-sm">暂未选择文件</p>
            </div>
          </template>
          <div v-else class="space-y-2 max-h-[260px] overflow-y-auto">
            <div
              v-for="(item, i) in fileItems"
              :key="i"
              class="flex items-center gap-3 p-2 rounded-xl"
              style="background: var(--ts-surface-cream)"
            >
              <img v-if="item.preview" :src="item.preview" class="ts-thumb" alt="预览" />
              <Music v-else-if="item.file.type.startsWith('audio/')" class="w-5 h-5 shrink-0" style="color: var(--ts-ink-soft)" />
              <FileText v-else class="w-5 h-5 shrink-0" style="color: var(--ts-ink-soft)" />
              <div class="flex-1 min-w-0">
                <p class="text-sm ts-body truncate">{{ item.file.name }}</p>
                <p class="ts-caption">
                  <template v-if="item.ok">{{ formatSize(item.blob?.size || item.file.size) }} · 已就绪</template>
                  <template v-else><span style="color: var(--state-error)">{{ item.reason }}</span></template>
                </p>
              </div>
              <button class="ts-icon-btn" aria-label="移除" @click="removeFileItem(i)">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button class="ts-btn-secondary" :disabled="!fileItems.length" @click="resetFileDraft">
            <X class="w-4 h-4" /><span>清空</span>
          </button>
          <button class="ts-btn-primary" :disabled="!okFileCount || importing" @click="confirmFileImport">
            <Check class="w-4 h-4" /><span>{{ importing ? '导入中…' : `导入 ${okFileCount} 个文件` }}</span>
          </button>
        </div>
      </div>

      <!-- ================= 在线录音 ================= -->
      <div v-else-if="tab === 'record'">
        <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <p class="ts-caption">懒得打字的时候就用说的——感受、备忘、行程提醒，随口一录</p>
          <span class="ts-tag ts-tag-plain">webm 格式 · 浏览器可播</span>
        </div>

        <div class="ts-preview-box p-6 mb-4 text-center">
          <template v-if="!recSupported">
            <Mic class="w-8 h-8 mx-auto mb-2" style="color: var(--ts-ink-faint)" />
            <p class="ts-body text-sm">当前浏览器不支持在线录音</p>
          </template>
          <template v-else-if="recState === 'idle'">
            <button class="ts-rec-btn mx-auto" aria-label="开始录音" @click="startRecord">
              <Mic class="w-7 h-7" />
            </button>
            <p class="ts-body text-sm mt-3">点击开始录音</p>
          </template>
          <template v-else-if="recState === 'recording'">
            <div class="flex items-center justify-center gap-3 mb-4">
              <span class="ts-rec-dot"></span>
              <span class="ts-heading text-2xl" style="font-variant-numeric: tabular-nums">{{ recFmt(recSeconds) }}</span>
            </div>
            <button class="ts-btn-primary" @click="stopRecord">
              <Square class="w-4 h-4" /><span>停止录音</span>
            </button>
            <p class="ts-caption mt-2.5">最长可录 10 分钟</p>
          </template>
          <template v-else>
            <audio :src="recUrl" controls class="w-full mb-4"></audio>
            <p class="ts-caption mb-4 flex items-center justify-center gap-1.5" style="color: var(--state-success)">
              <CircleCheck class="w-4 h-4" />已录制 {{ recFmt(recSeconds) }} · {{ formatSize(recBlob?.size || 0) }}
            </p>
            <input v-model="recTitle" class="modal-input text-center" maxlength="60" placeholder="录音标题（如：明天要去的那家茶馆）" />
          </template>
        </div>

        <div
          v-if="recError"
          class="flex items-start gap-2 ts-preview-box p-3.5 mb-4"
          style="border-color: rgba(184, 137, 143, 0.4)"
        >
          <TriangleAlert class="w-4 h-4 mt-0.5 shrink-0" style="color: var(--state-error)" />
          <p class="ts-body text-sm">{{ recError }}</p>
        </div>

        <div class="flex justify-end gap-3">
          <button class="ts-btn-secondary" :disabled="recState !== 'done'" @click="resetRec">
            <X class="w-4 h-4" /><span>重录</span>
          </button>
          <button class="ts-btn-primary" :disabled="recState !== 'done' || importing" @click="confirmRecImport">
            <Check class="w-4 h-4" /><span>{{ importing ? '导入中…' : '确认导入' }}</span>
          </button>
        </div>
      </div>
    </div>
  </NModal>

  <!-- 版权提示（首次使用网页解析） -->
  <CopyrightNotice
    v-model:show="showCopyright"
    @acknowledge="acknowledgeCopyright"
  />
</template>
