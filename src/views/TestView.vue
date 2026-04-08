<template>
  <div class="test-container">
    <h1>🎬 Euphonium 流程测试页面</h1>

    <div class="global-actions">
      <el-button type="danger" @click="clearAllData">🗑️ 清空所有数据</el-button>
      <el-button @click="loadAllData">🔄 刷新数据</el-button>
    </div>

    <el-steps :active="currentStep" finish-status="success" simple>
      <el-step title="扫描文件" @click="currentStep = 0" />
      <el-step title="匹配搜索" @click="currentStep = 1" />
      <el-step title="保存数据" @click="currentStep = 2" />
      <el-step title="恢复测试" @click="currentStep = 3" />
    </el-steps>

    <!-- 步骤1: 扫描目录 -->
    <div v-show="currentStep === 0" class="step-content">
      <el-card>
        <template #header>
          <h2>📁 扫描视频文件</h2>
        </template>
        <el-button type="primary" :loading="isScanning" @click="selectDirectory">
          {{ isScanning ? '扫描中...' : '选择文件夹' }}
        </el-button>
        <el-alert
          v-if="scanResult"
          :title="`新增: ${scanResult.added} | 更新: ${scanResult.updated} | 删除: ${scanResult.deleted}`"
          type="success"
          :closable="false"
          class="scan-result"
        />
        <p class="hint">支持格式: mp4, mkv, avi, mov, wmv, flv, webm</p>
      </el-card>

      <el-card v-if="files.length > 0">
        <template #header>
          <h3>已扫描文件 ({{ files.length }})</h3>
        </template>
        <el-table :data="files" height="400">
          <el-table-column prop="name" label="文件名" min-width="200" />
          <el-table-column prop="size" label="大小" width="100">
            <template #default="{ row }">{{ formatFileSize(row.size) }}</template>
          </el-table-column>
          <el-table-column prop="quickHash" label="哈希" width="120">
            <template #default="{ row }">{{ row.quickHash.slice(0, 8) }}...</template>
          </el-table-column>
          <el-table-column prop="ep_id" label="状态" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.ep_id" type="success">已关联</el-tag>
              <el-tag v-else type="info">未关联</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 步骤2: 匹配搜索 -->
    <div v-show="currentStep === 1" class="step-content">
      <el-card>
        <template #header>
          <h2>🔍 创建匹配任务</h2>
        </template>
        <el-button type="primary" :loading="isMatching" :disabled="files.length === 0" @click="createMatchView">
          {{ isMatching ? '搜索中...' : '开始匹配搜索' }}
        </el-button>
        <p class="hint">将根据文件名解析出标题和集数，搜索 Bangumi 数据</p>
      </el-card>

      <el-card v-if="matchRecords.length > 0">
        <template #header>
          <div class="card-header">
            <span>匹配记录 ({{ matchRecords.length }})</span>
            <el-button link @click="resumeUncompleted">恢复未完成</el-button>
          </div>
        </template>

        <div class="match-list">
          <el-card
            v-for="record in matchRecords"
            :key="record.keyword"
            class="match-item"
            :class="{ 'is-completed': record.status === 'completed' }"
            shadow="hover"
          >
            <div class="match-header">
              <div>
                <span class="keyword">{{ record.keyword }}</span>
                <el-tag :type="getStatusType(record.status)" size="small" class="status-tag">
                  {{ record.status }}
                </el-tag>
              </div>
              <div class="match-actions">
                <span class="file-count">{{ getFileCount(record) }} 个文件</span>
                <el-button
                  v-if="record.status === 'completed'"
                  type="success"
                  size="small"
                  :loading="isSaving"
                  @click="saveSingleMatch(record.keyword)"
                >
                  保存
                </el-button>
              </div>
            </div>

            <!-- 候选列表 -->
            <div v-if="candidatesMap.has(record.keyword) && record.status !== 'completed'" class="candidates">
              <p class="section-title">选择匹配的动画:</p>
              <div class="candidate-list">
                <el-card
                  v-for="anime in candidatesMap.get(record.keyword)"
                  :key="anime.id"
                  class="candidate-card"
                  :class="{ 'is-selected': record.selected_anime_id === anime.id }"
                  shadow="hover"
                  @click="selectAnime(record.keyword, anime.id)"
                >
                  <el-image v-if="anime.image" :src="anime.image" fit="cover" class="candidate-cover" />
                  <div class="candidate-info">
                    <h4>{{ anime.name_cn || anime.name }}</h4>
                    <p>评分: {{ anime.rating?.score || 'N/A' }} | 集数: {{ anime.eps }}</p>
                  </div>
                </el-card>
              </div>
            </div>

            <!-- 已选择但未完成 -->
            <div v-else-if="record.status === 'selected' || record.status === 'mapping'" class="selected-info">
              <p>已选择: {{ getSelectedAnimeName(record) }}</p>
              <el-button type="primary" @click="showMapping(record.keyword)">配置集数映射</el-button>
            </div>

            <!-- 映射配置 -->
            <el-dialog
              v-model="mappingDialog[record.keyword]"
              title="集数映射配置"
              width="500px"
            >
              <div class="mapping-list">
                <div
                  v-for="(fileIds, epNum) in record.draft_mappings"
                  :key="epNum"
                  class="mapping-row"
                >
                  <span class="ep-num">第 {{ epNum }} 集</span>
                  <span class="file-count">{{ fileIds.length }} 个文件</span>
                  <div class="file-names">
                    <el-tag v-for="fid in fileIds" :key="fid" size="small">{{ getFileName(fid) }}</el-tag>
                  </div>
                </div>
              </div>
              <template #footer>
                <el-button @click="mappingDialog[record.keyword] = false">取消</el-button>
                <el-button type="primary" @click="confirmMapping(record.keyword)">确认并完成</el-button>
              </template>
            </el-dialog>

            <div v-if="record.status === 'completed'" class="completed-badge">
              ✓ 匹配完成，等待保存到数据库
            </div>
          </el-card>
        </div>
      </el-card>

      <el-card v-if="completedRecords.length > 0">
        <template #header>
          <h3>批量操作</h3>
        </template>
        <p>有 {{ completedRecords.length }} 个已完成匹配的记录等待保存</p>
        <el-button type="primary" :loading="isSaving" @click="saveAllMatches">
          全部保存到数据库
        </el-button>
      </el-card>
    </div>

    <!-- 步骤3: 数据查看 -->
    <div v-show="currentStep === 2" class="step-content">
      <el-card>
        <template #header>
          <h2>💾 数据库状态</h2>
        </template>
        <div class="db-stats">
          <div class="stat-item">
            <span class="label">Anime</span>
            <span class="value">{{ animeList.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Episodes</span>
            <span class="value">{{ episodes.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Files</span>
            <span class="value">{{ files.length }}</span>
          </div>
          <div class="stat-item">
            <span class="label">Match Records</span>
            <span class="value">{{ matchRecords.length }}</span>
          </div>
        </div>
      </el-card>

      <el-card v-if="animeList.length > 0">
        <template #header>
          <h3>Anime 列表</h3>
        </template>
        <el-table :data="animeList">
          <el-table-column prop="name_cn" label="名称" min-width="200" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rating" label="评分" width="80" />
          <el-table-column prop="bangumi_score" label="Bangumi" width="100" />
        </el-table>
      </el-card>
    </div>

    <!-- 步骤4: 恢复测试 -->
    <div v-show="currentStep === 3" class="step-content">
      <el-card>
        <template #header>
          <h2>🔄 状态恢复测试</h2>
        </template>
        <div class="recovery-stats">
          <div class="stat-box">
            <div class="title">Idle</div>
            <div class="num">{{ statusCount.idle }}</div>
            <small>待搜索</small>
          </div>
          <div class="stat-box">
            <div class="title">Selected</div>
            <div class="num">{{ statusCount.selected }}</div>
            <small>待映射</small>
          </div>
          <div class="stat-box">
            <div class="title">Mapping</div>
            <div class="num">{{ statusCount.mapping }}</div>
            <small>配置中</small>
          </div>
          <div class="stat-box">
            <div class="title">Completed</div>
            <div class="num">{{ statusCount.completed }}</div>
            <small>待保存</small>
          </div>
        </div>
        <el-button type="primary" @click="testRecovery">测试恢复流程</el-button>
        <el-button @click="autoResume">自动恢复所有</el-button>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { requestDirectory, scanVideos, getDirectoryHandle } from '@/services/fileSystem'
import { createMatch, selectMatch, mappingMatch, completeMatch } from '@/services/match'
import { saveMatchResult } from '@/services/dataWriter'
import { fileAPI, matchAPI, animeAPI, episodeAPI, debugAPI } from '@/services/storage'
import type { VideoFile } from '@/models/File'
import type { MatchRecord, MatchStatus } from '@/models/Match'
import type { BangumiAnime } from '@/models/Bangumi'
import type { Anime, Episode } from '@/models/Anime'

const router = useRouter()

const currentStep = ref(0)
const files = ref<VideoFile[]>([])
const matchRecords = ref<MatchRecord[]>([])
const candidatesMap = ref<Map<string, BangumiAnime[]>>(new Map())
const animeList = ref<Anime[]>([])
const episodes = ref<Episode[]>([])
const isScanning = ref(false)
const isMatching = ref(false)
const isSaving = ref(false)
const scanResult = ref<{ added: number; updated: number; deleted: number } | null>(null)
const mappingDialog = reactive<Record<string, boolean>>({})

const pendingRecords = computed(() => matchRecords.value.filter(r => r.status !== 'completed'))
const completedRecords = computed(() => matchRecords.value.filter(r => r.status === 'completed'))
const statusCount = computed(() => ({
  idle: matchRecords.value.filter(r => r.status === 'idle').length,
  selected: matchRecords.value.filter(r => r.status === 'selected').length,
  mapping: matchRecords.value.filter(r => r.status === 'mapping').length,
  completed: matchRecords.value.filter(r => r.status === 'completed').length,
}))

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileName(fileId: string): string {
  const file = files.value.find(f => f.id === fileId)
  return file ? file.name.slice(0, 30) : '未知'
}

function getFileCount(record: MatchRecord): number {
  return Object.values(record.draft_mappings).flat().length
}

function getSelectedAnimeName(record: MatchRecord): string {
  const animes = candidatesMap.value.get(record.keyword)
  if (!animes) return '未知'
  const anime = animes.find(a => a.id === record.selected_anime_id)
  return anime ? (anime.name_cn || anime.name) : `ID: ${record.selected_anime_id}`
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    watching: '在看',
    planned: '想看',
    completed: '看过',
    on_hold: '搁置',
    dropped: '抛弃'
  }
  return map[status] || status
}

function getStatusType(status: string | MatchStatus): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    watching: 'success',
    planned: 'info',
    completed: '',
    on_hold: 'warning',
    dropped: 'danger',
    idle: 'info',
    selected: 'primary',
    mapping: 'warning'
  }
  return map[status] || 'info'
}

async function loadAllData() {
  files.value = await fileAPI.getAll()
  matchRecords.value = await matchAPI.getAll()
  animeList.value = await animeAPI.getAll()
  episodes.value = await episodeAPI.getAll()
}

async function selectDirectory() {
  try {
    isScanning.value = true
    let dirHandle = await getDirectoryHandle()
    if (!dirHandle) dirHandle = await requestDirectory()
    const result = await scanVideos(dirHandle)
    scanResult.value = result
    await loadAllData()
    ElMessage.success(`扫描完成: +${result.added} -${result.deleted}`)
  } catch (err) {
    ElMessage.error('扫描失败: ' + (err as Error).message)
  } finally {
    isScanning.value = false
  }
}

async function clearAllData() {
  try {
    await ElMessageBox.confirm('确定清空所有数据？', '警告', { 
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await debugAPI.clearAll()
    candidatesMap.value.clear()
    await loadAllData()
    ElMessage.success('已清空')
  } catch {
    // 取消
  }
}

async function createMatchView() {
  if (files.value.length === 0) {
    ElMessage.warning('请先扫描文件')
    return
  }
  try {
    isMatching.value = true
    const candidates = await createMatch()
    candidatesMap.value = candidates
    await loadAllData()
    ElMessage.success(`发现 ${candidates.size} 个匹配组`)
  } catch (err) {
    ElMessage.error('匹配失败')
  } finally {
    isMatching.value = false
  }
}

async function selectAnime(keyword: string, animeId: number) {
  try {
    await selectMatch(keyword, animeId)
    await loadAllData()
    ElMessage.success('已选择')
  } catch (err) {
    ElMessage.error('选择失败')
  }
}

function showMapping(keyword: string) {
  mappingDialog[keyword] = true
}

async function confirmMapping(keyword: string) {
  try {
    const record = matchRecords.value.find(r => r.keyword === keyword)
    if (!record) return
    await mappingMatch(keyword, record.draft_mappings)
    await completeMatch(keyword)
    mappingDialog[keyword] = false
    await loadAllData()
    ElMessage.success('映射确认完成')
  } catch (err) {
    ElMessage.error('确认失败')
  }
}

async function saveSingleMatch(keyword: string) {
  try {
    isSaving.value = true
    await saveMatchResult(keyword)
    await loadAllData()
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error('保存失败')
  } finally {
    isSaving.value = false
  }
}

async function saveAllMatches() {
  try {
    isSaving.value = true
    for (const record of completedRecords.value) {
      await saveMatchResult(record.keyword)
    }
    await loadAllData()
    ElMessage.success(`保存了 ${completedRecords.value.length} 个匹配`)
  } catch (err) {
    ElMessage.error('批量保存失败')
  } finally {
    isSaving.value = false
  }
}

async function resumeUncompleted() {
  currentStep.value = 1
  await createMatchView()
}

async function testRecovery() {
  candidatesMap.value.clear()
  const pending = matchRecords.value.filter(r => r.status !== 'completed')
  const idleRecords = pending.filter(r => r.status === 'idle')
  if (idleRecords.length > 0) {
    const candidates = await createMatch()
    candidatesMap.value = candidates
  }
  ElMessage.success('恢复测试完成')
}

async function autoResume() {
  await testRecovery()
  const mappingCount = matchRecords.value.filter(r => r.status === 'selected').length
  if (mappingCount > 0) {
    currentStep.value = 1
  }
  const completedCount = matchRecords.value.filter(r => r.status === 'completed').length
  if (completedCount > 0) {
    await saveAllMatches()
  }
}

onMounted(() => {
  loadAllData()
})
</script>

<style scoped>
.test-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.global-actions {
  margin-bottom: 20px;
  display: flex;
  gap: 12px;
}

.step-content {
  margin-top: 24px;
}

.hint {
  color: #909399;
  font-size: 14px;
  margin-top: 12px;
}

.scan-result {
  margin-top: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.match-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-item {
  transition: all 0.2s;
}

.match-item.is-completed {
  border-color: #67c23a;
}

.match-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.keyword {
  font-weight: 600;
  font-size: 16px;
  margin-right: 12px;
}

.status-tag {
  text-transform: uppercase;
}

.file-count {
  color: #909399;
  margin-right: 12px;
}

.candidates {
  margin-top: 16px;
}

.section-title {
  color: #606266;
  font-size: 14px;
  margin-bottom: 12px;
}

.candidate-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
}

.candidate-card {
  width: 200px;
  cursor: pointer;
  flex-shrink: 0;
}

.candidate-card.is-selected {
  border-color: #67c23a;
  background: #f0f9ff;
}

.candidate-cover {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 8px;
}

.candidate-info h4 {
  font-size: 14px;
  margin: 0 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.candidate-info p {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

.selected-info {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.completed-badge {
  text-align: center;
  color: #67c23a;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 8px;
}

.mapping-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
}

.ep-num {
  font-weight: 600;
  min-width: 60px;
}

.file-count {
  color: #909399;
  font-size: 14px;
}

.file-names {
  flex: 1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.db-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.stat-item {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 12px;
}

.stat-item .label {
  display: block;
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}

.stat-item .value {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #67c23a;
}

.recovery-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-box {
  text-align: center;
  padding: 20px;
  background: #f5f7fa;
  border-radius: 12px;
}

.stat-box .title {
  font-size: 12px;
  color: #909399;
  text-transform: uppercase;
}

.stat-box .num {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  margin: 8px 0;
}

@media (max-width: 768px) {
  .db-stats,
  .recovery-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>