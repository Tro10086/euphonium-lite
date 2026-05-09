<script setup lang="ts">
import { FileCode } from 'lucide-vue-next'

interface EpisodeMappingRow {
  fileId: string
  fileName: string
  selectedEpisode: number
  parsedEpisode: number
}

interface EpisodeOption {
  episode: number
  title: string
}

const props = withDefaults(
  defineProps<{
    rows: EpisodeMappingRow[]
    episodeOptions: EpisodeOption[]
    offsetValue: number
    title?: string
    description?: string
    compact?: boolean
  }>(),
  {
    title: '剧集匹配',
    description: '按文件选择目标集数，剧集名称会随选择更新',
    compact: false,
  },
)

const emit = defineEmits<{
  'update:offsetValue': [value: number]
  updateFileEpisode: [fileId: string, episode: number]
  moveFileToExtra: [fileId: string]
  adjustOffset: [delta: number]
  applyOffset: []
  resetMapping: []
}>()

function episodeTitle(epNum: number) {
  if (!epNum) return ''
  return props.episodeOptions.find((episode) => episode.episode === epNum)?.title ?? ''
}

function onEpisodeSelect(fileId: string, event: Event) {
  const target = event.target as HTMLInputElement
  emit('updateFileEpisode', fileId, Number(target.value))
}

function onOffsetInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:offsetValue', Number(target.value))
}
</script>

<template>
  <div class="file-mapping-card" :class="{ compact }">
    <div class="file-mapping-scroll">
      <div class="mapping-card-header">
        <span>{{ title }}</span>
        <small>{{ description }}</small>
      </div>

      <div class="offset-tools">
        <span class="offset-label">批量偏移</span>
        <button class="offset-btn" @click="emit('adjustOffset', -1)">-1</button>
        <input
          class="offset-input"
          type="number"
          step="1"
          :value="offsetValue"
          @input="onOffsetInput"
        />
        <button class="offset-btn" @click="emit('adjustOffset', 1)">+1</button>
        <button class="offset-apply" @click="emit('applyOffset')">应用</button>
        <button class="offset-reset" @click="emit('resetMapping')">重置解析</button>
      </div>

      <div class="file-match-list">
        <div class="file-match-row header">
          <span>文件</span>
          <span>解析</span>
          <span>选择集数</span>
          <span>剧集名称</span>
          <span>类型</span>
        </div>
        <div v-for="row in rows" :key="row.fileId" class="file-match-row">
          <div class="file-name-cell" :title="row.fileName">
            <FileCode :size="14" />
            <span :title="row.fileName">{{ row.fileName }}</span>
          </div>
          <span class="parsed-episode">
            {{ row.parsedEpisode ? `第 ${row.parsedEpisode} 集` : '未解析' }}
          </span>
          <input
            class="episode-number-input"
            type="number"
            min="0"
            step="1"
            :value="row.selectedEpisode"
            @change="onEpisodeSelect(row.fileId, $event)"
            @keyup.enter="onEpisodeSelect(row.fileId, $event)"
          />
          <div class="episode-title-inline">
            <span :title="episodeTitle(row.selectedEpisode)">
              {{ episodeTitle(row.selectedEpisode) || '未选择剧集' }}
            </span>
          </div>
          <button class="mapping-kind-btn" @click="emit('moveFileToExtra', row.fileId)">
            设为附加
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-mapping-card {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
  padding: 16px;
  overflow-x: auto;
  border: 1px solid var(--outline-variant);
  border-radius: 16px;
  background-color: color-mix(in srgb, var(--surface) 86%, transparent);
}

.file-mapping-scroll {
  min-width: 1040px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-mapping-card.compact {
  max-height: min(64vh, 620px);
  margin-bottom: 0;
}

.file-mapping-card.compact .file-mapping-scroll {
  min-width: 880px;
}

.mapping-card-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--on-surface);
  font-size: 13px;
  font-weight: 800;
}

.mapping-card-header small {
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 500;
}

.offset-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background-color: var(--surface-low);
}

.offset-label {
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 800;
}

.offset-btn,
.offset-apply,
.offset-reset {
  padding: 6px 10px;
  border-radius: 10px;
  background-color: var(--surface);
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
}

.offset-apply {
  color: white;
  background-color: var(--primary);
}

.offset-reset {
  color: var(--on-surface-variant);
}

.offset-input,
.episode-number-input {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background-color: var(--surface);
  color: var(--on-surface);
  font-size: 12px;
  font-weight: 700;
}

.episode-number-input {
  width: 100%;
  min-height: 32px;
  background-color: var(--surface-low);
  font-size: 13px;
}

.file-match-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-match-row {
  display: grid;
  grid-template-columns: minmax(500px, 2.6fr) minmax(72px, max-content) 72px minmax(160px, 0.9fr) 92px;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface);
  font-size: 13px;
}

.file-mapping-card.compact .file-match-row {
  grid-template-columns: minmax(340px, 2fr) minmax(72px, max-content) 72px minmax(140px, 1fr) 92px;
}

.file-match-row.header {
  padding-top: 0;
  padding-bottom: 0;
  border-color: transparent;
  background-color: transparent;
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 800;
}

.file-name-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--on-surface-variant);
}

.file-name-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parsed-episode {
  color: var(--on-surface-variant);
  font-weight: 700;
  white-space: nowrap;
}

.episode-title-inline {
  min-width: 0;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.episode-title-inline span {
  min-width: 0;
  overflow: hidden;
  color: var(--on-surface);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mapping-kind-btn {
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background-color: var(--surface-low);
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.mapping-kind-btn:hover {
  border-color: var(--primary-container);
  color: var(--primary);
  background-color: var(--primary-light);
}

@media (max-width: 760px) {
  .mapping-card-header {
    flex-direction: column;
  }
}
</style>
