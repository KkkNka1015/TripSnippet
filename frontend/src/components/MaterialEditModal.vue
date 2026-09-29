<script setup>
/**
 * 素材预览 / 编辑弹窗
 * - 预览：图片（复古滤镜）/ 音频播放器 / 文本阅读
 * - 编辑：标题、内容（文本素材）、备注（支持 Day 时间标记）、标签绑定
 */
import { reactive, ref, computed, watch, onBeforeUnmount } from 'vue';
import { NModal, useMessage } from 'naive-ui';
import {
  X, Check, Trash2, Pencil, FileText, Music, Link2, CalendarDays, Plus, Tag as TagIcon, Save,
  Image as ImageIcon,
} from 'lucide-vue-next';
import { store, updateMaterial } from '../store';
import { formatDate, sourceLabel, blobUrl } from '../utils/format';
import { parseDayMarker } from '../utils/markdown';

const props = defineProps({
  show: Boolean,
  material: { type: Object, default: null },
});
const emit = defineEmits(['update:show', 'saved', 'delete', 'preview']);

const message = useMessage();

const draft = reactive({ title: '', remark: '', content: '', tags: [], travelDate: '' });
const editing = ref(false);
const tagInput = ref('');
const previewUrl = ref('');

const poolTags = computed(() => store.tags.filter((t) => !draft.tags.includes(t.name)).map((t) => t.name));
/** 行程时间字段识别结果（优先级高于备注正则后备） */
const travelDayMarker = computed(() => parseDayMarker(draft.travelDate));
const dayMarker = computed(() => travelDayMarker.value || parseDayMarker(draft.remark));

watch(
  () => [props.show, props.material],
  () => {
    if (props.show && props.material) {
      draft.title = props.material.title;
      draft.remark = props.material.remark || '';
      draft.content = props.material.content || '';
      draft.tags = [...(props.material.tags || [])];
      draft.travelDate = props.material.travelDate || '';
      editing.value = false;
      if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = blobUrl(props.material.thumb || props.material.blob);
    } else if (!props.show && previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value);
      previewUrl.value = '';
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => previewUrl.value && URL.revokeObjectURL(previewUrl.value));

function close() {
  emit('update:show', false);
}

function addTag(name) {
  const n = (name || '').trim();
  if (!n) return;
  if (draft.tags.length >= 8) {
    message.warning('单个素材最多绑定 8 个标签');
    return;
  }
  if (!draft.tags.includes(n)) draft.tags.push(n);
  tagInput.value = '';
}

function removeTag(t) {
  draft.tags = draft.tags.filter((x) => x !== t);
}

async function save() {
  if (!draft.title.trim()) {
    message.warning('标题不能为空');
    return;
  }
  const patch = {
    title: draft.title.trim(),
    remark: draft.remark,
    tags: [...draft.tags],
    travelDate: draft.travelDate.trim(),
  };
  if (props.material.type === 'text') patch.content = draft.content;
  await updateMaterial(props.material.id, patch);
  message.success('已保存');
  emit('saved');
  close();
}
</script>

<template>
  <NModal :show="show" @update:show="$emit('update:show', $event)" :auto-focus="false">
    <div class="modal-vintage p-8 w-[640px] max-w-[calc(100vw-32px)] relative">
      <div class="paper-tape-modal"></div>

      <div class="flex items-center justify-between mb-5">
        <h2 class="ts-heading text-xl flex items-center gap-2">
          <FileText v-if="material?.type === 'text'" class="w-5 h-5" />
          <ImageIcon v-else-if="material?.type === 'image'" class="w-5 h-5" />
          <Music v-else class="w-5 h-5" />
          <span>素材详情</span>
        </h2>
        <button class="ts-modal-close" aria-label="关闭" @click="close">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- 预览区 -->
      <div v-if="material" class="ts-preview-box p-4 mb-5">
        <img
          v-if="material.type === 'image' && previewUrl"
          :src="previewUrl"
          class="vintage-photo w-full max-h-[280px] mx-auto object-contain"
          style="cursor: zoom-in"
          :alt="material.title"
          title="点击查看大图"
          @click="emit('preview', material)"
        />
        <audio v-else-if="material.type === 'audio'" :src="previewUrl" controls class="w-full"></audio>
        <div v-else-if="material.type === 'text'" class="max-h-[240px] overflow-y-auto">
          <p class="ts-body text-sm whitespace-pre-wrap leading-relaxed">{{ material.content }}</p>
        </div>
      </div>

      <!-- 元信息 -->
      <div v-if="material" class="flex items-center gap-4 mb-5 flex-wrap ts-caption">
        <span class="flex items-center gap-1.5">
          <CalendarDays class="w-3.5 h-3.5" />{{ formatDate(material.createTime) }}
        </span>
        <span class="flex items-center gap-1.5">
          <Link2 class="w-3.5 h-3.5" />{{ sourceLabel(material) }}
        </span>
        <a
          v-if="material.sourceUrl"
          :href="material.sourceUrl"
          target="_blank"
          rel="noreferrer noopener"
          class="flex items-center gap-1.5 underline decoration-dashed underline-offset-2 hover:opacity-80 max-w-[260px] truncate"
        >
          <Link2 class="w-3.5 h-3.5" />来源网页
        </a>
      </div>

      <div class="modal-divider"></div>

      <!-- 编辑表单 -->
      <div class="space-y-4">
        <div>
          <label class="ts-caption modal-label">标题</label>
          <input v-model="draft.title" class="modal-input" maxlength="100" placeholder="素材标题" />
        </div>

        <div v-if="material?.type === 'text'">
          <div class="flex items-center justify-between mb-2">
            <label class="ts-caption">正文内容</label>
            <button class="ts-btn-outline ts-btn-sm" @click="editing = !editing">
              <Pencil class="w-3 h-3" /><span>{{ editing ? '完成' : '编辑' }}</span>
            </button>
          </div>
          <textarea
            v-if="editing"
            v-model="draft.content"
            class="modal-input resize-none text-sm"
            rows="6"
            placeholder="攻略正文…"
          ></textarea>
          <div v-else class="ts-preview-box p-3.5 max-h-[160px] overflow-y-auto">
            <p class="ts-body text-sm whitespace-pre-wrap leading-relaxed">{{ draft.content || '（空）' }}</p>
          </div>
        </div>

        <div>
          <label class="ts-caption modal-label flex items-center gap-1">
            <CalendarDays class="w-3.5 h-3.5" />行程时间（可选）
          </label>
          <input v-model="draft.travelDate" class="modal-input" maxlength="20" placeholder="如：Day2 下午" />
          <p
            v-if="travelDayMarker"
            class="ts-caption mt-1.5 flex items-center gap-1.5"
            style="color: var(--state-success)"
          >
            <Check class="w-3.5 h-3.5" />已识别行程标记：Day {{ travelDayMarker.day }} · {{ travelDayMarker.slot }}，将优先排入时间轴
          </p>
          <p v-else class="ts-caption mt-1.5">填写「Day + 时段」可排入汇总笔记的行程时间轴</p>
        </div>

        <div>
          <label class="ts-caption modal-label">备注（记录行程安排 / 感想 / 避坑提示）</label>
          <textarea
            v-model="draft.remark"
            class="modal-input resize-none text-sm"
            rows="2"
            maxlength="300"
            placeholder="备注正文…（含「Day2 下午」等字样也可作为时间轴后备识别）"
          ></textarea>
          <p
            v-if="dayMarker && !travelDayMarker"
            class="ts-caption mt-1.5 flex items-center gap-1.5"
            style="color: var(--state-success)"
          >
            <Check class="w-3.5 h-3.5" />已识别备注中的行程标记：Day {{ dayMarker.day }} · {{ dayMarker.slot }}
          </p>
        </div>

        <div>
          <label class="ts-caption modal-label flex items-center gap-1"><TagIcon class="w-3.5 h-3.5" />标签（最多 8 个）</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span v-for="t in draft.tags" :key="t" class="ts-tag ts-tag-plain">
              {{ t }}
              <button aria-label="移除标签" class="ml-0.5 hover:opacity-70" @click="removeTag(t)">×</button>
            </span>
            <span v-if="!draft.tags.length" class="ts-caption">暂无标签</span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="tagInput"
              class="modal-input flex-1"
              maxlength="10"
              placeholder="输入新标签，回车添加"
              @keyup.enter="addTag(tagInput)"
            />
            <button class="ts-btn-outline ts-btn-sm" @click="addTag(tagInput)">
              <Plus class="w-3.5 h-3.5" />添加
            </button>
          </div>
          <div v-if="poolTags.length" class="flex flex-wrap gap-1.5 mt-2">
            <button
              v-for="t in poolTags.slice(0, 12)"
              :key="t"
              class="ts-tag ts-tag-plain hover:opacity-70"
              @click="addTag(t)"
            >+ {{ t }}</button>
          </div>
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex items-center justify-between mt-6">
        <button
          class="ts-btn-outline"
          style="color: var(--state-error); border-color: rgba(184, 137, 143, 0.45)"
          @click="$emit('delete', material)"
        >
          <Trash2 class="w-4 h-4" /><span>删除</span>
        </button>
        <div class="flex gap-3">
          <button class="ts-btn-secondary" @click="close">
            <X class="w-4 h-4" /><span>取消</span>
          </button>
          <button class="ts-btn-primary" @click="save">
            <Save class="w-4 h-4" /><span>保存</span>
          </button>
        </div>
      </div>
    </div>
  </NModal>
</template>
