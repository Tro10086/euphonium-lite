<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { mockStore } from '@/ui/stores/mockData';
import { Filter, ArrowUpDown, Play } from 'lucide-vue-next';
const router = useRouter();

const years = ['all', '2024', '2023', '2022', '2021'];
const genres = ['all', '治愈', '奇幻', '艺术', '极简', '实验', '悬疑', '科幻', '青春'];

const filteredCollections = computed(() => {
  let list = [...mockStore.collections];

  // Sidebar Filter (existing logic)
  if (mockStore.homeFilter === 'fav') {
    list = list.filter(c => c.score > 9.5);
  } else if (mockStore.homeFilter === 'recent') {
    list = list.filter(c => c.year === 2024);
  } else if (mockStore.homeFilter === 'trash') {
    return [];
  }

  // Active Year Filter
  if (mockStore.activeYear !== 'all') {
    list = list.filter(c => c.year === parseInt(mockStore.activeYear));
  }

  // Active Genre Filter
  if (mockStore.activeGenre !== 'all') {
    list = list.filter(c => c.tags.includes(mockStore.activeGenre));
  }

  // Search Filter
  if (mockStore.searchQuery) {
    const query = mockStore.searchQuery.toLowerCase();
    list = list.filter(c => 
      c.title.toLowerCase().includes(query) || 
      c.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Sorting
  if (mockStore.sortOrder === 'newest') {
    list.sort((a, b) => b.year - a.year || b.id - a.id);
  } else {
    list.sort((a, b) => a.year - b.year || a.id - b.id);
  }

  return list;
});

const toggleSort = () => {
  mockStore.sortOrder = mockStore.sortOrder === 'newest' ? 'oldest' : 'newest';
};

const enterTheatre = (item: any) => {
  mockStore.selectedMedia = null;
  router.push({ name: 'theatre', params: { id: item.id } });
};
</script>

<template>
  <div class="home-view">
    <header class="page-header">
      <div class="header-actions">
        <button 
          class="tool-btn" 
          :class="{ active: mockStore.isFilterBarOpen }"
          @click="mockStore.isFilterBarOpen = !mockStore.isFilterBarOpen"
        >
          <Filter :size="16" />
          <span>筛选</span>
        </button>
        <button class="tool-btn" @click="toggleSort">
          <ArrowUpDown :size="16" />
          <span>排序</span>
        </button>
      </div>
    </header>

    <!-- Filter Bar -->
    <Transition name="slide-down">
      <div v-if="mockStore.isFilterBarOpen" class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">年份</span>
          <div class="filter-options">
            <button 
              v-for="year in years" 
              :key="year"
              class="option-btn"
              :class="{ active: mockStore.activeYear === year }"
              @click="mockStore.activeYear = year"
            >
              {{ year === 'all' ? '全部' : year }}
            </button>
          </div>
        </div>
        <div class="filter-group">
          <span class="filter-label">类型</span>
          <div class="filter-options">
            <button 
              v-for="genre in genres" 
              :key="genre"
              class="option-btn"
              :class="{ active: mockStore.activeGenre === genre }"
              @click="mockStore.activeGenre = genre"
            >
              {{ genre === 'all' ? '全部' : genre }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <div class="bento-grid">
      <div 
        v-for="item in filteredCollections" 
        :key="item.id"
        class="bento-item"
        @click="mockStore.selectedMedia = item"
      >
        <div class="card-image-wrap">
          <img :src="item.image" :alt="item.title" class="item-img" />
          
          <!-- Persistent Title (Inside Card) -->
          <div 
            v-if="!mockStore.settings.compactMode" 
            class="persistent-label"
          >
            <h3 class="label-title">{{ item.title }}</h3>
          </div>

          <!-- Hover Overlay -->
          <div class="item-overlay">
            <div class="overlay-left">
              <h3 class="overlay-title">{{ item.title }}</h3>
              <div class="overlay-meta">
                <span>{{ item.year }}</span>
                <span class="meta-separator">•</span>
                <span>{{ item.tags[0] }}</span>
              </div>
            </div>
            <div class="overlay-right">
              <button 
                class="play-btn-gradient" 
                @click.stop="enterTheatre(item)"
              >
                <Play :size="18" fill="currentColor" />
              </button>
            </div>
          </div>
        </div>
        <div v-if="mockStore.selectedMedia?.id === item.id" class="selection-indicator"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 32px;
}

.header-actions {
  display: flex;
  gap: 24px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--primary);
  opacity: 0.6;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  transition: opacity 0.3s ease;
}

.tool-btn:hover, .tool-btn.active {
  opacity: 1;
}

.filter-bar {
  background-color: var(--surface-low);
  padding: 24px;
  border-radius: 16px;
  margin-bottom: 32px;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 24px;
}

.filter-group:not(:last-child) {
  margin-bottom: 16px;
}

.filter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--on-surface-variant);
  width: 40px;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.option-btn {
  padding: 6px 16px;
  border-radius: 99px;
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface-variant);
  background-color: var(--surface);
  transition: all 0.3s ease;
}

.option-btn:hover {
  background-color: var(--surface-dim);
}

.option-btn.active {
  background-color: var(--primary);
  color: white;
}

/* Transitions */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 24px;
}

.bento-item {
  position: relative;
  cursor: pointer;
}

.card-image-wrap {
  position: relative;
  aspect-ratio: 1 / 1.4;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-ambient);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--surface-low);
}

.bento-item:hover .card-image-wrap {
  transform: translateY(-6px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
}

.item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s ease;
}

.bento-item:hover .item-img {
  transform: scale(1.1);
}

/* Persistent Label (Bottom Left) */
.persistent-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
  transition: opacity 0.3s ease;
}

.bento-item:hover .persistent-label {
  opacity: 0;
}

.label-title {
  color: white;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Hover Overlay */
.item-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.2) 50%, transparent 100%);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 16px;
  opacity: 0;
  transition: all 0.3s ease;
}

.bento-item:hover .item-overlay {
  opacity: 1;
}

.overlay-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overlay-title {
  color: white;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.overlay-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 500;
}

.meta-separator {
  opacity: 0.4;
}

.overlay-right {
  margin-left: 12px;
}

.play-btn-gradient {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.4);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.play-btn-gradient:hover {
  transform: scale(1.1);
  filter: brightness(1.1);
}

.item-meta {
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.selection-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 12px;
  height: 12px;
  background-color: var(--primary);
  border-radius: 50%;
  box-shadow: 0 0 10px var(--primary);
}
</style>
