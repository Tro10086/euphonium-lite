<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { type CollectionItem, uiState } from '@/ui/stores/uiState';
import { ArrowUpDown, CheckSquare, Filter, Play, RotateCcw, Square, Trash2 } from 'lucide-vue-next';
import { animeAPI, episodeAPI } from '@/services/storage';
import type { Anime, Episode } from '@/models/Anime';
const router = useRouter();

const years = ['all', '2024', '2023', '2022', '2021'];
const genres = ['all', '治愈', '奇幻', '艺术', '极简', '实验', '悬疑', '科幻', '青春'];
const animes = ref<Anime[]>([]);
const episodesByAnimeId = ref<Record<string, Episode[]>>({});
const selectedTrashIds = ref<Set<string>>(new Set());
const emptyText = computed(() => (uiState.homeFilter === 'trash' ? '回收站为空' : '暂无真实馆藏数据'));
const isTrashView = computed(() => uiState.homeFilter === 'trash');
const selectedTrashCount = computed(() => selectedTrashIds.value.size);
const allTrashSelected = computed(() =>
  isTrashView.value && filteredCollections.value.length > 0 && filteredCollections.value.every((item) => selectedTrashIds.value.has(String(item.id))),
);

const asDate = (value: Date | string | number | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const recentAnimeIds = computed(() =>
  [...animes.value]
    .filter((anime) => !anime.deleted_at)
    .sort((a: Anime, b: Anime) => {
      const bTime = asDate(b.last_watched_at)?.getTime() ?? asDate(b.updated_at)?.getTime() ?? 0;
      const aTime = asDate(a.last_watched_at)?.getTime() ?? asDate(a.updated_at)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, 12)
    .map((anime) => anime.id),
);

const uniqueTags = (tags: string[] | undefined) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));

const progressForAnime = (anime: Anime) => {
  const episodes = episodesByAnimeId.value[anime.id] ?? [];
  const total = anime.total_episodes || episodes.length || 0;
  const watchedEpisodes = episodes.filter((episode) =>
    episode.watched || (episode.watch_percentage ?? 0) >= 90,
  ).length;
  const progressSum = episodes.reduce((sum, episode) => {
    if (episode.watched) return sum + 100;
    return sum + Math.min(100, Math.max(0, episode.watch_percentage ?? 0));
  }, 0);
  const watchProgress = total > 0 ? Math.round(progressSum / total) : 0;

  return { watchedEpisodes, watchProgress };
};

const libraryCollections = computed<CollectionItem[]>(() => {
  return animes.value.map((anime) => {
    const tags = uniqueTags(anime.tags);
    const progress = progressForAnime(anime);

    return {
      id: anime.id,
      title: anime.name_cn || anime.name || '未命名番剧',
      meta: `${anime.date?.slice(0, 4) || '未知'} · ${anime.status}`,
      year: Number(anime.date?.slice(0, 4)) || 0,
      episodes: anime.total_episodes,
      score: anime.bangumi_score || anime.rating || 0,
      desc: anime.summary || '暂无简介',
      image: anime.cover || 'https://picsum.photos/seed/euphonium-local/800/1200',
      episodesList: Array.from({ length: anime.total_episodes || 1 }, (_, index) => `第 ${index + 1} 集`),
      deletedAt: asDate(anime.deleted_at),
      purgeRequestedAt: asDate(anime.purge_requested_at),
      isFavorite: Boolean(anime.is_favorite),
      tags: tags.length ? tags : ['本地'],
      watchedEpisodes: progress.watchedEpisodes,
      watchProgress: progress.watchProgress,
    };
  });
});

const filteredCollections = computed(() => {
  let list = libraryCollections.value.filter((item) =>
    uiState.homeFilter === 'trash'
      ? Boolean(item.deletedAt) && !item.purgeRequestedAt
      : !item.deletedAt && !item.purgeRequestedAt,
  );

  if (uiState.homeFilter === 'fav') {
    list = list.filter(c => c.isFavorite);
  } else if (uiState.homeFilter === 'recent') {
    list = list.filter(c => recentAnimeIds.value.includes(String(c.id)));
  }

  // Active Year Filter
  if (uiState.activeYear !== 'all') {
    list = list.filter(c => c.year === parseInt(uiState.activeYear));
  }

  // Active Genre Filter
  if (uiState.activeGenre !== 'all') {
    list = list.filter(c => c.tags.includes(uiState.activeGenre));
  }

  // Search Filter
  if (uiState.searchQuery) {
    const query = uiState.searchQuery.toLowerCase();
    list = list.filter(c => 
      c.title.toLowerCase().includes(query) || 
      c.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Sorting
  if (uiState.sortOrder === 'newest') {
    list.sort((a, b) => b.year - a.year || String(b.id).localeCompare(String(a.id)));
  } else {
    list.sort((a, b) => a.year - b.year || String(a.id).localeCompare(String(b.id)));
  }

  return list;
});

const toggleSort = () => {
  uiState.sortOrder = uiState.sortOrder === 'newest' ? 'oldest' : 'newest';
};

const enterTheatre = (item: CollectionItem) => {
  uiState.selectedMedia = null;
  router.push({ name: 'theatre', params: { id: item.id } });
};

const setTrashSelection = (ids: string[]) => {
  selectedTrashIds.value = new Set(ids);
};

const toggleTrashSelection = (item: CollectionItem) => {
  const next = new Set(selectedTrashIds.value);
  const id = String(item.id);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedTrashIds.value = next;
};

const handleCardClick = (item: CollectionItem) => {
  if (isTrashView.value) {
    toggleTrashSelection(item);
    return;
  }
  uiState.selectedMedia = item;
};

const refreshAnimes = async () => {
  const [animeRows, episodeRows] = await Promise.all([animeAPI.getAll(), episodeAPI.getAll()]);
  const grouped: Record<string, Episode[]> = {};
  for (const episode of episodeRows) {
    (grouped[episode.anime_id] ??= []).push(episode);
  }
  animes.value = animeRows;
  episodesByAnimeId.value = grouped;
};

const moveToTrash = async (item: CollectionItem) => {
  await animeAPI.moveToTrash(String(item.id));
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null;
  await refreshAnimes();
};

const restoreFromTrash = async (item: CollectionItem) => {
  await animeAPI.restoreFromTrash(String(item.id));
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null;
  selectedTrashIds.value.delete(String(item.id));
  selectedTrashIds.value = new Set(selectedTrashIds.value);
  await refreshAnimes();
};

const markTrashDeleted = async (item: CollectionItem) => {
  const ok = window.confirm(`确定要从回收站移除「${item.title}」吗？数据仍会以软删除状态保留在 IndexedDB。`);
  if (!ok) return;

  await animeAPI.markTrashDeleted(String(item.id));
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null;
  selectedTrashIds.value.delete(String(item.id));
  selectedTrashIds.value = new Set(selectedTrashIds.value);
  await refreshAnimes();
};

const toggleSelectAllTrash = () => {
  if (allTrashSelected.value) {
    setTrashSelection([]);
    return;
  }
  setTrashSelection(filteredCollections.value.map((item) => String(item.id)));
};

const restoreSelectedTrash = async () => {
  const ids = Array.from(selectedTrashIds.value);
  if (ids.length === 0) return;

  await Promise.all(ids.map((id) => animeAPI.restoreFromTrash(id)));
  setTrashSelection([]);
  await refreshAnimes();
};

const markSelectedTrashDeleted = async () => {
  const ids = Array.from(selectedTrashIds.value);
  if (ids.length === 0) return;

  const ok = window.confirm(`确定要从回收站移除选中的 ${ids.length} 个条目吗？数据仍会以软删除状态保留在 IndexedDB。`);
  if (!ok) return;

  await animeAPI.markTrashDeletedBulk(ids);
  setTrashSelection([]);
  if (uiState.selectedMedia && ids.includes(String(uiState.selectedMedia.id))) uiState.selectedMedia = null;
  await refreshAnimes();
};

watch(() => uiState.homeFilter, () => {
  setTrashSelection([]);
});

watch(() => uiState.libraryVersion, () => {
  void refreshAnimes();
});

onMounted(async () => {
  await animeAPI.purgeExpiredTrash();
  await refreshAnimes();
});
</script>

<template>
  <div class="home-view">
    <header class="page-header">
      <div class="header-actions">
        <template v-if="isTrashView">
          <span class="selection-summary">已选 {{ selectedTrashCount }}</span>
          <button class="tool-btn" @click="toggleSelectAllTrash">
            <CheckSquare v-if="allTrashSelected" :size="16" />
            <Square v-else :size="16" />
            <span>{{ allTrashSelected ? '取消全选' : '全选' }}</span>
          </button>
          <button class="tool-btn" :disabled="selectedTrashCount === 0" @click="restoreSelectedTrash">
            <RotateCcw :size="16" />
            <span>复原</span>
          </button>
          <button class="tool-btn danger" :disabled="selectedTrashCount === 0" @click="markSelectedTrashDeleted">
            <Trash2 :size="16" />
            <span>删除</span>
          </button>
        </template>
        <button 
          class="tool-btn" 
          :class="{ active: uiState.isFilterBarOpen }"
          @click="uiState.isFilterBarOpen = !uiState.isFilterBarOpen"
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
      <div v-if="uiState.isFilterBarOpen" class="filter-bar">
        <div class="filter-group">
          <span class="filter-label">年份</span>
          <div class="filter-options">
            <button 
              v-for="year in years" 
              :key="year"
              class="option-btn"
              :class="{ active: uiState.activeYear === year }"
              @click="uiState.activeYear = year"
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
              :class="{ active: uiState.activeGenre === genre }"
              @click="uiState.activeGenre = genre"
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
        :class="{ selected: isTrashView && selectedTrashIds.has(String(item.id)) }"
        @click="handleCardClick(item)"
      >
        <div class="card-image-wrap">
          <img :src="item.image" :alt="item.title" class="item-img" />
          <button
            v-if="uiState.homeFilter !== 'trash'"
            class="card-action-btn delete-card-btn"
            title="移入回收站"
            @click.stop="moveToTrash(item)"
          >
            <Trash2 :size="16" />
          </button>
          <button
            v-else
            class="card-action-btn delete-card-btn"
            title="从回收站移除"
            @click.stop="markTrashDeleted(item)"
          >
            <Trash2 :size="16" />
          </button>

          <!-- Persistent Title (Inside Card) -->
          <div class="persistent-label">
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
                v-if="uiState.homeFilter !== 'trash'"
                class="play-btn-gradient" 
                @click.stop="enterTheatre(item)"
              >
                <Play :size="18" fill="currentColor" />
              </button>
              <button
                v-else
                class="restore-btn-gradient"
                @click.stop="restoreFromTrash(item)"
              >
                <RotateCcw :size="18" />
              </button>
            </div>
          </div>
        </div>
        <div
          v-if="(isTrashView && selectedTrashIds.has(String(item.id))) || (!isTrashView && uiState.selectedMedia?.id === item.id)"
          class="selection-indicator"
        ></div>
      </div>
    </div>
    <div v-if="filteredCollections.length === 0" class="empty-library">
      <p>{{ emptyText }}</p>
      <RouterLink v-if="uiState.homeFilter !== 'trash'" :to="{ name: 'import' }">前往导入</RouterLink>
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

.tool-btn.danger {
  color: var(--error);
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.selection-summary {
  display: inline-flex;
  align-items: center;
  height: 32px;
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 700;
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

.bento-item.selected .card-image-wrap {
  outline: 3px solid var(--primary);
  outline-offset: 3px;
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

.card-action-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
}

.bento-item:hover .card-action-btn {
  opacity: 1;
  transform: translateY(0);
}

.delete-card-btn {
  background-color: rgba(170, 44, 44, 0.88);
}

.delete-card-btn:hover {
  background-color: var(--error);
}

.restore-card-btn {
  background-color: rgba(49, 126, 89, 0.88);
}

.restore-card-btn:hover {
  background-color: #2f8f64;
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

.restore-btn-gradient {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f8f64, #7fc6a3);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(47, 143, 100, 0.35);
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.restore-btn-gradient:hover {
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

.empty-library {
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--on-surface-variant);
}

.empty-library a {
  color: var(--primary);
  font-weight: 700;
}
</style>
