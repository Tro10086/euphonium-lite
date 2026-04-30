<script setup lang="ts">
import { LayoutGrid, Clock, Heart, Trash, Settings2, Folder } from 'lucide-vue-next'
import BaseButton from './BaseButton.vue'
import { uiState } from '@/ui/stores/uiState'

const getIcon = (id: string) => {
  switch (id) {
    case 'all':
      return LayoutGrid
    case 'recent':
      return Clock
    case 'fav':
      return Heart
    case 'trash':
      return Trash
    default:
      return Folder
  }
}
</script>

<template>
  <aside class="side-nav" :class="{ compact: uiState.settings.compactMode }">
    <nav class="nav-list">
      <a
        v-for="item in uiState.navItems"
        :key="item.id"
        href="#"
        class="nav-item"
        :class="{ active: item.id === uiState.homeFilter }"
        @click.prevent="uiState.homeFilter = item.id"
      >
        <component :is="getIcon(item.id)" :size="20" />
        <span>{{ item.label }}</span>
      </a>
    </nav>

    <div class="nav-footer">
      <BaseButton full-width @click="uiState.isCollectionModalOpen = true">
        <template #icon><Settings2 :size="18" /></template>
        <span>编辑合集列表</span>
      </BaseButton>
    </div>
  </aside>
</template>

<style scoped>
.side-nav {
  width: 280px;
  height: calc(100vh - 60px);
  position: fixed;
  left: 0;
  top: 60px;
  background-color: var(--background);
  border-right: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  padding: 32px 24px;
  z-index: 80;
  transition: width 0.25s ease, padding 0.25s ease;
}

.dark .side-nav {
  border-right-color: var(--outline-variant);
}

.nav-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 99px;
  color: #a0a0a0;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-item:hover {
  color: var(--primary);
  transform: translateX(4px);
  background-color: rgba(0, 0, 0, 0.02);
}

.nav-item.active {
  background-color: var(--surface-low);
  color: var(--primary);
  font-weight: 600;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.02);
}

.nav-footer {
  margin-top: auto;
}

.side-nav.compact {
  width: 80px;
  padding: 32px 12px;
}

.side-nav.compact .nav-item {
  justify-content: center;
  gap: 0;
  padding: 12px;
}

.side-nav.compact .nav-item span,
.side-nav.compact .nav-footer span {
  display: none;
}

.side-nav.compact .nav-footer {
  display: flex;
  justify-content: center;
}

.side-nav.compact :deep(.base-btn) {
  width: 44px;
  padding: 10px;
}
</style>
