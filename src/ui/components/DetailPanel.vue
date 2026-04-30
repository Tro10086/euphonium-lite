<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { uiState } from '@/ui/stores/uiState';
import { X, Heart, Star, Play } from 'lucide-vue-next';
import { animeAPI } from '@/services/storage';

const emit = defineEmits(['close']);
const router = useRouter();

const isExpanded = ref(false);
const showExpandBtn = ref(false);
const descRef = ref<HTMLElement | null>(null);
const selectedMedia = computed(() => uiState.selectedMedia);
const progressStats = computed(() => {
  const item = selectedMedia.value;
  if (!item) return { watched: 0, total: 0, percent: 0 };

  const total = item.episodes || item.episodesList?.length || 0;
  const watched = Math.min(item.watchedEpisodes ?? 0, total);
  const percent = Math.min(100, Math.max(0, item.watchProgress ?? 0));
  return { watched, total, percent };
});

const checkTruncation = () => {
  nextTick(() => {
    if (descRef.value) {
      const el = descRef.value;
      // When clamped to 2 lines, clientHeight is the height of 2 lines.
      // scrollHeight is the height of the entire content.
      // We add a 2px buffer to account for sub-pixel rendering/rounding issues.
      showExpandBtn.value = el.scrollHeight > el.clientHeight + 2;
    }
  });
};

onMounted(() => {
  checkTruncation();
  window.addEventListener('resize', checkTruncation);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkTruncation);
});

watch(() => uiState.selectedMedia, () => {
  isExpanded.value = false;
  checkTruncation();
});

const goToTheatre = () => {
  if (!uiState.selectedMedia) return;
  const id = uiState.selectedMedia.id;
  uiState.selectedMedia = null;
  router.push({ name: 'theatre', params: { id } });
};

const toggleFavorite = async () => {
  if (!uiState.selectedMedia) return;

  const nextValue = !uiState.selectedMedia.isFavorite;
  await animeAPI.update(String(uiState.selectedMedia.id), { is_favorite: nextValue });
  uiState.selectedMedia = {
    ...uiState.selectedMedia,
    isFavorite: nextValue,
  };
  uiState.libraryVersion += 1;
};
</script>

<template>
  <div class="detail-wrapper">
    <!-- Click outside overlay -->
    <div class="overlay" @click="emit('close')"></div>
    
    <aside v-if="selectedMedia" class="detail-panel glass-panel">
      <!-- Header -->
    <header class="header">
      <button class="close-btn" @click="emit('close')">
        <X :size="20" />
      </button>
      <div class="actions">
        <button class="plain-heart-btn" :class="{ active: selectedMedia.isFavorite }" @click="toggleFavorite">
          <Heart
            :size="22"
            :fill="selectedMedia.isFavorite ? '#c62828' : 'none'"
            :color="selectedMedia.isFavorite ? '#c62828' : 'currentColor'"
          />
        </button>
      </div>
    </header>

    <div class="panel-content">
      <!-- Media Hero -->
      <div class="hero-image">
        <img :src="selectedMedia.image" :alt="selectedMedia.title" />
      </div>

      <!-- Title & Score -->
      <div class="title-section">
        <div class="title-row">
          <h2 class="title">{{ selectedMedia.title }}</h2>
          <div class="score-badge">
            <Star :size="16" class="star-filled" />
            <span>{{ selectedMedia.score }}</span>
          </div>
        </div>
        <div class="tags-row">
          <span class="year">{{ selectedMedia.year }}</span>
          <span class="dot">·</span>
          <span class="epis">{{ selectedMedia.episodes }} 集</span>
          <span class="dot" v-if="selectedMedia.tags?.length">·</span>
          <div class="tag-group">
            <span v-for="(tag, index) in selectedMedia.tags" :key="tag" class="tag-pill">
              {{ tag }}
              <span v-if="index < selectedMedia.tags.length - 1" class="inner-dot">·</span>
            </span>
          </div>
        </div>
      </div>

      <!-- Progress Tracking -->
      <div class="progress-card">
        <div class="progress-header">
          <span class="progress-label">观看进度</span>
          <span class="progress-stats">已观看 {{ progressStats.watched }} / {{ progressStats.total }} 集</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progressStats.percent}%` }"></div>
        </div>
      </div>

      <!-- Description -->
      <div class="info-section">
        <h3 class="info-title">作品简介</h3>
        <p 
          ref="descRef" 
          class="description" 
          :class="{ 'expanded': isExpanded }"
        >
          {{ selectedMedia.desc }}
        </p>
        <button 
          v-if="showExpandBtn" 
          class="expand-btn" 
          @click="isExpanded = !isExpanded"
        >
          {{ isExpanded ? '收起' : '展开全部' }}
        </button>
      </div>
    </div>

    <!-- Sticky Footer -->
    <footer class="footer">
      <button class="btn-play" @click="goToTheatre">
        <Play :size="20" class="play-filled" />
        <span>进入放映厅</span>
      </button>
    </footer>
    </aside>
  </div>
</template>

<style scoped>
.detail-wrapper {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(2px);
}

.detail-panel {
  width: 480px;
  height: 100vh;
  position: relative;
  background-color: var(--surface);
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.05);
  border-left: 1px solid rgba(0, 0, 0, 0.05);
  animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.header {
  height: 72px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  flex-shrink: 0;
}

.close-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: var(--surface-low);
  color: var(--on-surface);
  transition: all 0.3s ease;
}

.close-btn:hover {
  background-color: var(--surface-dim);
  color: var(--primary);
}

.plain-heart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant);
  transition: all 0.3s ease;
}

.plain-heart-btn:hover {
  transform: scale(1.1);
}

.panel-content {
  flex: 1;
  padding: 0 32px 24px;
}

.hero-image {
  aspect-ratio: 16 / 9;
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 24px;
}

.hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.title-section {
  margin-bottom: 24px;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.title {
  font-size: 24px;
  font-weight: 800;
}

.score-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 800;
  font-size: 14px;
  color: var(--primary);
}

.star-filled {
  fill: var(--primary);
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--on-surface-variant);
  opacity: 0.8;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.dot, .inner-dot {
  color: var(--primary);
  font-weight: 900;
  opacity: 0.6;
}

.tag-group {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  flex-wrap: nowrap;
}

.tag-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.progress-card {
  background-color: var(--surface-low);
  padding: 16px;
  border-radius: 16px;
  margin-bottom: 24px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.progress-label {
  font-weight: 700;
}

.progress-stats {
  color: var(--primary);
}

.progress-bar {
  height: 4px;
  background-color: var(--surface-dim);
  border-radius: 2px;
}

.progress-fill {
  height: 100%;
  background-color: var(--primary);
}

.info-section {
  margin-bottom: 16px;
}

.info-title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--on-surface);
}

.description {
  line-height: 1.6;
  color: var(--on-surface-variant);
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.description.expanded {
  -webkit-line-clamp: unset;
}

.expand-btn {
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  margin-top: 4px;
  cursor: pointer;
}

.footer {
  padding: 16px 32px 32px;
}

.btn-play {
  width: 100%;
  padding: 16px;
  border-radius: 16px;
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  color: white;
  font-weight: 700;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 10px 30px rgba(119, 90, 25, 0.3);
  letter-spacing: 1px;
}
</style>
