<script setup>
import { NConfigProvider, NMessageProvider, NDialogProvider, zhCN, dateZhCN } from 'naive-ui';
import { naiveThemeOverrides } from './naive-theme';
</script>

<template>
  <NConfigProvider :theme-overrides="naiveThemeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider placement="top">
      <NDialogProvider>
        <!-- 页面级轻过渡：纯淡入淡出，柔化路由切换的硬切 -->
        <RouterView v-slot="{ Component }">
          <Transition name="ts-page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
  <div class="ts-page-corner"></div>
</template>
