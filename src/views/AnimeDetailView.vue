<template>
  <div class="detail-container">
    <!-- 顶部导航 -->
    <el-header class="detail-header">
      <div class="header-content">
        <el-button text :icon="ArrowLeft" @click="goBack">返回</el-button>
        <span class="header-title">{{ anime?.name_cn || '番剧详情' }}</span>
        <el-button text :icon="MoreFilled" />
      </div>
    </el-header>

    <!-- 主内容 -->
    <el-main v-if="anime" class="detail-main">
      <!-- 头部信息区 -->
      <div class="detail-hero">
        <el-image
          v-if="anime.cover"
          :src="anime.cover"
          fit="cover"
          class="hero-cover"
        />
        <div v-else class="hero-cover-placeholder">
          <el-icon :size="64"><VideoCamera /></el-icon>
        </div>
        
        <div class="hero-info">
          <h1>{{ anime.name_cn }}</h1>
          <p class="original-name">{{ anime.name }}</p>
          
          <div class="hero-meta">
            <el-tag :type="getStatusType(anime.status)" size="large">
              {{ getStatusText(anime.status) }}
            </el-tag>
            <span class="meta-item">{{ anime.total_episodes }} 集</span>
            <span v-if="anime.date" class="meta-item">首播: {{ anime.date }}</span>
            <span v-if="anime.bangumi_score" class="meta-item bangumi-score">
              <el-icon color="#67c23a"><Trophy /></el-icon>
              {{ anime.bangumi_score }}
            </span>
          </div>

          <div class="hero-actions">
            <el-button 
              v-if="nextEpisode" 
              type="primary" 
              size="large"
              :icon="VideoPlay"
              @click="playEpisode(nextEpisode)"
            >
              {{ nextEpisode.watched ? '重新观看' : '继续观看' }} 第 {{ nextEpisode.ep }} 集
            </el-button>
            <el-button 
              v-else-if="episodes.length > 0" 
              type="primary" 
              size="large"
              :icon="VideoPlay"
              @click="playEpisode(episodes[0])"
            >
              开始观看
            </el-button>
            <el-button v-else size="large" disabled>暂无视频</el-button>
            
            <el-button 
              :type="isFavorite ? 'warning' : 'default'" 
              size="large"
              :icon="isFavorite ? StarFilled : Star"
              @click="toggleFavorite"
            >
              {{ isFavorite ? '已收藏' : '收藏' }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 内容标签页 -->
      <el-tabs v-model="activeTab" class="detail-tabs">
        <!-- 剧集列表 -->
        <el-tab-pane label="剧集" name="episodes">
          <div class="episodes-toolbar">
            <el-radio-group v-model="episodeView" size="small">
              <el-radio-button label="grid">网格</el-radio-button>
              <el-radio-button label="list">列表</el-radio-button>
            </el-radio-group>
            <el-progress 
              :percentage="watchProgress" 
              :format="() => `${watchedCount}/${episodes.length}`"
              class="watch-progress"
              style="width: 200px"
            />
          </div>

          <!-- 网格视图 -->
          <div v-if="episodeView === 'grid'" class="episodes-grid">
            <el-card
              v-for="ep in episodes"
              :key="ep.id"
              class="episode-card"
              :class="{ 'is-watched': ep.watched }"
              shadow="hover"
              @click="playEpisode(ep)"
            >
              <div class="episode-thumb">
                <span class="ep-number">{{ ep.ep }}</span>
                <div v-if="ep.watched" class="watched-badge">
                  <el-icon><CircleCheckFilled /></el-icon>
                </div>
              </div>
              <div class="episode-info">
                <h4 class="ep-title">{{ ep.name_cn || ep.name || `第 ${ep.ep} 集` }}</h4>
                <p class="ep-meta">
                  <span v-if="ep.duration_seconds">{{ formatDuration(ep.duration_seconds) }}</span>
                  <span v-if="ep.airdate">{{ ep.airdate }}</span>
                </p>
                <el-tag v-if="ep.file_ids?.length" type="info" size="small" class="file-tag">
                  {{ ep.file_ids.length }} 个文件
                </el-tag>
              </div>
            </el-card>
          </div>

          <!-- 列表视图 -->
          <div v-else class="episodes-list">
            <div
              v-for="ep in episodes"
              :key="ep.id"
              class="episode-list-item"
              :class="{ 'is-watched': ep.watched }"
              @click="playEpisode(ep)"
            >
              <div class="list-ep-number">{{ ep.ep }}</div>
              <div class="list-ep-info">
                <h4>{{ ep.name_cn || ep.name || `第 ${ep.ep} 集` }}</h4>
                <p>
                  <span v-if="ep.duration_seconds">{{ formatDuration(ep.duration_seconds) }}</span>
                  <span v-if="ep.airdate">{{ ep.airdate }}</span>
                  <el-tag v-if="ep.file_ids?.length" type="info" size="small">
                    {{ ep.file_ids.length }} 个文件
                  </el-tag>
                </p>
              </div>
              <div class="list-ep-status">
                <el-icon v-if="ep.watched" color="#67c23a" :size="20"><CircleCheckFilled /></el-icon>
                <el-button v-else type="primary" text :icon="VideoPlay">播放</el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 简介 -->
        <el-tab-pane label="简介" name="summary">
          <el-card class="summary-card">
            <p class="full-summary">{{ anime.summary || '暂无简介' }}</p>
          </el-card>
          
          <el-descriptions title="详细信息" :column="2" border class="detail-info">
            <el-descriptions-item label="日文名">{{ anime.name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="首播日期">{{ anime.date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="总集数">{{ anime.total_episodes }}</el-descriptions-item>
            <el-descriptions-item label="Bangumi ID">{{ anime.bangumi_id || '-' }}</el-descriptions-item>
            <el-descriptions-item label="Bangumi 评分">{{ anime.bangumi_score || '-' }}</el-descriptions-item>
            <el-descriptions-item label="我的评分">{{ anime.rating || '未评分' }}</el-descriptions-item>
          </el-descriptions>

          <div v-if="anime.tags?.length" class="detail-tags">
            <h3>标签</h3>
            <div class="tag-cloud">
              <el-tag
                v-for="tag in anime.tags"
                :key="tag"
                size="large"
                effect="plain"
                round
              >
                {{ tag }}
              </el-tag>
            </div>
          </div>
        </el-tab-pane>

        <!-- 文件管理 -->
        <el-tab-pane label="文件" name="files">
          <el-empty description="文件管理功能开发中">
            <template #description>
              <p>关联本地视频文件，管理多版本资源</p>
              <p class="sub-text">支持扫描、匹配、播放记录同步</p>
            </template>
            <el-button type="primary" @click="$router.push('/test')">前往扫描</el-button>
          </el-empty>
        </el-tab-pane>

        <!-- 笔记 -->
        <el-tab-pane label="笔记" name="notes">
          <el-empty description="笔记功能开发中">
            <template #description>
              <p>记录观后感、截图、时间戳笔记</p>
            </template>
          </el-empty>
        </el-tab-pane>
      </el-tabs>
    </el-main>

    <!-- 播放器占位弹窗 -->
    <el-dialog
      v-model="playerVisible"
      :title="currentEpisode ? `正在播放: 第 ${currentEpisode.ep} 集` : '播放器'"
      width="80%"
      destroy-on-close
      class="player-dialog"
      align-center
    >
      <div class="player-placeholder">
        <el-icon :size="64"><VideoPlay /></el-icon>
        <p>视频播放器占位</p>
        <p class="sub-text">Episode ID: {{ currentEpisode?.id }}</p>
        <p class="sub-text">File IDs: {{ currentEpisode?.file_ids?.join(', ') || '无' }}</p>
      </div>
      <template #footer>
        <div class="player-controls">
          <el-button :icon="ArrowLeft" @click="getPrevEpisode">上一集</el-button>
          <el-button type="primary" :icon="CircleCheck" @click="markCurrentWatched">
            标记为已看
          </el-button>
          <el-button :icon="ArrowRight" @click="getNextEpisode">下一集</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowLeft, MoreFilled, VideoCamera, VideoPlay,
  Star, StarFilled, Trophy, CircleCheckFilled,
  CircleCheck, ArrowRight
} from '@element-plus/icons-vue'
import { animeAPI, episodeAPI } from '@/services/storage'
import type { Anime, Episode } from '@/models/Anime'

const route = useRoute()
const router = useRouter()

// 状态
const isLoading = ref(true)
const anime = ref<Anime | null>(null)
const episodes = ref<Episode[]>([])
const activeTab = ref('episodes')
const episodeView = ref<'grid' | 'list'>('grid')
const isFavorite = ref(false)
const playerVisible = ref(false)
const currentEpisode = ref<Episode | null>(null)

// 计算属性
const watchedCount = computed(() => episodes.value.filter(e => e.watched).length)
const watchProgress = computed(() => {
  if (episodes.value.length === 0) return 0
  return Math.round((watchedCount.value / episodes.value.length) * 100)
})

const nextEpisode = computed(() => {
  return episodes.value.find(e => !e.watched) || null
})

// 方法
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

function getStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    watching: 'success',
    planned: 'info',
    completed: '',
    on_hold: 'warning',
    dropped: 'danger'
  }
  return map[status] || 'info'
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return `${hrs}h ${mins % 60}m`
  return `${mins}m`
}

function goBack() {
  router.back()
}

function toggleFavorite() {
  isFavorite.value = !isFavorite.value
  ElMessage.success(isFavorite.value ? '已收藏' : '取消收藏')
}

function playEpisode(ep: Episode) {
  currentEpisode.value = ep
  playerVisible.value = true
}

function getPrevEpisode() {
  if (!currentEpisode.value) return
  const idx = episodes.value.findIndex(e => e.id === currentEpisode.value?.id)
  if (idx > 0) {
    const prev = episodes.value[idx - 1]
    if (prev) currentEpisode.value = prev
  }
}

function getNextEpisode() {
  if (!currentEpisode.value) return
  const idx = episodes.value.findIndex(e => e.id === currentEpisode.value?.id)
  if (idx < episodes.value.length - 1) {
    const next = episodes.value[idx + 1]
    if (next) currentEpisode.value = next
  }
}

async function markCurrentWatched() {
  if (!currentEpisode.value) return
  try {
    await episodeAPI.update(currentEpisode.value.id, { watched: true })
    currentEpisode.value.watched = true
    ElMessage.success('已标记为已看')
  } catch (err) {
    console.error('标记失败:', err)
    ElMessage.error('标记失败')
  }
}

async function loadData() {
  const id = route.params.id as string
  if (!id) {
    router.push('/')
    return
  }

  isLoading.value = true
  try {
    const tempAnime = await animeAPI.getById(id)
    if (!tempAnime) {
      ElMessage.error('番剧不存在')
      router.push('/')
      return
    }
    anime.value = tempAnime
    episodes.value = await episodeAPI.getByAnimeId(id)
    episodes.value.sort((a, b) => a.ep - b.ep)
  } catch (err) {
    console.error('加载失败:', err)
    ElMessage.error('加载失败')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.detail-container {
  min-height: 100vh;
  background: #f5f7fa;
}

.detail-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  padding: 0;
  height: 56px;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.detail-main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

/* Hero 区 */
.detail-hero {
  display: flex;
  gap: 32px;
  margin-bottom: 32px;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.hero-cover {
  width: 240px;
  height: 320px;
  border-radius: 12px;
  flex-shrink: 0;
  object-fit: cover;
}

.hero-cover-placeholder {
  width: 240px;
  height: 320px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.hero-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.hero-info h1 {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 12px;
  line-height: 1.2;
}

.original-name {
  font-size: 16px;
  color: #909399;
  margin: 0 0 20px;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 14px;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 4px;
}

.bangumi-score {
  color: #67c23a;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 12px;
  margin-top: auto;
}

/* 标签页 */
.detail-tabs {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 24px;
}

/* 剧集工具栏 */
.episodes-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* 剧集网格 */
.episodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.episode-card {
  cursor: pointer;
  transition: all 0.2s;
}

.episode-card:hover {
  transform: translateY(-2px);
}

.episode-card.is-watched {
  opacity: 0.7;
}

.episode-card.is-watched :deep(.el-card__body) {
  background: #f0f9ff;
}

.episode-thumb {
  position: relative;
  aspect-ratio: 16/9;
  background: #f5f7fa;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.ep-number {
  font-size: 48px;
  font-weight: 700;
  color: #e4e7ed;
}

.watched-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  background: #67c23a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.ep-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin: 0 0 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ep-meta {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

.file-tag {
  margin-top: 8px;
}

/* 剧集列表 */
.episodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.episode-list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.episode-list-item:hover {
  background: #e4e7ed;
}

.episode-list-item.is-watched {
  background: #f0f9ff;
}

.list-ep-number {
  width: 48px;
  height: 48px;
  background: #fff;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 700;
  color: #606266;
  flex-shrink: 0;
}

.list-ep-info {
  flex: 1;
}

.list-ep-info h4 {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
  margin: 0 0 6px;
}

.list-ep-info p {
  font-size: 13px;
  color: #909399;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.list-ep-status {
  flex-shrink: 0;
}

/* 简介标签页 */
.summary-card {
  margin-bottom: 24px;
}

.full-summary {
  font-size: 15px;
  line-height: 1.8;
  color: #606266;
  margin: 0;
}

.detail-info {
  margin-bottom: 24px;
}

.detail-tags {
  margin-top: 24px;
}

.detail-tags h3 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* 播放器弹窗 */
.player-dialog :deep(.el-dialog__body) {
  padding: 40px;
}

.player-placeholder {
  aspect-ratio: 16/9;
  background: #303133;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  gap: 16px;
}

.player-placeholder .sub-text {
  font-size: 14px;
  opacity: 0.6;
  margin: 0;
}

.player-controls {
  display: flex;
  justify-content: center;
  gap: 16px;
}

@media (max-width: 768px) {
  .detail-hero {
    flex-direction: column;
  }
  
  .hero-cover,
  .hero-cover-placeholder {
    width: 100%;
    height: 200px;
  }
  
  .hero-info h1 {
    font-size: 24px;
  }
  
  .episodes-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>