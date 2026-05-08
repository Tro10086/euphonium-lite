<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { uiState } from '@/ui/stores/uiState'
import { X, Heart, Star, Play, Edit3 } from 'lucide-vue-next'
import type { Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import { animeAPI, episodeAPI, fileAPI } from '@/services/storage'
import BaseModal from '@/ui/components/BaseModal.vue'
import EpisodeFileMappingEditor from '@/ui/components/EpisodeFileMappingEditor.vue'
import { parseVideoFileName } from '@/utils/fileNameParser'

const emit = defineEmits(['close'])
const router = useRouter()

const isExpanded = ref(false)
const showExpandBtn = ref(false)
const descRef = ref<HTMLElement | null>(null)
const mappingModalOpen = ref(false)
const mappingEpisodes = ref<Episode[]>([])
const mappingFiles = ref<VideoFile[]>([])
const mappingOffset = ref(0)
const mappingStatus = ref('')
const isMappingLoading = ref(false)
const progressModalOpen = ref(false)
const progressEpisodes = ref<Episode[]>([])
const selectedProgressEpisodeId = ref('')
const progressStatus = ref('')
const isProgressLoading = ref(false)
const selectedMedia = computed(() => uiState.selectedMedia)
const progressStats = computed(() => {
  const item = selectedMedia.value
  if (!item) return { watched: 0, total: 0, percent: 0 }

  const total = item.episodes || item.episodesList?.length || 0
  const watched = Math.min(item.watchedEpisodes ?? 0, total)
  const percent = Math.min(100, Math.max(0, item.watchProgress ?? 0))
  return { watched, total, percent }
})

const checkTruncation = () => {
  nextTick(() => {
    if (descRef.value) {
      const el = descRef.value
      // When clamped to 2 lines, clientHeight is the height of 2 lines.
      // scrollHeight is the height of the entire content.
      // We add a 2px buffer to account for sub-pixel rendering/rounding issues.
      showExpandBtn.value = el.scrollHeight > el.clientHeight + 2
    }
  })
}

onMounted(() => {
  checkTruncation()
  window.addEventListener('resize', checkTruncation)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkTruncation)
})

watch(
  () => uiState.selectedMedia,
  () => {
    isExpanded.value = false
    mappingModalOpen.value = false
    progressModalOpen.value = false
    checkTruncation()
  },
)

const goToTheatre = () => {
  if (!uiState.selectedMedia) return
  const id = uiState.selectedMedia.id
  uiState.selectedMedia = null
  router.push({ name: 'theatre', params: { id } })
}

const toggleFavorite = async () => {
  if (!uiState.selectedMedia) return

  const nextValue = !uiState.selectedMedia.isFavorite
  await animeAPI.update(String(uiState.selectedMedia.id), { is_favorite: nextValue })
  uiState.selectedMedia = {
    ...uiState.selectedMedia,
    isFavorite: nextValue,
  }
  uiState.libraryVersion += 1
}

const mappingEpisodeOptions = computed(() =>
  mappingEpisodes.value.map((episode) => {
    const number = episode.sort ?? episode.ep
    return {
      episode: number,
      title: episode.name_cn || episode.name || `第 ${number} 集`,
    }
  }),
)

const progressEpisodeOptions = computed(() =>
  progressEpisodes.value.map((episode) => ({
    id: episode.id,
    label: `第 ${episode.ep} 集 ${episode.name_cn || episode.name || ''}`.trim(),
  })),
)

const selectedProgressEpisode = computed(
  () =>
    progressEpisodes.value.find((episode) => episode.id === selectedProgressEpisodeId.value) ??
    null,
)

const mappingRows = computed(() => {
  const episodeByFileId = new Map<string, Episode>()
  for (const episode of mappingEpisodes.value) {
    for (const fileId of episode.file_ids ?? []) episodeByFileId.set(fileId, episode)
  }

  return mappingFiles.value.map((file) => {
    const episode = episodeByFileId.get(file.id)
    const selectedEpisode = episode ? (episode.sort ?? episode.ep) : 0
    return {
      fileId: file.id,
      fileName: file.name,
      selectedEpisode,
      parsedEpisode: parseVideoFileName(file.name).episode || 0,
    }
  })
})

function episodeByNumber(value: number) {
  return mappingEpisodes.value.find(
    (episode) => (episode.sort ?? episode.ep) === value || episode.ep === value,
  )
}

function episodePercentage(episode: Episode) {
  if (episode.watched) return 100
  return Math.min(100, Math.max(0, episode.watch_percentage ?? 0))
}

function progressFromEpisodes(episodes: Episode[]) {
  const total =
    selectedMedia.value?.episodes || selectedMedia.value?.episodesList?.length || episodes.length
  if (total <= 0) return { watchedEpisodes: 0, watchProgress: 0 }

  let furthestIndex = -1
  let furthestPercentage = 0
  episodes.forEach((episode, index) => {
    const percentage = episodePercentage(episode)
    if (percentage <= 0) return
    if (index > furthestIndex || (index === furthestIndex && percentage > furthestPercentage)) {
      furthestIndex = index
      furthestPercentage = percentage
    }
  })

  if (furthestIndex < 0) return { watchedEpisodes: 0, watchProgress: 0 }

  const completedEpisodes = furthestIndex + (furthestPercentage >= 90 ? 1 : 0)
  const progressEpisodesValue = furthestIndex + furthestPercentage / 100
  return {
    watchedEpisodes: Math.min(total, completedEpisodes),
    watchProgress: Math.min(100, Math.round((progressEpisodesValue / total) * 100)),
  }
}

function furthestProgressEpisode(episodes: Episode[]) {
  let furthest: Episode | null = null
  let furthestIndex = -1
  episodes.forEach((episode, index) => {
    if (episodePercentage(episode) <= 0) return
    if (index > furthestIndex) {
      furthest = episode
      furthestIndex = index
    }
  })
  return furthest ?? episodes[0] ?? null
}

async function refreshEpisodeMapping() {
  if (!selectedMedia.value) return

  isMappingLoading.value = true
  try {
    const animeId = String(selectedMedia.value.id)
    const episodes = (await episodeAPI.getByAnimeId(animeId)).sort(
      (a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep),
    )
    const episodeFileIds = new Set(episodes.flatMap((episode) => episode.file_ids ?? []))
    const files = (await fileAPI.getAll())
      .filter((file) => file.anime_id === animeId || episodeFileIds.has(file.id))
      .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name))

    mappingEpisodes.value = episodes
    mappingFiles.value = Array.from(new Map(files.map((file) => [file.id, file])).values())
  } finally {
    isMappingLoading.value = false
  }
}

async function openEpisodeMapping() {
  mappingModalOpen.value = true
  mappingOffset.value = 0
  mappingStatus.value = ''
  await refreshEpisodeMapping()
}

async function openProgressEditor() {
  if (!selectedMedia.value) return

  progressModalOpen.value = true
  progressStatus.value = ''
  isProgressLoading.value = true
  try {
    progressEpisodes.value = (await episodeAPI.getByAnimeId(String(selectedMedia.value.id))).sort(
      (a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep),
    )
    const target = furthestProgressEpisode(progressEpisodes.value)
    selectedProgressEpisodeId.value = target?.id ?? ''
  } finally {
    isProgressLoading.value = false
  }
}

function closeProgressEditor() {
  progressModalOpen.value = false
  progressStatus.value = ''
}

async function saveManualProgress() {
  const item = selectedMedia.value
  const episode = selectedProgressEpisode.value
  if (!item || !episode) return

  const selectedIndex = progressEpisodes.value.findIndex((row) => row.id === episode.id)
  if (selectedIndex < 0) return

  const now = new Date()
  const updatedEpisodes = progressEpisodes.value.map((row, index) => {
    const isWatched = index <= selectedIndex
    const duration = Math.max(0, Math.floor(row.duration_seconds ?? 0))
    const position = isWatched ? duration || row.watch_progress || 1 : 0
    return {
      ...row,
      watch_progress: position,
      watch_percentage: isWatched ? 100 : 0,
      watched: isWatched,
      watched_at: isWatched ? (row.watched_at ?? now) : null,
      updated_at: now,
    }
  })

  await Promise.all(
    updatedEpisodes.map((row) =>
      episodeAPI.update(row.id, {
        watch_progress: row.watch_progress,
        watch_percentage: row.watch_percentage,
        watched: row.watched,
        watched_at: row.watched_at,
      }),
    ),
  )

  await animeAPI.update(String(item.id), {
    last_watched_episode: episode.ep,
    last_watched_position: updatedEpisodes[selectedIndex]?.watch_progress ?? 0,
    last_watched_at: now,
    status: 'watching',
  })

  progressEpisodes.value = updatedEpisodes

  const progress = progressFromEpisodes(progressEpisodes.value)
  uiState.selectedMedia = {
    ...item,
    watchedEpisodes: progress.watchedEpisodes,
    watchProgress: progress.watchProgress,
  }
  uiState.libraryVersion += 1
  progressStatus.value = '观看进度已更新'
}

function closeEpisodeMapping() {
  mappingModalOpen.value = false
  mappingStatus.value = ''
}

async function persistMappingRows(rows: Array<{ fileId: string; selectedEpisode: number }>) {
  if (!selectedMedia.value) return

  const animeId = String(selectedMedia.value.id)
  const fileById = new Map(mappingFiles.value.map((file) => [file.id, file]))
  const fileIdsByEpisodeId = new Map(
    mappingEpisodes.value.map((episode) => [episode.id, [] as string[]]),
  )

  for (const row of rows) {
    const targetEpisode = episodeByNumber(row.selectedEpisode)
    if (targetEpisode) fileIdsByEpisodeId.get(targetEpisode.id)?.push(row.fileId)
  }

  const filesToUpdate = rows
    .map((row): VideoFile | null => {
      const file = fileById.get(row.fileId)
      if (!file) return null
      const targetEpisode = episodeByNumber(row.selectedEpisode)
      return {
        ...file,
        anime_id: animeId,
        ep_id: targetEpisode?.id,
      }
    })
    .filter((file): file is VideoFile => Boolean(file))

  await Promise.all([
    ...mappingEpisodes.value.map((episode) =>
      episodeAPI.update(episode.id, { file_ids: fileIdsByEpisodeId.get(episode.id) ?? [] }),
    ),
    fileAPI.update(filesToUpdate),
  ])

  mappingStatus.value = '已保存剧集对应关系'
  uiState.libraryVersion += 1
  await refreshEpisodeMapping()
}

async function updateMappingFileEpisode(fileId: string, episode: number) {
  const rows = mappingRows.value.map((row) =>
    row.fileId === fileId ? { ...row, selectedEpisode: episode } : row,
  )
  await persistMappingRows(rows)
}

function adjustMappingOffset(delta: number) {
  mappingOffset.value = Number(mappingOffset.value ?? 0) + delta
}

async function applyMappingOffset() {
  const offset = Number(mappingOffset.value ?? 0)
  const rows = mappingRows.value.map((row) => ({
    ...row,
    selectedEpisode: row.selectedEpisode > 0 ? Math.max(0, row.selectedEpisode + offset) : 0,
  }))
  await persistMappingRows(rows)
}

async function resetEpisodeMapping() {
  const rows = mappingRows.value.map((row) => ({
    ...row,
    selectedEpisode: row.parsedEpisode || 0,
  }))
  mappingOffset.value = 0
  await persistMappingRows(rows)
}
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
          <button
            class="plain-heart-btn"
            :class="{ active: selectedMedia.isFavorite }"
            @click="toggleFavorite"
          >
            <Heart
              :size="22"
              :fill="selectedMedia.isFavorite ? '#c62828' : 'none'"
              :color="selectedMedia.isFavorite ? '#c62828' : 'currentColor'"
            />
          </button>
          <button class="plain-action-btn" title="修改集数对应关系" @click="openEpisodeMapping">
            <Edit3 :size="21" />
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
            <div class="progress-title-row">
              <span class="progress-label">观看进度</span>
              <button class="progress-edit-btn" title="修改观看进度" @click="openProgressEditor">
                <Edit3 :size="14" />
              </button>
            </div>
            <span class="progress-stats"
              >已观看 {{ progressStats.watched }} / {{ progressStats.total }} 集</span
            >
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progressStats.percent}%` }"></div>
          </div>
        </div>

        <!-- Description -->
        <div class="info-section">
          <h3 class="info-title">作品简介</h3>
          <p ref="descRef" class="description" :class="{ expanded: isExpanded }">
            {{ selectedMedia.desc }}
          </p>
          <button v-if="showExpandBtn" class="expand-btn" @click="isExpanded = !isExpanded">
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

    <BaseModal
      v-model="mappingModalOpen"
      title="修改集数对应关系"
      width="980px"
      :close-on-overlay="false"
      @close="closeEpisodeMapping"
    >
      <div v-if="isMappingLoading" class="mapping-empty">正在加载文件...</div>
      <div v-else-if="mappingRows.length === 0" class="mapping-empty">
        当前条目还没有可调整的本地文件。
      </div>
      <EpisodeFileMappingEditor
        v-else
        v-model:offset-value="mappingOffset"
        compact
        title="剧集匹配"
        description="修改会立即保存到本地库"
        :rows="mappingRows"
        :episode-options="mappingEpisodeOptions"
        @update-file-episode="updateMappingFileEpisode"
        @adjust-offset="adjustMappingOffset"
        @apply-offset="applyMappingOffset"
        @reset-mapping="resetEpisodeMapping"
      />
      <p v-if="mappingStatus" class="mapping-status">{{ mappingStatus }}</p>
      <template #footer>
        <button class="modal-close-btn" @click="closeEpisodeMapping">完成</button>
      </template>
    </BaseModal>

    <BaseModal
      v-model="progressModalOpen"
      title="修改观看进度"
      width="460px"
      :close-on-overlay="false"
      @close="closeProgressEditor"
    >
      <div v-if="isProgressLoading" class="mapping-empty">正在加载剧集...</div>
      <div v-else class="progress-editor-form">
        <label class="progress-field">
          <span>剧集</span>
          <select v-model="selectedProgressEpisodeId">
            <option v-for="episode in progressEpisodeOptions" :key="episode.id" :value="episode.id">
              {{ episode.label }}
            </option>
          </select>
        </label>
        <p class="progress-editor-hint">
          保存后会把所选剧集及之前视为已看完，后面的剧集进度会被清空。
        </p>
        <p v-if="progressStatus" class="mapping-status">{{ progressStatus }}</p>
      </div>
      <template #footer>
        <button class="dialog-cancel" @click="closeProgressEditor">取消</button>
        <button class="modal-close-btn" @click="saveManualProgress">保存</button>
      </template>
    </BaseModal>
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
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.header {
  height: 72px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;
  flex-shrink: 0;
}

.actions {
  display: flex;
  align-items: center;
  gap: 14px;
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

.plain-heart-btn,
.plain-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant);
  transition: all 0.3s ease;
}

.plain-heart-btn:hover,
.plain-action-btn:hover {
  transform: scale(1.1);
  color: var(--primary);
}

.mapping-empty {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 700;
}

.mapping-status {
  margin-top: 12px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
}

.modal-close-btn {
  padding: 10px 18px;
  border-radius: 10px;
  background-color: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 800;
}

.dialog-cancel {
  padding: 10px 18px;
  border-radius: 10px;
  background-color: var(--surface-low);
  color: var(--on-surface-variant);
  font-size: 14px;
  font-weight: 800;
}

.progress-editor-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--on-surface);
  font-size: 13px;
  font-weight: 800;
}

.progress-field select,
.progress-field input {
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background-color: var(--surface);
  color: var(--on-surface);
  font-size: 14px;
}

.progress-editor-hint {
  margin: 0;
  color: var(--on-surface-variant);
  font-size: 12px;
  line-height: 1.6;
}

:deep(.modal-body) {
  max-height: 70vh;
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

.dot,
.inner-dot {
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
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.progress-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-label {
  font-weight: 700;
}

.progress-edit-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 0;
  color: var(--primary);
  background-color: transparent;
  box-shadow: none;
}

.progress-edit-btn:hover {
  background-color: var(--primary-light);
}

.progress-stats {
  color: var(--primary);
}

.progress-bar {
  height: 8px;
  overflow: hidden;
  background-color: var(--surface-dim);
  border-radius: 999px;
}

.progress-fill {
  height: 100%;
  background-color: var(--primary);
  border-radius: inherit;
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
