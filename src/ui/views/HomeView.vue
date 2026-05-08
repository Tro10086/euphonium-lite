<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowUpDown,
  CheckSquare,
  Filter,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-vue-next'
import type { Anime, Episode } from '@/models/Anime'
import { loadLibraryFilterOptions, rememberAnimeFilterOptionsBulk } from '@/services/filterOptions'
import { animeAPI, collectionAPI, episodeAPI } from '@/services/storage'
import { rebuildNavItems, type CollectionItem, uiState } from '@/ui/stores/uiState'

const router = useRouter()

type SortMode = 'name' | 'rating' | 'time' | 'recent'

const filterOptionCache = ref(loadLibraryFilterOptions())
const animes = ref<Anime[]>([])
const episodesByAnimeId = ref<Record<string, Episode[]>>({})
const selectedTrashIds = ref<Set<string>>(new Set())
const selectedCollectionIds = ref<Set<string>>(new Set())
const selectedCollectionAddIds = ref<Set<string>>(new Set())
const isCollectionSelectionMode = ref(false)
const isCollectionAddMode = ref(false)

const years = computed(() => ['all', ...filterOptionCache.value.years])
const genres = computed(() => ['all', ...filterOptionCache.value.tags])
const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'name', label: '按名称排序' },
  { value: 'rating', label: '按评分排序' },
  { value: 'time', label: '按时间排序' },
  { value: 'recent', label: '按最近排序' },
]

const isTrashView = computed(() => uiState.homeFilter === 'trash')
const activeCollection = computed(
  () =>
    uiState.customCollections.find((collection) => collection.id === uiState.homeFilter) ?? null,
)
const isCustomCollectionView = computed(() => Boolean(activeCollection.value))
const activeCollectionAnimeIdSet = computed(
  () => new Set(activeCollection.value?.animeIds.map((id) => String(id)) ?? []),
)
const selectedTrashCount = computed(() => selectedTrashIds.value.size)
const selectedCollectionCount = computed(() => selectedCollectionIds.value.size)
const selectedCollectionAddCount = computed(() => selectedCollectionAddIds.value.size)
const sortLabel = computed(
  () => sortOptions.find((option) => option.value === uiState.sortOrder)?.label ?? '排序',
)

const emptyText = computed(() => {
  if (isTrashView.value) return '回收站为空'
  if (isCollectionAddMode.value) return '没有可添加的动画'
  if (activeCollection.value) return `${activeCollection.value.label} 里还没有动画`
  return '暂无真实馆藏数据'
})

const asDate = (value: Date | string | number | null | undefined) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const recentAnimeIds = computed(() =>
  [...animes.value]
    .filter((anime) => !anime.deleted_at)
    .sort((a, b) => {
      const bTime = asDate(b.last_watched_at)?.getTime() ?? asDate(b.updated_at)?.getTime() ?? 0
      const aTime = asDate(a.last_watched_at)?.getTime() ?? asDate(a.updated_at)?.getTime() ?? 0
      return bTime - aTime
    })
    .slice(0, 12)
    .map((anime) => anime.id),
)

const uniqueTags = (tags: string[] | undefined) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)))

const progressForAnime = (anime: Anime) => {
  const episodes = [...(episodesByAnimeId.value[anime.id] ?? [])].sort(
    (a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep),
  )
  const total = anime.total_episodes || episodes.length || 0
  if (total <= 0) return { watchedEpisodes: 0, watchProgress: 0 }

  let furthestIndex = -1
  let furthestPercentage = 0
  episodes.forEach((episode, index) => {
    const percentage = episode.watched
      ? 100
      : Math.min(100, Math.max(0, episode.watch_percentage ?? 0))
    if (percentage <= 0) return
    if (index > furthestIndex || (index === furthestIndex && percentage > furthestPercentage)) {
      furthestIndex = index
      furthestPercentage = percentage
    }
  })

  if (furthestIndex >= 0) {
    const completedEpisodes = furthestIndex + (furthestPercentage >= 90 ? 1 : 0)
    const progressEpisodes = furthestIndex + furthestPercentage / 100

    return {
      watchedEpisodes: Math.min(total, completedEpisodes),
      watchProgress: Math.min(100, Math.round((progressEpisodes / total) * 100)),
    }
  }

  return { watchedEpisodes: 0, watchProgress: 0 }
}

const libraryCollections = computed<CollectionItem[]>(() =>
  animes.value.map((anime) => {
    const tags = uniqueTags(anime.tags)
    const progress = progressForAnime(anime)

    return {
      id: anime.id,
      title: anime.name_cn || anime.name || '未命名番剧',
      meta: `${anime.date?.slice(0, 4) || '未知'} · ${anime.status}`,
      year: Number(anime.date?.slice(0, 4)) || 0,
      episodes: anime.total_episodes,
      score: anime.bangumi_score || anime.rating || 0,
      userRating: anime.rating || 0,
      desc: anime.summary || '暂无简介',
      image: anime.cover || 'https://picsum.photos/seed/euphonium-local/800/1200',
      episodesList: Array.from(
        { length: anime.total_episodes || 1 },
        (_, index) => `第 ${index + 1} 集`,
      ),
      deletedAt: asDate(anime.deleted_at),
      purgeRequestedAt: asDate(anime.purge_requested_at),
      isFavorite: Boolean(anime.is_favorite),
      tags: tags.length ? tags : ['本地'],
      watchedEpisodes: progress.watchedEpisodes,
      watchProgress: progress.watchProgress,
      createdAt: asDate(anime.created_at),
      updatedAt: asDate(anime.updated_at),
      lastWatchedAt: asDate(anime.last_watched_at),
    }
  }),
)

const filteredCollections = computed(() => {
  let list = libraryCollections.value.filter((item) => {
    if (isTrashView.value) return Boolean(item.deletedAt) && !item.purgeRequestedAt
    if (isCollectionAddMode.value) return !item.deletedAt && !item.purgeRequestedAt
    if (activeCollection.value) {
      return (
        activeCollectionAnimeIdSet.value.has(String(item.id)) &&
        !item.deletedAt &&
        !item.purgeRequestedAt
      )
    }
    return !item.deletedAt && !item.purgeRequestedAt
  })

  if (!activeCollection.value && !isCollectionAddMode.value) {
    if (uiState.homeFilter === 'fav') {
      list = list.filter((item) => item.isFavorite)
    } else if (uiState.homeFilter === 'recent') {
      list = list.filter((item) => recentAnimeIds.value.includes(String(item.id)))
    }
  }

  if (uiState.activeYear !== 'all') {
    list = list.filter((item) => item.year === Number.parseInt(uiState.activeYear, 10))
  }

  if (uiState.activeGenre !== 'all') {
    list = list.filter((item) => item.tags.includes(uiState.activeGenre))
  }

  if (uiState.searchQuery) {
    const query = uiState.searchQuery.toLowerCase()
    list = list.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)),
    )
  }

  const compareName = (a: CollectionItem, b: CollectionItem) =>
    a.title.localeCompare(b.title, 'zh-Hans-CN')
  const timeValue = (value: Date | null | undefined) => value?.getTime() ?? 0

  if (uiState.sortOrder === 'name') {
    list.sort(compareName)
  } else if (uiState.sortOrder === 'rating') {
    list.sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0) || compareName(a, b))
  } else if (uiState.sortOrder === 'time') {
    list.sort(
      (a, b) =>
        b.year - a.year || timeValue(b.updatedAt) - timeValue(a.updatedAt) || compareName(a, b),
    )
  } else {
    list.sort(
      (a, b) =>
        timeValue(b.lastWatchedAt) - timeValue(a.lastWatchedAt) ||
        timeValue(b.updatedAt) - timeValue(a.updatedAt) ||
        compareName(a, b),
    )
  }

  return list
})

const selectableCollectionIds = computed(() =>
  filteredCollections.value.map((item) => String(item.id)),
)
const selectableCollectionAddIds = computed(() =>
  filteredCollections.value
    .filter((item) => !activeCollectionAnimeIdSet.value.has(String(item.id)))
    .map((item) => String(item.id)),
)

const allTrashSelected = computed(
  () =>
    isTrashView.value &&
    filteredCollections.value.length > 0 &&
    filteredCollections.value.every((item) => selectedTrashIds.value.has(String(item.id))),
)

const allCollectionSelected = computed(
  () =>
    isCustomCollectionView.value &&
    isCollectionSelectionMode.value &&
    selectableCollectionIds.value.length > 0 &&
    selectableCollectionIds.value.every((id) => selectedCollectionIds.value.has(id)),
)

const allCollectionAddSelected = computed(
  () =>
    isCollectionAddMode.value &&
    selectableCollectionAddIds.value.length > 0 &&
    selectableCollectionAddIds.value.every((id) => selectedCollectionAddIds.value.has(id)),
)

const isItemAlreadyInCollection = (itemId: string | number) =>
  activeCollectionAnimeIdSet.value.has(String(itemId))

const isCardSelected = (itemId: string | number) => {
  const id = String(itemId)
  if (isTrashView.value) return selectedTrashIds.value.has(id)
  if (isCollectionAddMode.value) return selectedCollectionAddIds.value.has(id)
  if (isCustomCollectionView.value && isCollectionSelectionMode.value) {
    return selectedCollectionIds.value.has(id)
  }
  return uiState.selectedMedia?.id === itemId
}

const toggleSort = () => {
  const index = sortOptions.findIndex((option) => option.value === uiState.sortOrder)
  uiState.sortOrder = sortOptions[(index + 1) % sortOptions.length]?.value ?? 'name'
}

const enterTheatre = (item: CollectionItem) => {
  uiState.selectedMedia = null
  router.push({ name: 'theatre', params: { id: item.id } })
}

const setTrashSelection = (ids: string[]) => {
  selectedTrashIds.value = new Set(ids)
}

const setCollectionSelection = (ids: string[]) => {
  selectedCollectionIds.value = new Set(ids)
}

const setCollectionAddSelection = (ids: string[]) => {
  selectedCollectionAddIds.value = new Set(ids)
}

const clearCollectionSelection = () => {
  setCollectionSelection([])
  isCollectionSelectionMode.value = false
}

const clearCollectionAddSelection = () => {
  setCollectionAddSelection([])
}

const clearCollectionModes = () => {
  clearCollectionSelection()
  clearCollectionAddSelection()
  isCollectionAddMode.value = false
}

const toggleTrashSelection = (item: CollectionItem) => {
  const next = new Set(selectedTrashIds.value)
  const id = String(item.id)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedTrashIds.value = next
}

const toggleCollectionSelection = (item: CollectionItem) => {
  const next = new Set(selectedCollectionIds.value)
  const id = String(item.id)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedCollectionIds.value = next
}

const toggleCollectionAddSelection = (item: CollectionItem) => {
  const id = String(item.id)
  if (isItemAlreadyInCollection(id)) return
  const next = new Set(selectedCollectionAddIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedCollectionAddIds.value = next
}

const handleCardClick = (item: CollectionItem) => {
  if (isTrashView.value) {
    toggleTrashSelection(item)
    return
  }

  if (isCollectionAddMode.value) {
    toggleCollectionAddSelection(item)
    return
  }

  if (isCustomCollectionView.value && isCollectionSelectionMode.value) {
    toggleCollectionSelection(item)
    return
  }

  uiState.selectedMedia = item
}

const refreshAnimes = async () => {
  const [animeRows, episodeRows] = await Promise.all([animeAPI.getAll(), episodeAPI.getAll()])
  const grouped: Record<string, Episode[]> = {}
  for (const episode of episodeRows) {
    ;(grouped[episode.anime_id] ??= []).push(episode)
  }
  filterOptionCache.value = rememberAnimeFilterOptionsBulk(animeRows)
  animes.value = animeRows
  episodesByAnimeId.value = grouped
}

const refreshCollections = async () => {
  rebuildNavItems(await collectionAPI.getAll())
}

const moveToTrash = async (item: CollectionItem) => {
  await animeAPI.moveToTrash(String(item.id))
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null
  await refreshAnimes()
}

const restoreFromTrash = async (item: CollectionItem) => {
  await animeAPI.restoreFromTrash(String(item.id))
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null
  selectedTrashIds.value.delete(String(item.id))
  selectedTrashIds.value = new Set(selectedTrashIds.value)
  await refreshAnimes()
}

const markTrashDeleted = async (item: CollectionItem) => {
  const ok = window.confirm(
    `确定要从回收站移除「${item.title}」吗？数据仍会以软删除状态保留在 IndexedDB。`,
  )
  if (!ok) return

  await animeAPI.markTrashDeleted(String(item.id))
  if (uiState.selectedMedia?.id === item.id) uiState.selectedMedia = null
  selectedTrashIds.value.delete(String(item.id))
  selectedTrashIds.value = new Set(selectedTrashIds.value)
  await refreshAnimes()
}

const toggleSelectAllTrash = () => {
  if (allTrashSelected.value) {
    setTrashSelection([])
    return
  }
  setTrashSelection(filteredCollections.value.map((item) => String(item.id)))
}

const restoreSelectedTrash = async () => {
  const ids = Array.from(selectedTrashIds.value)
  if (ids.length === 0) return

  await Promise.all(ids.map((id) => animeAPI.restoreFromTrash(id)))
  setTrashSelection([])
  await refreshAnimes()
}

const markSelectedTrashDeleted = async () => {
  const ids = Array.from(selectedTrashIds.value)
  if (ids.length === 0) return

  const ok = window.confirm(
    `确定要从回收站移除选中的 ${ids.length} 个条目吗？数据仍会以软删除状态保留在 IndexedDB。`,
  )
  if (!ok) return

  await animeAPI.markTrashDeletedBulk(ids)
  setTrashSelection([])
  if (uiState.selectedMedia && ids.includes(String(uiState.selectedMedia.id)))
    uiState.selectedMedia = null
  await refreshAnimes()
}

const beginCollectionAddMode = () => {
  if (!activeCollection.value) return
  uiState.selectedMedia = null
  clearCollectionSelection()
  clearCollectionAddSelection()
  isCollectionAddMode.value = true
}

const cancelCollectionAddMode = () => {
  clearCollectionAddSelection()
  isCollectionAddMode.value = false
}

const toggleCollectionSelectionMode = () => {
  if (!activeCollection.value) return
  uiState.selectedMedia = null
  isCollectionSelectionMode.value = !isCollectionSelectionMode.value
  isCollectionAddMode.value = false
  setCollectionSelection([])
}

const toggleSelectAllCollection = () => {
  if (allCollectionSelected.value) {
    setCollectionSelection([])
    return
  }
  setCollectionSelection(selectableCollectionIds.value)
}

const toggleSelectAllCollectionAdd = () => {
  if (allCollectionAddSelected.value) {
    setCollectionAddSelection([])
    return
  }
  setCollectionAddSelection(selectableCollectionAddIds.value)
}

const addSelectedToCollection = async () => {
  const collection = activeCollection.value
  const ids = Array.from(selectedCollectionAddIds.value)
  if (!collection || ids.length === 0) return

  await collectionAPI.addAnimeIds(collection.id, ids)
  await refreshCollections()
  setCollectionAddSelection([])
}

const removeSelectedFromCollection = async () => {
  const collection = activeCollection.value
  const ids = Array.from(selectedCollectionIds.value)
  if (!collection || ids.length === 0) return

  await collectionAPI.removeAnimeIds(collection.id, ids)
  await refreshCollections()
  setCollectionSelection([])
}

watch(
  () => uiState.homeFilter,
  () => {
    setTrashSelection([])
    clearCollectionModes()
  },
)

watch(
  () => uiState.customCollections.map((collection) => collection.id).join('|'),
  () => {
    if (uiState.homeFilter.startsWith('collection-') && !activeCollection.value) {
      uiState.homeFilter = 'all'
    }
  },
)

watch(
  () => uiState.libraryVersion,
  () => {
    void refreshAnimes()
  },
)

onMounted(async () => {
  await animeAPI.purgeExpiredTrash()
  await Promise.all([refreshAnimes(), refreshCollections()])
})
</script>

<template>
  <div class="home-view">
    <header class="page-header">
      <div class="header-actions">
        <template v-if="isTrashView">
          <span class="selection-summary">已选{{ selectedTrashCount }}</span>
          <button class="tool-btn" @click="toggleSelectAllTrash">
            <CheckSquare v-if="allTrashSelected" :size="16" />
            <Square v-else :size="16" />
            <span>{{ allTrashSelected ? '取消全选' : '全选' }}</span>
          </button>
          <button
            class="tool-btn"
            :disabled="selectedTrashCount === 0"
            @click="restoreSelectedTrash"
          >
            <RotateCcw :size="16" />
            <span>复原</span>
          </button>
          <button
            class="tool-btn danger"
            :disabled="selectedTrashCount === 0"
            @click="markSelectedTrashDeleted"
          >
            <Trash2 :size="16" />
            <span>删除</span>
          </button>
        </template>

        <template v-else-if="isCollectionAddMode && activeCollection">
          <span class="selection-summary">已选{{ selectedCollectionAddCount }}</span>
          <button class="tool-btn" @click="toggleSelectAllCollectionAdd">
            <CheckSquare v-if="allCollectionAddSelected" :size="16" />
            <Square v-else :size="16" />
            <span>{{ allCollectionAddSelected ? '取消全选' : '全选' }}</span>
          </button>
          <button
            class="tool-btn"
            :disabled="selectedCollectionAddCount === 0"
            @click="void addSelectedToCollection()"
          >
            <Plus :size="16" />
            <span>添加</span>
          </button>
          <button class="tool-btn" @click="cancelCollectionAddMode">
            <X :size="16" />
            <span>退出</span>
          </button>
        </template>

        <template v-else-if="isCustomCollectionView && activeCollection">
          <span v-if="isCollectionSelectionMode" class="selection-summary"
            >已选{{ selectedCollectionCount }}</span
          >
          <button
            v-if="isCollectionSelectionMode"
            class="tool-btn"
            @click="toggleSelectAllCollection"
          >
            <CheckSquare v-if="allCollectionSelected" :size="16" />
            <Square v-else :size="16" />
            <span>{{ allCollectionSelected ? '取消全选' : '全选' }}</span>
          </button>
          <button
            v-if="isCollectionSelectionMode"
            class="tool-btn danger"
            :disabled="selectedCollectionCount === 0"
            @click="void removeSelectedFromCollection()"
          >
            <Trash2 :size="16" />
            <span>移出合集</span>
          </button>
          <button
            v-if="isCollectionSelectionMode"
            class="tool-btn"
            @click="toggleCollectionSelectionMode"
          >
            <X :size="16" />
            <span>退出</span>
          </button>
          <template v-else>
            <button class="tool-btn" @click="beginCollectionAddMode">
              <Plus :size="16" />
              <span>添加</span>
            </button>
            <button class="tool-btn" @click="toggleCollectionSelectionMode">
              <Square :size="16" />
              <span>多选</span>
            </button>
          </template>
        </template>

        <button
          class="tool-btn"
          :class="{ active: uiState.isFilterBarOpen }"
          :disabled="isCustomCollectionView && isCollectionSelectionMode"
          @click="uiState.isFilterBarOpen = !uiState.isFilterBarOpen"
        >
          <Filter :size="16" />
          <span>筛选</span>
        </button>
        <button
          class="tool-btn"
          :disabled="isCustomCollectionView && isCollectionSelectionMode"
          @click="toggleSort"
        >
          <ArrowUpDown :size="16" />
          <span>{{ sortLabel }}</span>
        </button>
      </div>
    </header>

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
        :class="{
          selected: isCardSelected(item.id),
          'is-disabled': isCollectionAddMode && isItemAlreadyInCollection(item.id),
        }"
        @click="handleCardClick(item)"
      >
        <div class="card-image-wrap">
          <img :src="item.image" :alt="item.title" class="item-img" />

          <button
            v-if="
              !isTrashView &&
              !isCollectionAddMode &&
              !(isCustomCollectionView && isCollectionSelectionMode)
            "
            class="card-action-btn delete-card-btn"
            title="移入回收站"
            @click.stop="moveToTrash(item)"
          >
            <Trash2 :size="16" />
          </button>
          <button
            v-else-if="isTrashView"
            class="card-action-btn delete-card-btn"
            title="从回收站移除"
            @click.stop="markTrashDeleted(item)"
          >
            <Trash2 :size="16" />
          </button>

          <span
            v-if="isCollectionAddMode && isItemAlreadyInCollection(item.id)"
            class="card-status-badge"
          >
            已添加
          </span>

          <div class="persistent-label">
            <h3 class="label-title">{{ item.title }}</h3>
          </div>

          <div class="item-overlay">
            <div class="overlay-left">
              <h3 class="overlay-title">{{ item.title }}</h3>
              <div class="overlay-meta">
                <span>{{ item.year }}</span>
                <span class="meta-separator">·</span>
                <span>{{ item.tags[0] }}</span>
              </div>
            </div>
            <div class="overlay-right">
              <button
                v-if="
                  !isTrashView &&
                  !isCollectionAddMode &&
                  !(isCustomCollectionView && isCollectionSelectionMode)
                "
                class="play-btn-gradient"
                @click.stop="enterTheatre(item)"
              >
                <Play :size="18" fill="currentColor" />
              </button>
              <button
                v-else-if="isTrashView"
                class="restore-btn-gradient"
                @click.stop="restoreFromTrash(item)"
              >
                <RotateCcw :size="18" />
              </button>
            </div>
          </div>
        </div>
        <div v-if="isCardSelected(item.id)" class="selection-indicator"></div>
      </div>
    </div>

    <div v-if="filteredCollections.length === 0" class="empty-library">
      <p>{{ emptyText }}</p>
      <button
        v-if="activeCollection && !isCollectionAddMode"
        class="empty-action"
        @click="beginCollectionAddMode"
      >
        添加动画
      </button>
      <RouterLink v-else-if="!isTrashView" :to="{ name: 'import' }">前往导入</RouterLink>
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
  flex-wrap: wrap;
  gap: 24px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  color: var(--primary);
  opacity: 0.6;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  transition: opacity 0.3s ease;
}

.tool-btn:hover,
.tool-btn.active {
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
  margin-bottom: 32px;
  padding: 24px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  background-color: var(--surface-low);
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
  width: 40px;
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 700;
}

.filter-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.option-btn {
  padding: 6px 16px;
  border-radius: 99px;
  background-color: var(--surface);
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.option-btn:hover {
  background-color: var(--surface-dim);
}

.option-btn.active {
  background-color: var(--primary);
  color: white;
}

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

.bento-item.is-disabled {
  cursor: default;
}

.bento-item.is-disabled .card-image-wrap {
  opacity: 0.82;
}

.bento-item.is-disabled:hover .card-image-wrap {
  transform: none;
  box-shadow: var(--shadow-ambient);
}

.bento-item.is-disabled:hover .item-img {
  transform: none;
}

.card-image-wrap {
  position: relative;
  aspect-ratio: 1 / 1.4;
  overflow: hidden;
  border-radius: 12px;
  background-color: var(--surface-low);
  box-shadow: var(--shadow-ambient);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
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
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
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

.card-status-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 3;
  padding: 6px 10px;
  border-radius: 999px;
  background-color: rgba(12, 14, 18, 0.62);
  color: white;
  font-size: 12px;
  font-weight: 700;
  backdrop-filter: blur(10px);
}

.persistent-label {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
  transition: opacity 0.3s ease;
}

.bento-item:hover .persistent-label {
  opacity: 0;
}

.label-title {
  overflow: hidden;
  color: white;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.item-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 16px;
  opacity: 0;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.85) 0%,
    rgba(0, 0, 0, 0.2) 50%,
    transparent 100%
  );
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
  overflow: hidden;
  color: white;
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.play-btn-gradient,
.restore-btn-gradient {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: white;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.play-btn-gradient {
  background: linear-gradient(135deg, var(--primary), var(--primary-container));
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.4);
}

.restore-btn-gradient {
  background: linear-gradient(135deg, #2f8f64, #7fc6a3);
  box-shadow: 0 4px 12px rgba(47, 143, 100, 0.35);
}

.play-btn-gradient:hover,
.restore-btn-gradient:hover {
  transform: scale(1.1);
  filter: brightness(1.1);
}

.selection-indicator {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--primary);
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

.empty-library a,
.empty-action {
  color: var(--primary);
  font-weight: 700;
}
</style>
