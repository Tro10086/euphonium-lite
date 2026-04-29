<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { uiState } from '@/ui/stores/uiState'
import { Search } from 'lucide-vue-next'

const route = useRoute()
const navLinks = [
  { name: 'home', label: '首页', to: { name: 'home' } },
  { name: 'notes', label: '笔记', to: { name: 'notes' } },
  { name: 'import', label: '导入', to: { name: 'import' } },
  { name: 'settings', label: '设置', to: { name: 'settings' } },
]
const isHomeRoute = computed(() => route.name === 'home')
</script>

<template>
  <header class="top-bar glass-panel">
    <div class="header-left">
      <div class="logo">
        <h2 class="logo-text">Euphonium</h2>
      </div>
      <nav class="nav">
        <RouterLink
          v-for="link in navLinks"
          :key="link.name"
          :to="link.to"
          class="nav-link"
          :class="{ active: route.name === link.name }"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>

    <div class="actions">
      <div v-if="isHomeRoute" class="search-box">
        <Search :size="18" class="search-icon" />
        <input
          v-model="uiState.searchQuery"
          type="text"
          placeholder="搜索..."
          class="search-input"
        />
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  height: 60px;
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 48px;
  z-index: 90;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@media (max-width: 1024px) {
  .top-bar {
    padding: 0 24px;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 48px;
}

.logo-text {
  font-size: 24px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: -1px;
  text-transform: uppercase;
  font-family: var(--font-headline);
}

.nav {
  display: flex;
  gap: 32px;
}

.nav-link {
  font-family: var(--font-headline);
  font-size: 16px;
  color: var(--on-surface-variant);
  font-weight: 500;
  padding-bottom: 4px;
}

.nav-link:hover {
  color: var(--primary);
}

.nav-link.active {
  color: var(--primary);
  font-weight: 700;
  border-bottom: 2px solid var(--primary-container);
}

.actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 280px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--primary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  background-color: var(--surface-low);
  border: 1px solid transparent;
  border-radius: 99px;
  font-size: 14px;
  color: var(--on-surface);
  transition: all 0.2s ease;
  outline: none;
}

.search-input:focus {
  background-color: var(--surface);
  border-color: var(--primary-container);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
