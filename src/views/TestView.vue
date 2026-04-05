<template>
  <div class="test-container">
    <h1>🎬 Euphonium 流程测试页面</h1>

    <!-- 全局操作 -->
    <div class="global-actions">
      <button @click="clearAllData" class="btn-danger">🗑️ 清空所有数据</button>
      <button @click="loadAllData" class="btn-secondary">🔄 刷新数据</button>
    </div>

    <!-- 步骤导航 -->
    <div class="steps-nav">
      <div
        v-for="(step, index) in steps"
        :key="step.key"
        :class="['step-item', { active: currentStep === index, completed: currentStep > index }]"
        @click="currentStep = index"
      >
        <span class="step-num">{{ index + 1 }}</span>
        <span class="step-name">{{ step.name }}</span>
      </div>
    </div>

    <!-- 步骤1: 扫描目录 -->
    <div v-show="currentStep === 0" class="step-content">
      <div class="card">
        <h2>📁 扫描视频文件</h2>
        <button @click="selectDirectory" :disabled="isScanning" class="btn-primary">
          {{ isScanning ? '扫描中...' : '选择文件夹' }}
        </button>
        <div v-if="scanResult" class="result-box">
          <p>
            新增: <strong>{{ scanResult.added }}</strong> | 更新:
            <strong>{{ scanResult.updated }}</strong> | 删除:
            <strong>{{ scanResult.deleted }}</strong>
          </p>
        </div>
        <p class="hint">支持格式: mp4, mkv, avi, mov, wmv, flv, webm</p>
      </div>

      <div class="card" v-if="files.length > 0">
        <h3>已扫描文件 ({{ files.length }})</h3>
        <div class="file-list">
          <div v-for="file in files" :key="file.id" class="file-item">
            <div class="file-info">
              <span class="file-name">{{ file.name }}</span>
              <span v-if="file.ep_id" class="file-linked">✓ 已关联</span>
            </div>
            <span class="file-meta"
              >{{ formatFileSize(file.size) }} | {{ file.quickHash.slice(0, 8) }}</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- 步骤2: 匹配搜索 -->
    <div v-show="currentStep === 1" class="step-content">
      <div class="card">
        <h2>🔍 创建匹配任务</h2>
        <button
          @click="createMatch"
          :disabled="isMatching || files.length === 0"
          class="btn-primary"
        >
          {{ isMatching ? '搜索中...' : '开始匹配搜索' }}
        </button>
        <p class="hint">
          将根据文件名解析出标题和集数，搜索 Bangumi 数据
          <br />
          <small>已创建 {{ matchRecords.length }} 个匹配记录</small>
        </p>
      </div>

      <div v-if="matchGroups.length > 0" class="card">
        <div class="match-header-bar">
          <h3>匹配组 ({{ matchGroups.length }})</h3>
          <button @click="resumeUncompleted" class="btn-small">恢复未完成</button>
        </div>

        <div class="match-list">
          <div
            v-for="group in matchGroups"
            :key="group.keyword"
            :class="[
              'match-item',
              {
                resolved: group.status === 'completed',
                selected: group.status === 'selected' || group.status === 'mapping',
              },
            ]"
          >
            <div class="match-header">
              <div class="match-title">
                <span class="keyword">{{ group.keyword }}</span>
                <span class="badge" :class="getStatusClass(group.status)">{{ group.status }}</span>
              </div>
              <div class="match-actions">
                <span class="match-files">{{ getFileCount(group) }} 个文件</span>
                <button
                  v-if="group.status === 'completed'"
                  @click="saveSingleMatch(group.keyword)"
                  class="btn-small btn-success"
                  :disabled="isSaving"
                >
                  保存
                </button>
              </div>
            </div>

            <!-- 候选列表 -->
            <div
              v-if="group.candidates.length > 0 && group.status !== 'completed'"
              class="candidates"
            >
              <div class="section-title">选择匹配的动画:</div>
              <div
                v-for="anime in group.candidates"
                :key="anime.id"
                :class="['candidate-item', { selected: group.selectedAnimeId === anime.id }]"
                @click="selectAnime(group.keyword, anime.id)"
              >
                <img v-if="anime.image" :src="anime.image" class="anime-cover" loading="lazy" />
                <div class="anime-info">
                  <div class="anime-name">{{ anime.name_cn || anime.name }}</div>
                  <div class="anime-meta">
                    评分: {{ anime.rating?.score || 'N/A' }} | 集数: {{ anime.eps }} | 日期:
                    {{ anime.date || '未知' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- 已选择但未完成 -->
            <div
              v-else-if="group.status === 'selected' || group.status === 'mapping'"
              class="selected-info"
            >
              <div class="section-title">已选择:</div>
              <div class="selected-anime">
                {{ getSelectedAnimeName(group) }}
              </div>
              <button @click="showMapping(group.keyword)" class="btn-secondary">
                配置集数映射
              </button>
            </div>

            <!-- 映射配置区域 -->
            <div v-if="showMappingFor === group.keyword" class="mapping-section">
              <h4>集数映射配置</h4>
              <div class="mapping-hint">文件已按集数分组，确认映射关系后点击完成</div>
              <div class="mapping-list">
                <div v-for="(fileIds, epNum) in group.files" :key="epNum" class="mapping-row">
                  <span class="ep-num">第 {{ epNum }} 集</span>
                  <span class="file-detail">{{ fileIds.length }} 个文件</span>
                  <div class="file-names">
                    <small v-for="fid in fileIds" :key="fid">
                      {{ getFileName(fid) }}
                    </small>
                  </div>
                </div>
              </div>
              <div class="mapping-actions">
                <button @click="confirmMapping(group.keyword)" class="btn-primary">
                  ✓ 确认并完成
                </button>
                <button @click="showMappingFor = null" class="btn-text">取消</button>
              </div>
            </div>

            <!-- 已完成但未保存 -->
            <div v-if="group.status === 'completed'" class="completed-badge">
              ✓ 匹配完成，等待保存到数据库
            </div>
          </div>
        </div>
      </div>

      <!-- 批量保存 -->
      <div v-if="completedGroups.length > 0" class="card">
        <h3>批量操作</h3>
        <p>有 {{ completedGroups.length }} 个已完成匹配的组等待保存</p>
        <button @click="saveAllMatches" class="btn-primary" :disabled="isSaving">
          {{ isSaving ? '保存中...' : '全部保存到数据库' }}
        </button>
      </div>
    </div>

    <!-- 步骤3: 数据查看 -->
    <div v-show="currentStep === 2" class="step-content">
      <div class="card">
        <h2>💾 数据库状态</h2>
        <div class="db-stats">
          <div class="stat-item">
            <span class="stat-label">Anime</span>
            <span class="stat-value">{{ animeList.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Episodes</span>
            <span class="stat-value">{{ episodes.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Files</span>
            <span class="stat-value">{{ files.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Match Records</span>
            <span class="stat-value">{{ matchRecords.length }}</span>
          </div>
        </div>
      </div>

      <!-- Anime 列表 -->
      <div class="card" v-if="animeList.length > 0">
        <h3>Anime 列表</h3>
        <div class="anime-list">
          <div v-for="anime in animeList" :key="anime.id" class="anime-row">
            <img v-if="anime.cover" :src="anime.cover" class="anime-thumb" loading="lazy" />
            <div class="anime-detail">
              <div class="anime-title">{{ anime.name_cn }}</div>
              <div class="anime-subtitle">{{ anime.name }}</div>
              <div class="anime-tags">
                <span class="tag">{{ anime.status }}</span>
                <span class="tag">评分: {{ anime.rating || '未评' }}</span>
                <span class="tag">Bangumi: {{ anime.bangumi_score || 'N/A' }}</span>
              </div>
            </div>
            <div class="anime-actions">
              <button @click="viewEpisodes(anime.id)" class="btn-small">
                查看剧集 ({{ getEpisodeCount(anime.id) }})
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Episode 详情 -->
      <div class="card" v-if="selectedAnimeEpisodes.length > 0">
        <h3>剧集详情</h3>
        <div class="episode-list">
          <div v-for="ep in selectedAnimeEpisodes" :key="ep.id" class="episode-row">
            <span class="ep-number">EP{{ ep.ep }}</span>
            <span class="ep-name">{{ ep.name_cn || ep.name || '无标题' }}</span>
            <span class="ep-files">{{ ep.file_ids?.length || 0 }} 个文件</span>
            <span class="ep-status" :class="{ watched: ep.watched }">
              {{ ep.watched ? '已看' : '未看' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 步骤4: 恢复测试 -->
    <div v-show="currentStep === 3" class="step-content">
      <div class="card">
        <h2>🔄 状态恢复测试</h2>
        <p class="hint">模拟页面刷新后，从数据库恢复匹配状态</p>

        <div class="recovery-stats">
          <div class="stat-box">
            <div class="stat-title">Idle</div>
            <div class="stat-num">{{ statusCount.idle }}</div>
            <small>待搜索</small>
          </div>
          <div class="stat-box">
            <div class="stat-title">Selected</div>
            <div class="stat-num">{{ statusCount.selected }}</div>
            <small>待映射</small>
          </div>
          <div class="stat-box">
            <div class="stat-title">Mapping</div>
            <div class="stat-num">{{ statusCount.mapping }}</div>
            <small>配置中</small>
          </div>
          <div class="stat-box">
            <div class="stat-title">Completed</div>
            <div class="stat-num">{{ statusCount.completed }}</div>
            <small>待保存</small>
          </div>
        </div>

        <button @click="testRecovery" class="btn-primary">测试恢复流程</button>
        <button @click="autoResume" class="btn-secondary" style="margin-left: 10px">
          自动恢复所有
        </button>
      </div>

      <div v-if="recoveryLog.length > 0" class="card">
        <h3>恢复日志</h3>
        <div class="log-list">
          <div v-for="(log, idx) in recoveryLog" :key="idx" :class="['log-item', log.type]">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 调试信息 -->
    <div class="debug-panel">
      <h3>🐛 调试信息</h3>
      <details>
        <summary>Files ({{ files.length }})</summary>
        <pre>{{ JSON.stringify(files.slice(0, 2), null, 2) }}</pre>
      </details>
      <details>
        <summary>Match Records ({{ matchRecords.length }})</summary>
        <pre>{{ JSON.stringify(matchRecords.slice(0, 2), null, 2) }}</pre>
      </details>
      <details>
        <summary>Pending Matches</summary>
        <pre>{{ JSON.stringify(pendingMatches, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { requestDirectory, scanVideos, getDirectoryHandle } from '@/services/fileSystem'
import {
  createMatch as createMatchService,
  selectMatch,
  mappingMatch,
  completeMatch,
} from '@/services/match'
import { saveMatchResult } from '@/services/dataWriter'
import { fileAPI, matchAPI, animeAPI, episodeAPI, debugAPI } from '@/services/storage'
import type { VideoFile } from '@/models/File'
import type { MatchRecord, MatchPreviewGroup, MatchStatus } from '@/models/Match'
import type { BangumiAnime } from '@/models/Bangumi'
import type { Anime, Episode } from '@/models/Anime'

// 步骤定义
const steps = [
  { key: 'scan', name: '扫描文件' },
  { key: 'match', name: '匹配搜索' },
  { key: 'data', name: '数据查看' },
  { key: 'recovery', name: '恢复测试' },
]
const currentStep = ref(0)

// 数据状态
const files = ref<VideoFile[]>([])
const matchRecords = ref<MatchRecord[]>([])
const matchGroups = ref<MatchPreviewGroup[]>([])
const animeList = ref<Anime[]>([])
const episodes = ref<Episode[]>([])
const selectedAnimeEpisodes = ref<Episode[]>([])

// UI 状态
const isScanning = ref(false)
const isMatching = ref(false)
const isSaving = ref(false)
const scanResult = ref<{ added: number; updated: number; deleted: number } | null>(null)
const showMappingFor = ref<string | null>(null)
const recoveryLog = ref<{ time: string; message: string; type: 'info' | 'success' | 'error' }[]>([])

// 计算属性
const pendingMatches = computed(() => matchRecords.value.filter((r) => r.status !== 'completed'))
const completedGroups = computed(() => matchGroups.value.filter((g) => g.status === 'completed'))
const statusCount = computed(() => ({
  idle: matchRecords.value.filter((r) => r.status === 'idle').length,
  selected: matchRecords.value.filter((r) => r.status === 'selected').length,
  mapping: matchRecords.value.filter((r) => r.status === 'mapping').length,
  completed: matchRecords.value.filter((r) => r.status === 'completed').length,
}))

// 初始化
onMounted(async () => {
  await loadAllData()
})

async function loadAllData() {
  files.value = await fileAPI.getAll()
  matchRecords.value = await matchAPI.getAll()
  animeList.value = await animeAPI.getAll()
  episodes.value = await episodeAPI.getAll()
  selectedAnimeEpisodes.value = []

  // 如果有匹配记录，自动加载匹配组视图
  if (matchRecords.value.length > 0) {
    await loadMatchGroups()
  }
}

// 工具函数
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileName(fileId: string): string {
  const file = files.value.find((f) => f.id === fileId)
  return file ? file.name.slice(0, 30) + '...' : '未知文件'
}

function getFileCount(group: MatchPreviewGroup): number {
  return Object.values(group.files).flat().length
}

function getSelectedAnimeName(group: MatchPreviewGroup): string {
  const anime = group.candidates.find((a) => a.id === group.selectedAnimeId)
  return anime ? anime.name_cn || anime.name : '未知'
}

function getEpisodeCount(animeId: string): number {
  return episodes.value.filter((e) => e.anime_id === animeId).length
}

function getStatusClass(status?: MatchStatus) {
  const map: Record<string, string> = {
    idle: 'badge-gray',
    selected: 'badge-blue',
    mapping: 'badge-yellow',
    completed: 'badge-green',
  }
  return map[status || 'idle'] || 'badge-gray'
}

function addLog(message: string, type: 'info' | 'success' | 'error' = 'info') {
  recoveryLog.value.unshift({
    time: new Date().toLocaleTimeString(),
    message,
    type,
  })
}

// 步骤1: 扫描目录
async function selectDirectory() {
  try {
    isScanning.value = true
    let dirHandle = await getDirectoryHandle()
    if (!dirHandle) {
      dirHandle = await requestDirectory()
    }
    const result = await scanVideos(dirHandle)
    scanResult.value = result
    await loadAllData()
    addLog(`扫描完成: +${result.added} -${result.deleted} ~${result.updated}`, 'success')
  } catch (err) {
    console.error(err)
    alert('扫描失败: ' + (err as Error).message)
    addLog('扫描失败: ' + (err as Error).message, 'error')
  } finally {
    isScanning.value = false
  }
}

async function clearAllData() {
  if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return
  await debugAPI.clearAll()
  matchGroups.value = []
  recoveryLog.value = []
}

// 步骤2: 匹配流程
async function createMatch() {
  if (files.value.length === 0) {
    alert('请先扫描文件')
    return
  }

  try {
    isMatching.value = true
    const candidates = await createMatchService()
    await loadMatchGroups(candidates)
    addLog(`创建匹配完成，发现 ${candidates.size} 个匹配组`, 'success')
  } catch (err) {
    console.error(err)
    alert('匹配失败: ' + (err as Error).message)
    addLog('匹配失败: ' + (err as Error).message, 'error')
  } finally {
    isMatching.value = false
  }
}

async function loadMatchGroups(candidates?: Map<string, BangumiAnime[]>) {
  // 重新加载匹配记录
  matchRecords.value = await matchAPI.getAll()

  const groups: MatchPreviewGroup[] = []

  for (const record of matchRecords.value) {
    // 构建 files 映射
    const filesMap: Record<number, string[]> = {}
    for (const [epNum, fileIds] of Object.entries(record.draft_mappings)) {
      filesMap[parseInt(epNum)] = fileIds
    }

    // 如果有候选数据则使用，否则为空数组
    const animes = candidates?.get(record.keyword) || []

    groups.push({
      key: record.keyword,
      title: record.name,
      season: record.season,
      candidates: animes,
      selectedAnimeId: record.selected_anime_id || undefined,
      files: filesMap,
      status: record.status,
    })
  }

  matchGroups.value = groups
}

async function selectAnime(keyword: string, animeId: number) {
  try {
    await selectMatch(keyword, animeId)
    // 更新本地状态
    const group = matchGroups.value.find((g) => g.key === keyword)
    if (group) {
      group.selectedAnimeId = animeId
      group.status = 'selected'
    }
    addLog(`已选择 [${keyword}] -> ${animeId}`, 'success')
  } catch (err) {
    alert('选择失败: ' + (err as Error).message)
    addLog('选择失败: ' + (err as Error).message, 'error')
  }
}

function showMapping(keyword: string) {
  showMappingFor.value = keyword
}

async function confirmMapping(keyword: string) {
  try {
    const group = matchGroups.value.find((g) => g.key === keyword)
    if (!group) return

    await mappingMatch(keyword, group.files)
    await completeMatch(keyword)

    // 更新本地状态
    group.status = 'completed'
    showMappingFor.value = null

    // 重新加载记录
    await loadAllData()
    addLog(`[${keyword}] 映射确认完成`, 'success')
  } catch (err) {
    alert('确认失败: ' + (err as Error).message)
    addLog('确认失败: ' + (err as Error).message, 'error')
  }
}

async function saveSingleMatch(keyword: string) {
  try {
    isSaving.value = true
    await saveMatchResult(keyword)
    await loadAllData()
    addLog(`[${keyword}] 保存成功`, 'success')
    alert('保存成功！')
  } catch (err) {
    console.error(err)
    alert('保存失败: ' + (err as Error).message)
    addLog('保存失败: ' + (err as Error).message, 'error')
  } finally {
    isSaving.value = false
  }
}

async function saveAllMatches() {
  try {
    isSaving.value = true
    const completed = matchRecords.value.filter((r) => r.status === 'completed')

    for (const record of completed) {
      await saveMatchResult(record.keyword)
      addLog(`[${record.keyword}] 保存成功`, 'success')
    }

    await loadAllData()
    alert(`成功保存 ${completed.length} 个匹配`)
  } catch (err) {
    console.error(err)
    alert('保存失败: ' + (err as Error).message)
    addLog('批量保存失败: ' + (err as Error).message, 'error')
  } finally {
    isSaving.value = false
  }
}

async function resumeUncompleted() {
  // 恢复到匹配步骤，并自动加载未完成的
  currentStep.value = 1
  await createMatch() // 这会重新搜索候选，恢复可继续的状态
}

// 步骤3: 数据查看
async function viewEpisodes(animeId: string) {
  selectedAnimeEpisodes.value = await episodeAPI.getByAnimeId(animeId)
}

// 步骤4: 恢复测试
async function testRecovery() {
  recoveryLog.value = []
  addLog('开始恢复测试...')

  // 模拟刷新：清空内存中的候选数据
  matchGroups.value = matchGroups.value.map((g) => ({ ...g, candidates: [] }))

  const pending = matchRecords.value.filter((r) => r.status !== 'completed')
  addLog(`发现 ${pending.length} 个待恢复任务`)

  // 恢复 idle 状态的搜索
  const idleRecords = pending.filter((r) => r.status === 'idle')
  if (idleRecords.length > 0) {
    addLog(`恢复 ${idleRecords.length} 个 idle 任务的搜索...`)
    try {
      const candidates = await createMatchService()
      await loadMatchGroups(candidates)
      addLog('搜索恢复完成', 'success')
    } catch (err) {
      addLog('搜索恢复失败: ' + (err as Error).message, 'error')
    }
  }

  // 恢复 selected/mapping 状态
  const selectedRecords = pending.filter((r) => r.status === 'selected' || r.status === 'mapping')
  for (const record of selectedRecords) {
    addLog(`[${record.keyword}] 状态: ${record.status}, 已选 anime: ${record.selected_anime_id}`)
    // 这里可以添加获取 episodes 的逻辑
  }
}

async function autoResume() {
  recoveryLog.value = []
  addLog('开始自动恢复...')

  // 1. 先恢复所有搜索
  await testRecovery()

  // 2. 提示用户确认映射
  const mappingCount = matchRecords.value.filter((r) => r.status === 'selected').length
  if (mappingCount > 0) {
    addLog(`有 ${mappingCount} 个任务等待映射确认，请手动确认`, 'info')
    currentStep.value = 1
  }

  // 3. 自动保存所有 completed
  const completedCount = matchRecords.value.filter((r) => r.status === 'completed').length
  if (completedCount > 0) {
    addLog(`发现 ${completedCount} 个已完成任务，自动保存...`)
    await saveAllMatches()
  }
}
</script>

<style scoped>
.test-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
}

h1 {
  color: #333;
  margin-bottom: 20px;
}

/* 全局操作 */
.global-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.btn-danger {
  background: #f44336;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-small {
  padding: 4px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #e0e0e0;
}

.btn-success {
  background: #4caf50;
  color: white;
}

.btn-text {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  margin-left: 10px;
}

/* 步骤导航 */
.steps-nav {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  background: white;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  flex: 1;
  justify-content: center;
}

.step-item:hover {
  background: #f5f5f5;
}

.step-item.active {
  background: #4caf50;
  color: white;
}

.step-item.completed {
  color: #4caf50;
  font-weight: 500;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.step-item.active .step-num {
  background: white;
  color: #4caf50;
}

.step-item.completed .step-num {
  background: #4caf50;
  color: white;
}

/* 卡片 */
.card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card h2,
.card h3,
.card h4 {
  margin-top: 0;
  color: #444;
}

/* 按钮 */
.btn-primary {
  background: #4caf50;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn-primary:hover:not(:disabled) {
  background: #45a049;
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #2196f3;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

/* 文件列表 */
.file-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.file-item:last-child {
  border-bottom: none;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-name {
  font-weight: 500;
  color: #333;
}

.file-linked {
  color: #4caf50;
  font-size: 12px;
}

.file-meta {
  font-size: 12px;
  color: #999;
  font-family: monospace;
}

/* 匹配列表 */
.match-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.match-item {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 15px;
  transition: all 0.2s;
}

.match-item.selected {
  border-color: #2196f3;
  background: #f3f9ff;
}

.match-item.resolved {
  border-color: #4caf50;
  background: #f8fff8;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.match-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.keyword {
  font-weight: bold;
  font-size: 16px;
  color: #333;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  text-transform: uppercase;
}

.badge-gray {
  background: #9e9e9e;
  color: white;
}
.badge-blue {
  background: #2196f3;
  color: white;
}
.badge-yellow {
  background: #ffc107;
  color: black;
}
.badge-green {
  background: #4caf50;
  color: white;
}

.match-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.match-files {
  font-size: 13px;
  color: #666;
}

.section-title {
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
  font-weight: 500;
}

/* 候选列表 */
.candidates {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 10px 0;
}

.candidate-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  min-width: 280px;
  transition: all 0.2s;
  background: white;
}

.candidate-item:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2);
}

.candidate-item.selected {
  border-color: #4caf50;
  background: #e8f5e9;
}

.anime-cover {
  width: 60px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.anime-info {
  flex: 1;
  min-width: 0;
}

.anime-name {
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.anime-meta {
  font-size: 12px;
  color: #666;
}

/* 已选择区域 */
.selected-info {
  padding: 10px;
  background: #f5f5f5;
  border-radius: 6px;
}

.selected-anime {
  font-weight: 500;
  color: #2196f3;
  margin-bottom: 10px;
}

/* 映射区域 */
.mapping-section {
  margin-top: 15px;
  padding: 15px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px dashed #ddd;
}

.mapping-hint {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
}

.mapping-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0;
  max-height: 200px;
  overflow-y: auto;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: white;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
}

.ep-num {
  font-weight: 600;
  color: #333;
  min-width: 60px;
}

.file-detail {
  font-size: 12px;
  color: #666;
  min-width: 60px;
}

.file-names {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-names small {
  color: #999;
  font-size: 11px;
}

.mapping-actions {
  margin-top: 15px;
  display: flex;
  align-items: center;
}

.completed-badge {
  margin-top: 10px;
  padding: 8px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 4px;
  font-size: 13px;
  text-align: center;
}

/* 数据库统计 */
.db-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  margin: 15px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #4caf50;
}

/* Anime 列表 */
.anime-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.anime-row {
  display: flex;
  gap: 15px;
  padding: 15px;
  border: 1px solid #eee;
  border-radius: 8px;
  align-items: center;
}

.anime-thumb {
  width: 60px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}

.anime-detail {
  flex: 1;
}

.anime-title {
  font-weight: 600;
  color: #333;
  font-size: 16px;
}

.anime-subtitle {
  font-size: 13px;
  color: #666;
  margin: 4px 0;
}

.anime-tags {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.tag {
  padding: 2px 8px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 4px;
  font-size: 12px;
}

/* Episode 列表 */
.episode-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.episode-row {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 6px;
}

.ep-number {
  font-weight: 600;
  color: #333;
  min-width: 50px;
}

.ep-name {
  flex: 1;
  color: #555;
}

.ep-files {
  font-size: 12px;
  color: #666;
  padding: 2px 8px;
  background: white;
  border-radius: 4px;
}

.ep-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e0e0e0;
  color: #666;
}

.ep-status.watched {
  background: #c8e6c9;
  color: #2e7d32;
}

/* 恢复测试 */
.recovery-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin: 20px 0;
}

.stat-box {
  text-align: center;
  padding: 15px;
  background: #f5f5f5;
  border-radius: 8px;
}

.stat-title {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.stat-num {
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

/* 日志 */
.log-list {
  max-height: 300px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 13px;
}

.log-item {
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  gap: 10px;
}

.log-time {
  color: #999;
  min-width: 80px;
}

.log-item.success .log-msg {
  color: #4caf50;
}
.log-item.error .log-msg {
  color: #f44336;
}
.log-item.info .log-msg {
  color: #333;
}

/* 调试面板 */
.debug-panel {
  margin-top: 40px;
  padding: 20px;
  background: #263238;
  color: #aed581;
  border-radius: 8px;
}

.debug-panel summary {
  cursor: pointer;
  padding: 5px 0;
  color: #fff;
}

.debug-panel pre {
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
}

.hint {
  color: #666;
  font-size: 14px;
  margin-top: 8px;
  line-height: 1.5;
}

.result-box {
  margin-top: 15px;
  padding: 15px;
  background: #e8f5e9;
  border-radius: 6px;
  color: #2e7d32;
}
</style>
