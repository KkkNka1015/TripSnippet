<script setup>
import { computed } from 'vue';
import { Compass, CalendarDays, Layers, Pencil, Pin } from 'lucide-vue-next';
import { formatMonth } from '../utils/format';

const props = defineProps({
  project: { type: Object, required: true },
  coverUrl: { type: String, default: '' },
  materialCount: { type: Number, default: 0 },
  index: { type: Number, default: 0 },
});

defineEmits(['open', 'edit']);

const cardClass = computed(() => ['ts-card-lilac', 'ts-card-mint'][props.index % 2]);
const postmark = computed(() => formatMonth(props.project.createTime));
</script>

<template>
  <div class="ts-collage-card" :class="cardClass" @click="$emit('open', project)">
    <!-- 纸胶带装饰 -->
    <div class="ts-tape ts-tape-1"></div>
    <div class="ts-tape ts-tape-2"></div>
    <!-- 复古邮戳 -->
    <span class="ts-postmark">{{ postmark }}</span>
    <!-- 置顶标识 -->
    <span v-if="project.pinned" class="ts-pin-badge" title="已置顶" aria-label="已置顶">
      <Pin class="w-3 h-3" />
    </span>
    <!-- hover 编辑按钮 -->
    <button
      class="ts-edit-btn"
      aria-label="编辑项目"
      @click.stop="$emit('edit', project)"
    >
      <Pencil class="w-3 h-3" />编辑
    </button>

    <!-- 封面照片 -->
    <div class="ts-photo-wrap">
      <img v-if="coverUrl" :src="coverUrl" :alt="project.name" class="ts-collage-photo" />
      <div v-else class="ts-photo-placeholder">
        <Compass class="w-8 h-8" />
        <span class="ts-caption">还没有图片素材</span>
      </div>
    </div>

    <!-- 文字区 -->
    <div class="px-1">
      <h3 class="ts-heading text-lg truncate">{{ project.name }}</h3>
      <p class="ts-card-desc" :title="project.description || ''">
        {{ project.description || '暂无描述，点击进入添加旅行素材' }}
      </p>
      <div class="ts-card-meta">
        <Layers class="w-3.5 h-3.5" />
        <span>{{ materialCount }} 个素材</span>
        <span class="opacity-40">·</span>
        <CalendarDays class="w-3.5 h-3.5" />
        <span>{{ postmark }}</span>
      </div>
    </div>
  </div>
</template>
