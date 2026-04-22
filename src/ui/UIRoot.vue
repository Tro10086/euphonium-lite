<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import './index.css';
import { mockStore } from './stores/mockData';
import SideNav from './components/SideNav.vue';
import TopBar from './components/TopBar.vue';
import DetailPanel from './components/DetailPanel.vue';
import CollectionManagerModal from './components/CollectionManagerModal.vue';

const route = useRoute();
const isHomeRoute = computed(() => route.name === 'home');

// Theme & Compact Management
const updateTheme = () => {
  const root = document.documentElement;
  const theme = mockStore.settings.theme;
  
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', isDark);
  }
};

const updateCompactMode = () => {
  document.documentElement.classList.toggle('compact-mode', mockStore.settings.compactMode);
};

// Listen for system theme changes
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
const handleSystemThemeChange = () => {
  if (mockStore.settings.theme === 'system') updateTheme();
};

onMounted(() => {
  updateTheme();
  updateCompactMode();
  mediaQuery.addEventListener('change', handleSystemThemeChange);
});

onUnmounted(() => {
  mediaQuery.removeEventListener('change', handleSystemThemeChange);
});

watch(() => mockStore.settings.theme, updateTheme);
watch(() => mockStore.settings.compactMode, updateCompactMode);
watch(
  () => route.name,
  (name) => {
    if (name !== 'home') {
      mockStore.selectedMedia = null;
    }
  }
);
</script>

<template>
  <div class="app-container" :class="{ 'compact': mockStore.settings.compactMode }">
    <TopBar />
    
    <div class="view-layout" :class="{ 
      'with-sidebar': isHomeRoute,
      'compact-sidebar': mockStore.settings.compactMode && isHomeRoute
    }">
      <SideNav v-if="isHomeRoute" />
      
      <main class="content-area">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- Modals -->
    <DetailPanel v-if="isHomeRoute && mockStore.selectedMedia" @close="mockStore.selectedMedia = null" />
    <CollectionManagerModal />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  overflow: hidden;
}

.view-layout {
  flex: 1;
  display: flex;
  position: relative;
  margin-top: 60px; /* Reduced from 80px */
}

.content-area {
  flex: 1;
  padding: 24px; /* Reduced from 48px */
  overflow-y: auto;
  height: calc(100vh - 60px);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.with-sidebar .content-area {
  margin-left: 280px;
}

/* Animations */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
