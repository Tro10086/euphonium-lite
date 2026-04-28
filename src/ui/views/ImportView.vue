<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { FolderOpen, HardDrive, Edit2, Radar, FileJson, FileCode, Check, HelpCircle, Trash2 } from 'lucide-vue-next';
import BaseButton from '@/ui/components/BaseButton.vue';
import type { BangumiAnime } from '@/models/Bangumi';
import type { BangumiEpisode } from '@/models/Bangumi';
import type { VideoFile } from '@/models/File';
import type { LibraryRoot } from '@/models/Library';
import type { MatchRecord } from '@/models/Match';
import { getLibraryRoots, requestLibraryRoot, scanLibraryRoot } from '@/services/fileSystem';
import { claimMatchForImport, createMatch } from '@/services/match';
import { saveMatchResult } from '@/services/dataWriter';
import { fileAPI, matchAPI } from '@/services/storage';
import { getAnime, getEpisodes } from '@/services/bangumi';
import { parseVideoFileName } from '@/utils/fileNameParser';
import { formatImportResult, importBackupJsonFile, reloadAfterImport } from '@/ui/utils/backupTransfer';

// File handlers
const jsonInput = ref<HTMLInputElement | null>(null);
const roots = ref<LibraryRoot[]>([]);
const activeRoot = ref<LibraryRoot | null>(null);
const isBusy = ref(false);
const statusText = ref('');
const errorText = ref('');
const scanSummary = ref<{ added: number; updated: number; missing: number } | null>(null);
const matches = ref<MatchRecord[]>([]);
const candidateMap = reactive<Record<string, BangumiAnime[]>>({});
const selectedCandidateIds = reactive<Record<string, number>>({});
const episodePreviewMap = reactive<Record<string, BangumiEpisode[]>>({});
const fileMap = reactive<Record<string, VideoFile>>({});
const offsetInputs = reactive<Record<string, number>>({});
const confirmingKeys = reactive(new Set<string>());

const targetFolderPath = computed(() => activeRoot.value?.name ?? '尚未选择目录');
const reviewGroups = computed(() =>
  matches.value
    .filter((match) => match.status !== 'completed')
    .map((match) => {
      const key = match.folder_key ?? match.keyword;
      const candidates = candidateMap[key] ?? [];
      return {
        ...match,
        key,
        candidates,
        episodePreview: episodePreviewMap[key] ?? [],
        selectedId: selectedCandidateIds[key] ?? candidates[0]?.id ?? match.selected_anime_id,
        mappingRows: Object.entries(match.draft_mappings ?? {}),
        unmappedFileIds: match.unmapped_file_ids ?? [],
      };
    }),
);

const triggerJsonImport = () => jsonInput.value?.click();
const triggerFolderSelect = async () => {
  await runWithStatus('正在请求目录授权...', async () => {
    activeRoot.value = await requestLibraryRoot();
    roots.value = await getLibraryRoots();
  });
};

const onJsonFilePicked = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  await runWithStatus('正在导入 JSON 备份...', async () => {
    const result = await importBackupJsonFile(file);
    statusText.value = `${formatImportResult(result)}，即将刷新应用`;
    reloadAfterImport();
  });

  target.value = '';
};

async function runWithStatus(label: string, task: () => Promise<void>) {
  if (isBusy.value) return false;

  isBusy.value = true;
  statusText.value = label;
  errorText.value = '';
  try {
    await task();
    return true;
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    isBusy.value = false;
  }
}

async function refreshMatches() {
  matches.value = await matchAPI.getAll();
  for (const match of matches.value) {
    const key = match.folder_key ?? match.keyword;
    offsetInputs[key] ??= match.offset ?? 0;
  }
  await refreshFileCache(matches.value);
}

async function refreshFileCache(records: MatchRecord[]) {
  const fileIds = records.flatMap((match) => [
    ...Object.values(match.draft_mappings ?? {}).flat(),
    ...(match.unmapped_file_ids ?? []),
  ]);
  const uniqueFileIds = Array.from(new Set(fileIds));
  if (uniqueFileIds.length === 0) return;

  const files = await fileAPI.getByIds(uniqueFileIds);
  for (const file of files) fileMap[file.id] = file;
}

async function restoreMatchProgress(records: MatchRecord[]) {
  await Promise.all(
    records
      .filter((match) => match.status !== 'completed' && match.candidate_bangumi_ids?.length)
      .map(async (match) => {
        const key = match.folder_key ?? match.keyword;
        const ids = (match.candidate_bangumi_ids ?? []).slice(0, 4);
        const candidates = await Promise.all(
          ids.map(async (id) => {
            try {
              return await getAnime(id);
            } catch {
              return null;
            }
          }),
        );
        const restoredCandidates = candidates.filter((candidate): candidate is BangumiAnime => Boolean(candidate)).slice(0, 4);
        candidateMap[key] = restoredCandidates;
        const selectedId = match.selected_anime_id || restoredCandidates[0]?.id;
        if (selectedId) {
          selectedCandidateIds[key] = selectedId;
          await loadEpisodePreview(key, selectedId);
        }
      }),
  );
}

function findPreviewEpisode(episodes: BangumiEpisode[], epNum: string | number) {
  const num = Number(epNum);
  return episodes.find((episode) => episode.type === 0 && (Number(episode.sort) === num || Number(episode.ep) === num));
}

function selectedCandidate(item: { candidates: BangumiAnime[]; selectedId?: number }) {
  return item.candidates.find((candidate) => candidate.id === item.selectedId) ?? item.candidates[0];
}

function posterImage(item: { candidates: BangumiAnime[]; selectedId?: number }) {
  const candidate = selectedCandidate(item);
  return candidate?.images?.large ?? candidate?.images?.common ?? candidate?.images?.grid ?? '';
}

function fileName(fileId: string) {
  return fileMap[fileId]?.name ?? fileId;
}

function fileSortKey(fileId: string) {
  const file = fileMap[fileId];
  return file?.path ?? file?.name ?? fileId;
}

function episodeTitle(item: { episodePreview: BangumiEpisode[] }, epNum: number) {
  if (!epNum) return '未选择剧集';
  const episode = findPreviewEpisode(item.episodePreview, epNum);
  return episode?.name_cn || episode?.name || '';
}

function parsedEpisodeForFile(fileId: string) {
  const file = fileMap[fileId];
  if (!file) return 0;
  return parseVideoFileName(file.name).episode || 0;
}

function fileMatchRows(item: {
  draft_mappings: Record<number, string[]>;
  unmappedFileIds: string[];
}) {
  const mappedRows = Object.entries(item.draft_mappings ?? {}).flatMap(([ep, fileIds]) =>
    fileIds.map((fileId) => ({
      fileId,
      selectedEpisode: Number(ep),
      parsedEpisode: parsedEpisodeForFile(fileId) || Number(ep),
      fileName: fileName(fileId),
    })),
  );

  const unmappedRows = item.unmappedFileIds.map((fileId) => ({
    fileId,
    selectedEpisode: 0,
    parsedEpisode: parsedEpisodeForFile(fileId),
    fileName: fileName(fileId),
  }));

  return [...mappedRows, ...unmappedRows].sort((a, b) => fileSortKey(a.fileId).localeCompare(fileSortKey(b.fileId)));
}

function buildMappingsWithFileEpisode(match: MatchRecord, fileId: string, targetEp: number) {
  const mappings: Record<number, string[]> = {};
  for (const [ep, fileIds] of Object.entries(match.draft_mappings ?? {})) {
    const filtered = fileIds.filter((id) => id !== fileId);
    if (filtered.length) mappings[Number(ep)] = filtered;
  }

  const unmappedFileIds = (match.unmapped_file_ids ?? []).filter((id) => id !== fileId);
  if (targetEp > 0) mappings[targetEp] = Array.from(new Set([...(mappings[targetEp] ?? []), fileId]));
  else unmappedFileIds.push(fileId);

  return { mappings, unmappedFileIds: Array.from(new Set(unmappedFileIds)) };
}

async function updateFileEpisode(key: string, fileId: string, value: string | number) {
  const targetEp = Number(value);
  const match = matches.value.find((item) => (item.folder_key ?? item.keyword) === key);
  if (!match) return;

  const { mappings, unmappedFileIds } = buildMappingsWithFileEpisode(match, fileId, targetEp);

  await matchAPI.update(key, {
    draft_mappings: mappings,
    unmapped_file_ids: unmappedFileIds,
  });

  await refreshMatches();
}

function onEpisodeSelect(key: string, fileId: string, event: Event) {
  const target = event.target as HTMLInputElement;
  void updateFileEpisode(key, fileId, target.value);
}

async function applyEpisodeOffset(key: string) {
  const match = matches.value.find((item) => (item.folder_key ?? item.keyword) === key);
  if (!match) return;

  const offset = Number(offsetInputs[key] ?? 0);
  const mappings: Record<number, string[]> = {};
  const unmappedFileIds = [...(match.unmapped_file_ids ?? [])];

  for (const [ep, fileIds] of Object.entries(match.draft_mappings ?? {})) {
    const nextEp = Number(ep) + offset;
    if (nextEp > 0) mappings[nextEp] = [...(mappings[nextEp] ?? []), ...fileIds];
    else unmappedFileIds.push(...fileIds);
  }

  await matchAPI.update(key, {
    draft_mappings: mappings,
    unmapped_file_ids: Array.from(new Set(unmappedFileIds)),
    offset,
  });
  await refreshMatches();
}

function adjustOffset(key: string, delta: number) {
  offsetInputs[key] = Number(offsetInputs[key] ?? 0) + delta;
}

async function resetEpisodeMapping(key: string) {
  const match = matches.value.find((item) => (item.folder_key ?? item.keyword) === key);
  if (!match) return;

  const fileIds = Array.from(new Set([
    ...Object.values(match.draft_mappings ?? {}).flat(),
    ...(match.unmapped_file_ids ?? []),
  ]));
  const mappings: Record<number, string[]> = {};
  const unmappedFileIds: string[] = [];

  for (const fileId of fileIds) {
    const parsedEp = parsedEpisodeForFile(fileId);
    if (parsedEp > 0) mappings[parsedEp] = [...(mappings[parsedEp] ?? []), fileId];
    else unmappedFileIds.push(fileId);
  }

  offsetInputs[key] = 0;
  await matchAPI.update(key, {
    draft_mappings: mappings,
    unmapped_file_ids: unmappedFileIds,
    offset: 0,
  });
  await refreshMatches();
}

async function loadEpisodePreview(key: string, bangumiId: number) {
  if (!bangumiId) return;
  episodePreviewMap[key] = await getEpisodes(bangumiId);
}

const selectCandidate = (key: string, bangumiId: number) => {
  selectedCandidateIds[key] = bangumiId;
  void loadEpisodePreview(key, bangumiId);
};

const startScan = async () => {
  await runWithStatus('正在扫描目录并匹配 Bangumi...', async () => {
    if (!activeRoot.value) {
      activeRoot.value = await requestLibraryRoot();
      roots.value = await getLibraryRoots();
    }

    const result = await scanLibraryRoot(activeRoot.value);
    scanSummary.value = {
      added: result.added,
      updated: result.updated,
      missing: result.missing,
    };

    const candidates = await createMatch();
    for (const [key, values] of candidates.entries()) {
      const topValues = values.slice(0, 4);
      candidateMap[key] = topValues;
      if (topValues[0]) {
        selectedCandidateIds[key] = topValues[0].id;
        await loadEpisodePreview(key, topValues[0].id);
      }
    }

    await refreshMatches();
    statusText.value = '扫描完成，请确认匹配结果';
  });
};

const confirmAll = () => {
  runWithStatus('正在写入全部已选匹配...', async () => {
    for (const group of reviewGroups.value) {
      if (!group.selectedId) continue;
      await confirmGroup(group.key, group.selectedId, false);
    }
    await refreshMatches();
  });
};

const isConfirming = (key: string) => confirmingKeys.has(key);

const confirmGroup = async (key: string, bangumiId: number, refreshAfter = true) => {
  if (!bangumiId || confirmingKeys.has(key)) return;

  confirmingKeys.add(key);
  const claimed = await claimMatchForImport(key, bangumiId);
  if (!claimed) {
    confirmingKeys.delete(key);
    if (refreshAfter) await refreshMatches();
    return;
  }

  try {
    await saveMatchResult(key);
  } catch (error) {
    await matchAPI.update(key, { status: 'idle' });
    throw error;
  } finally {
    confirmingKeys.delete(key);
  }
};

const confirmOne = (key: string, bangumiId: number) => {
  runWithStatus('正在写入匹配结果...', async () => {
    await confirmGroup(key, bangumiId);
    await refreshMatches();
  });
};

const removeItem = (key: string) => {
  runWithStatus('正在跳过该目录...', async () => {
    await matchAPI.delete(key);
    await refreshMatches();
  });
};

onMounted(async () => {
  roots.value = await getLibraryRoots();
  activeRoot.value = roots.value[0] ?? null;
  await refreshMatches();
  await restoreMatchProgress(matches.value);
});
</script>

<template>
  <div class="import-view">
    <!-- Hidden Inputs -->
    <input type="file" ref="jsonInput" accept=".json" class="hidden" @change="onJsonFilePicked" />

    <div class="import-layout">
      <!-- Left Column -->
      <div class="action-sidebar">
        <header class="column-header">
          <div class="header-inline">
            <h1 class="title">导入媒体</h1>
            <p class="subtitle">整理您的本地数字作品</p>
          </div>
        </header>

        <section class="action-card">
          <div class="card-bloom"></div>
          <div class="card-header-row">
            <h3 class="card-title">
              <FolderOpen :size="20" />
              <span>目标文件夹</span>
            </h3>
            <button class="json-mini-btn" title="导入 JSON" @click="triggerJsonImport">
              <FileJson :size="16" />
              <span>导入 JSON</span>
            </button>
          </div>
          
          <div class="path-display">
            <HardDrive :size="16" class="icon-muted" />
            <code class="path-text">{{ targetFolderPath }}</code>
            <button class="edit-btn" @click="triggerFolderSelect">
              <Edit2 :size="14" />
            </button>
          </div>

          <BaseButton full-width size="lg" :disabled="isBusy" @click="startScan">
            <template #icon><Radar :size="20" /></template>
            <span>{{ isBusy ? '处理中...' : '开始扫描' }}</span>
          </BaseButton>
        </section>

        <section class="scan-info">
          <p class="info-text">Euphonium 会按目录聚合本地视频，自动生成 Bangumi 候选，并在确认后写入本地库。</p>
          <p v-if="scanSummary" class="info-text">
            新增 {{ scanSummary.added }}，更新 {{ scanSummary.updated }}，缺失 {{ scanSummary.missing }}
          </p>
          <p v-if="statusText" class="info-text">{{ statusText }}</p>
          <p v-if="errorText" class="error-text">{{ errorText }}</p>
        </section>
      </div>

      <!-- Right Column -->
      <div class="results-column">
        <header class="column-header split">
          <div class="flex-row gap-16 baseline">
            <h3 class="results-title">扫描结果</h3>
            <span v-if="reviewGroups.length > 0" class="results-count">
              找到 {{ reviewGroups.length }} 个待确认目录
            </span>
          </div>
          <BaseButton :disabled="isBusy" @click="confirmAll">
            <template #icon><Check :size="16" /></template>
            <span>{{ isBusy ? '处理中...' : '一键确认' }}</span>
          </BaseButton>
        </header>

        <div v-if="reviewGroups.length > 0" class="results-list">
          <div v-for="item in reviewGroups" :key="item.key" class="result-card" :class="item.candidates.length ? 'matched' : 'unmatched'">
            <!-- Matched Item -->
            <template v-if="item.candidates.length">
              <div v-if="posterImage(item)" class="poster-backdrop" aria-hidden="true">
                <img :src="posterImage(item)" alt="" />
              </div>
              <div class="item-content">
                <div class="item-header">
                  <h4 class="item-name">文件夹名称：{{ item.folder_name || item.name }}</h4>
                  <button class="btn-delete" @click="removeItem(item.key)">
                    <Trash2 :size="18" />
                  </button>
                </div>

                <div class="parse-debug">
                  <span>提取 title：{{ item.name }}</span>
                  <span v-if="item.search_keyword">搜索词：{{ item.search_keyword }}</span>
                  <span>季：{{ item.season }}</span>
                </div>
                <p v-if="item.warnings?.length" class="parse-warning">{{ item.warnings.join('；') }}</p>

                <div class="options-grid">
                  <label v-for="candidate in item.candidates.slice(0, 4)" :key="candidate.id" class="option-label">
                    <input
                      v-model="selectedCandidateIds[item.key]"
                      type="radio"
                      :name="item.key"
                      class="radio-input"
                      :value="candidate.id"
                      @change="selectCandidate(item.key, candidate.id)"
                    />
                    <span>{{ candidate.name_cn || candidate.name }}</span>
                  </label>
                </div>

                <div class="file-mapping-card">
                  <div class="mapping-card-header">
                    <span>剧集匹配</span>
                    <small>按文件选择目标集数，剧集名称会随选择更新</small>
                  </div>

                  <div class="offset-tools">
                    <span class="offset-label">批量偏移</span>
                    <button class="offset-btn" @click="adjustOffset(item.key, -1)">-1</button>
                    <input
                      v-model.number="offsetInputs[item.key]"
                      class="offset-input"
                      type="number"
                      step="1"
                    />
                    <button class="offset-btn" @click="adjustOffset(item.key, 1)">+1</button>
                    <button class="offset-apply" @click="applyEpisodeOffset(item.key)">应用</button>
                    <button class="offset-reset" @click="resetEpisodeMapping(item.key)">重置解析</button>
                  </div>

                  <div class="file-match-list">
                    <div class="file-match-row header">
                      <span>文件</span>
                      <span>解析</span>
                      <span>选择集数</span>
                      <span>剧集名称</span>
                    </div>
                    <div
                      v-for="row in fileMatchRows(item)"
                      :key="row.fileId"
                      class="file-match-row"
                    >
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
                        @change="onEpisodeSelect(item.key, row.fileId, $event)"
                        @keyup.enter="onEpisodeSelect(item.key, row.fileId, $event)"
                      />
                      <div class="episode-title-inline">
                        <span :title="episodeTitle(item, row.selectedEpisode)">
                          {{ episodeTitle(item, row.selectedEpisode) || '未选择剧集' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="item-footer">
                  <BaseButton
                    :disabled="isBusy || isConfirming(item.key)"
                    @click="confirmOne(item.key, selectedCandidateIds[item.key] ?? item.selectedId)"
                  >
                    {{ isConfirming(item.key) ? '写入中...' : '确认' }}
                  </BaseButton>
                </div>
              </div>
            </template>

            <!-- Unmatched -->
            <template v-else>
              <div class="item-content full">
                <div class="item-header">
                  <div class="flex-row gap-16">
                    <div class="error-icon">
                      <HelpCircle :size="20" />
                    </div>
                    <div>
                      <h4 class="item-name">文件夹名称：{{ item.folder_name || item.keyword }}</h4>
                      <p class="error-text">未匹配</p>
                    </div>
                  </div>
                  <button class="btn-delete" @click="removeItem(item.key)">
                    <Trash2 :size="18" />
                  </button>
                </div>
                <div class="parse-debug">
                  <span>提取 title：{{ item.name }}</span>
                  <span v-if="item.search_keyword">搜索词：{{ item.search_keyword }}</span>
                  <span>季：{{ item.season }}</span>
                </div>
                <p v-if="item.warnings?.length" class="parse-warning">{{ item.warnings.join('；') }}</p>
                <div class="item-footer">
                  <BaseButton variant="ghost">手动关联</BaseButton>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="results-placeholder-container">
          <div v-for="i in 3" :key="i" class="placeholder-card">
            <div class="ph-thumb"></div>
            <div class="ph-content">
              <div class="ph-line-title"></div>
              <div class="ph-line-text"></div>
              <div class="ph-line-text short"></div>
            </div>
          </div>
          <div class="empty-results">
            <div class="empty-icon">
              <Radar :size="48" />
            </div>
            <p class="empty-text">暂无扫描结果</p>
            <p class="empty-hint">请点击左侧的“开始扫描”来搜索文件夹中的媒体文件。</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hidden {
  display: none;
}

.baseline {
  align-items: baseline !important;
}

.import-view {
  height: calc(100vh - 60px);
  overflow-y: auto;
  background-color: var(--background);
}

.import-layout {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 32px;
  padding: 24px 48px;
  max-width: 1400px;
  margin: 0 auto;
}

.action-sidebar,
.results-column {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.column-header {
  height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 8px;
}

.header-inline {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.column-header.split {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
}

.title {
  font-size: 32px;
  font-weight: 700;
  color: var(--on-surface);
  line-height: 1.1;
  white-space: nowrap;
}

.subtitle {
  font-size: 14px;
  color: var(--on-surface-variant);
  opacity: 0.8;
  white-space: nowrap;
}

.action-card {
  background-color: var(--surface);
  border: 1px solid rgba(0, 0, 0, 0.03);
  border-radius: 24px;
  padding: 32px;
  box-shadow: var(--shadow-soft);
  position: relative;
  overflow: hidden;
  height: fit-content;
}

.card-bloom {
  position: absolute;
  top: -64px;
  right: -64px;
  width: 150px;
  height: 150px;
  background-color: rgba(197, 160, 89, 0.1);
  border-radius: 50%;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.json-mini-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: transparent;
  border: 1px solid rgba(197, 160, 89, 0.2);
  border-radius: 12px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.json-mini-btn:hover {
  background-color: white;
  border-color: var(--primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(119, 90, 25, 0.1);
}

.path-display {
  background-color: var(--surface-low);
  padding: 16px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}

.path-text {
  font-family: monospace;
  font-size: 13px;
  color: var(--on-surface-variant);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-info {
  background-color: var(--surface-low);
  padding: 24px;
  border-radius: 20px;
  border: 1px dashed rgba(0, 0, 0, 0.05);
}

.info-text {
  font-size: 13px;
  color: var(--on-surface-variant);
  line-height: 1.6;
}

/* Results Column */
.results-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
  line-height: 1;
}

.results-count {
  font-size: 14px;
  color: var(--primary);
  font-weight: 700;
  line-height: 1;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.result-card {
  background-color: var(--surface);
  border-radius: 20px;
  padding: 24px 24px 24px 172px;
  box-shadow: var(--shadow-soft);
  display: block;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 1px solid rgba(0, 0, 0, 0.04);
  position: relative;
  min-height: 220px;
  overflow: hidden;
}

.result-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-soft);
}

.result-card.unmatched {
  border-left: 4px solid var(--error);
  padding-left: 24px;
}

.poster-backdrop {
  position: absolute;
  inset: 0 auto 0 0;
  width: 300px;
  pointer-events: none;
  opacity: 0.42;
}

.poster-backdrop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-backdrop::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, var(--surface) 88%);
}

.item-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.item-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.parse-debug {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -4px 0 16px;
}

.parse-debug span {
  padding: 4px 8px;
  border-radius: 8px;
  background-color: var(--surface-low);
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 600;
}

.parse-warning {
  margin: -8px 0 16px;
  color: var(--error);
  font-size: 12px;
  line-height: 1.5;
}

.btn-delete {
  color: #a0a0a0;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.btn-delete:hover {
  color: var(--error);
  background-color: var(--error-container);
}

.file-mapping-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--outline-variant);
  border-radius: 16px;
  background-color: color-mix(in srgb, var(--surface) 86%, transparent);
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
  background-color: var(--primary);
  color: white;
}

.offset-reset {
  color: var(--on-surface-variant);
}

.offset-input,
.episode-number-input {
  width: 64px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid var(--outline-variant);
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
  grid-template-columns: minmax(360px, 1.8fr) 46px 58px minmax(180px, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface);
  font-size: 13px;
}

.file-match-row.header {
  border-color: transparent;
  background-color: transparent;
  padding-top: 0;
  padding-bottom: 0;
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
}

.episode-title-inline {
  min-width: 0;
  display: flex;
  align-items: center;
  min-height: 32px;
}

.episode-title-inline span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--on-surface);
  font-weight: 700;
}

.item-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
}

/* Placeholder Styling */
.results-placeholder-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
}

.placeholder-card {
  background-color: var(--surface);
  opacity: 0.15;
  border-radius: 20px;
  padding: 24px;
  display: flex;
  gap: 24px;
  filter: blur(2px);
}

.ph-thumb {
  width: 96px;
  height: 128px;
  background-color: var(--surface-low);
  border-radius: 12px;
}

.ph-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ph-line-title {
  height: 24px;
  width: 200px;
  background-color: var(--surface-low);
  border-radius: 4px;
}

.ph-line-text {
  height: 14px;
  width: 100%;
  background-color: var(--surface-low);
  border-radius: 4px;
}

.ph-line-text.short {
  width: 60%;
}

.empty-results {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 400px;
  text-align: center;
  z-index: 10;
}

.empty-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--surface);
  color: var(--primary);
  border-radius: 50%;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

.empty-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--on-surface-variant);
  line-height: 1.6;
}

.icon-muted { opacity: 0.5; }
.icon-primary { color: var(--primary); }
.icon-tertiary { color: #8e44ad; }
.edit-btn { color: var(--primary); }
.item-content.full { width: 100%; }
.badge-status { background-color: var(--surface-low); padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
.options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 16px; }
.option-label { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--outline-variant); border-radius: 12px; cursor: pointer; font-size: 14px; }
.text-link { color: var(--primary); font-weight: 600; font-size: 13px; text-transform: uppercase; }
.flex-row { display: flex; align-items: center; gap: 12px; }
.gap-16 { gap: 16px; }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.error-icon { width: 44px; height: 44px; background-color: var(--error-container); color: var(--error); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.error-text { color: var(--error); font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; }
</style>
