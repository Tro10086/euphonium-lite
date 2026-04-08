<template>
  <div class="home-container">
    <!-- 顶部导航 -->
    <el-header class="nav-header">
      <div class="nav-content">
        <div class="logo-section">
          <div class="logo">E</div>
          <h1>Euphonium</h1>
        </div>
        <div class="nav-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索番剧..."
            :prefix-icon="Search"
            class="search-input"
            clearable
          />
          <el-button :icon="Menu" text />
        </div>
      </div>
    </el-header>

    <!-- 主内容区 -->
    <el-main class="main-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button label="grid">
            <el-icon><Grid /></el-icon> 网格
          </el-radio-button>
          <el-radio-button label="list">
            <el-icon><List /></el-icon> 列表
          </el-radio-button>
        </el-radio-group>
        
        <div class="toolbar-info">
          <span>共 {{ filteredAnimeList.length }} 个番剧</span>
          <el-divider direction="vertical" />
          <el-button text size="small" :icon="Filter">筛选</el-button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-state">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      </div>

      <!-- 空状态 -->
      <el-empty
        v-else-if="filteredAnimeList.length === 0"
        description="暂无番剧数据，请先扫描文件夹"
      >
        <el-button type="primary" @click="$router.push('/test')">
          前往测试页面扫描
        </el-button>
      </el-empty>

      <!-- 网格视图 -->
      <div v-else-if="viewMode === 'grid'" class="anime-grid">
        <el-card
          v-for="anime in filteredAnimeList"
          :key="anime.id"
          class="anime-card"
          :body-style="{ padding: '0' }"
          shadow="hover"
          @click="openDrawer(anime)"
        >
          <div class="card-cover">
            <el-image
              v-if="anime.cover"
              :src="anime.cover"
              :alt="anime.name_cn"
              fit="cover"
              loading="lazy"
            />
            <div v-else class="cover-placeholder">
              <el-icon :size="48"><VideoCamera /></el-icon>
            </div>
            
            <div class="cover-overlay">
              <el-tag :type="getStatusType(anime.status)" effect="dark" size="small" class="status-tag">
                {{ getStatusText(anime.status) }}
              </el-tag>
              <el-tag v-if="anime.rating > 0" type="warning" effect="dark" size="small" class="rating-tag">
                {{ anime.rating }}
              </el-tag>
            </div>

            <div class="play-icon">
              <el-icon :size="24"><VideoPlay /></el-icon>
            </div>

            <div v-if="anime.status === 'watching'" class="progress-bar">
              <div class="progress-fill" :style="{ width: getWatchProgress(anime.id) + '%' }"></div>
            </div>
          </div>
          
          <div class="card-info">
            <h3 class="anime-title" :title="anime.name_cn || anime.name">
              {{ anime.name_cn || anime.name }}
            </h3>
            <div class="anime-meta">
              <span>{{ anime.total_episodes }} 集</span>
              <el-divider direction="vertical" />
              <span>Bangumi {{ anime.bangumi_score || 'N/A' }}</span>
            </div>
            <div v-if="anime.tags?.length" class="anime-tags">
              <el-tag
                v-for="tag in anime.tags.slice(0, 3)"
                :key="tag"
                size="small"
                effect="plain"
              >
                {{ tag }}
              </el-tag>
              <span v-if="anime.tags.length > 3" class="more-tags">+{{ anime.tags.length - 3 }}</span>
            </div>
          </div>
        </el-card>
      </div>

      <!-- 列表视图 -->
      <div v-else class="anime-list">
        <el-card
          v-for="anime in filteredAnimeList"
          :key="anime.id"
          class="list-item"
          shadow="never"
          @click="openDrawer(anime)"
        >
          <div class="list-content">
            <el-image
              v-if="anime.cover"
              :src="anime.cover"
              fit="cover"
              class="list-cover"
            />
            <div v-else class="list-cover-placeholder">
              <el-icon :size="24"><VideoCamera /></el-icon>
            </div>
            
            <div class="list-info">
              <div class="list-main">
                <h3 class="list-title">{{ anime.name_cn || anime.name }}</h3>
                <p class="list-subtitle">{{ anime.name }}</p>
                <div class="list-meta">
                  <el-tag :type="getStatusType(anime.status)" size="small">
                    {{ getStatusText(anime.status) }}
                  </el-tag>
                  <span>{{ anime.total_episodes }} 集</span>
                  <span v-if="anime.bangumi_score">Bangumi {{ anime.bangumi_score }}</span>
                </div>
              </div>
              <div v-if="anime.rating > 0" class="list-rating">
                <el-icon color="#f7ba2a"><StarFilled /></el-icon>
                <span>{{ anime.rating }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </el-main>

    <!-- 侧拉抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :with-header="false"
      size="420px"
      destroy-on-close
      class="preview-drawer"
    >
      <div v-if="selectedAnime" class="drawer-content">
        <!-- 沉浸式封面 -->
        <div class="immersive-cover">
          <el-image
            v-if="selectedAnime.cover"
            :src="selectedAnime.cover"
            fit="cover"
            class="cover-bg"
          />
          <div v-else class="cover-bg-placeholder">
            <el-icon :size="64"><VideoCamera /></el-icon>
          </div>
          <div class="cover-gradient"></div>
          <div class="cover-content">
            <h2 class="drawer-title">{{ selectedAnime.name_cn }}</h2>
            <p class="drawer-subtitle">{{ selectedAnime.name }}</p>
            <div class="drawer-meta">
              <el-tag :type="getStatusType(selectedAnime.status)" effect="dark" size="small">
                {{ getStatusText(selectedAnime.status) }}
              </el-tag>
              <span>{{ selectedAnime.total_episodes }} 集</span>
              <span v-if="selectedAnime.date">{{ selectedAnime.date }}</span>
            </div>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="drawer-body">
          <!-- Bangumi 评分 -->
          <div v-if="selectedAnime.bangumi_score" class="score-section">
            <div class="score-display">
              <span class="score-num">{{ selectedAnime.bangumi_score }}</span>
              <el-progress 
                :percentage="selectedAnime.bangumi_score * 10" 
                :stroke-width="6"
                :show-text="false"
                status="success"
                class="score-bar"
              />
              <span class="score-label">Bangumi</span>
            </div>
          </div>

          <!-- 个人评分 -->
          <div class="rating-section">
            <span class="section-label">我的评分</span>
            <el-rate
              v-model="userRating"
              :max="10"
              show-score
              score-template="{value}"
              @change="rateAnime"
            />
          </div>

          <!-- 简介（可展开） -->
          <div class="summary-section">
            <div class="summary-header">
              <span class="section-label">简介</span>
              <el-button 
                v-if="isSummaryLong" 
                link 
                type="primary" 
                size="small"
                @click="summaryExpanded = !summaryExpanded"
              >
                {{ summaryExpanded ? '收起' : '展开' }}
                <el-icon>
                  <ArrowUp v-if="summaryExpanded" />
                  <ArrowDown v-else />
                </el-icon>
              </el-button>
            </div>
            <p 
              class="summary-text" 
              :class="{ 'is-collapsed': !summaryExpanded && isSummaryLong }"
            >
              {{ selectedAnime.summary || '暂无简介' }}
            </p>
          </div>

          <!-- 标签 -->
          <div v-if="selectedAnime.tags?.length" class="tags-section">
            <span class="section-label">标签</span>
            <div class="tag-list">
              <el-tag
                v-for="tag in selectedAnime.tags"
                :key="tag"
                effect="plain"
                round
                size="small"
              >
                {{ tag }}
              </el-tag>
            </div>
          </div>

          <!-- 最近更新 -->
          <div v-if="recentEpisodes.length > 0" class="recent-section">
            <span class="section-label">最近更新</span>
            <div class="recent-list">
              <div 
                v-for="ep in recentEpisodes.slice(0, 3)" 
                :key="ep.id"
                class="recent-item"
              >
                <span class="recent-ep">第 {{ ep.ep }} 集</span>
                <span class="recent-name">{{ ep.name_cn || ep.name || '无标题' }}</span>
                <el-icon v-if="ep.watched" color="#67c23a"><CircleCheckFilled /></el-icon>
              </div>
            </div>
          </div>

          <!-- 操作按钮 -->
          <div class="action-section">
            <el-button type="primary" size="large" class="enter-btn" @click="enterDetail">
              <el-icon><ArrowRight /></el-icon>
              进入详情页
            </el-button>
            <el-button 
              v-if="selectedAnime.status === 'watching'" 
              type="success" 
              size="large"
              @click="continueWatching"
            >
              <el-icon><VideoPlay /></el-icon>
              继续观看
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import {
  Search, Menu, Grid, List, Loading, VideoCamera, VideoPlay,
  Filter, StarFilled, CircleCheckFilled, ArrowRight,
  ArrowUp, ArrowDown
} from '@element-plus/icons-vue'
import { animeAPI, episodeAPI } from '@/services/storage'
import type { Anime, Episode } from '@/models/Anime'

const router = useRouter()

// 状态
const isLoading = ref(true)
const animeList = ref<Anime[]>([])
const episodesMap = ref<Map<string, Episode[]>>(new Map())
const selectedAnime = ref<Anime | null>(null)
const drawerVisible = ref(false)
const searchQuery = ref('')
const viewMode = ref<'grid' | 'list'>('grid')
const userRating = ref(0)
const summaryExpanded = ref(false)

// 计算属性
const filteredAnimeList = computed(() => {
  if (!searchQuery.value) return animeList.value
  
  const query = searchQuery.value.toLowerCase()
  return animeList.value.filter(anime => 
    anime.name_cn?.toLowerCase().includes(query) ||
    anime.name?.toLowerCase().includes(query) ||
    anime.tags?.some(tag => tag.toLowerCase().includes(query))
  )
})

const isSummaryLong = computed(() => {
  return (selectedAnime.value?.summary?.length || 0) > 120
})

const recentEpisodes = computed(() => {
  if (!selectedAnime.value) return []
  const eps = episodesMap.value.get(selectedAnime.value.id) || []
  return eps.slice(-3).reverse()
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

function getWatchProgress(animeId: string): number {
  const eps = episodesMap.value.get(animeId) || []
  if (eps.length === 0) return 0
  const watched = eps.filter(e => e.watched).length
  return Math.round((watched / eps.length) * 100)
}

async function loadAnimeList() {
  isLoading.value = true
  try {
    animeList.value = await animeAPI.getAll()
    // 预加载所有剧集（用于计算进度）
    for (const anime of animeList.value) {
      const eps = await episodeAPI.getByAnimeId(anime.id)
      episodesMap.value.set(anime.id, eps)
    }
  } catch (err) {
    console.error('加载失败:', err)
    ElMessage.error('加载失败')
  } finally {
    isLoading.value = false
  }
}

async function openDrawer(anime: Anime) {
  selectedAnime.value = anime
  userRating.value = anime.rating || 0
  summaryExpanded.value = false
  drawerVisible.value = true
  
  // 确保有剧集数据
  if (!episodesMap.value.has(anime.id)) {
    const eps = await episodeAPI.getByAnimeId(anime.id)
    episodesMap.value.set(anime.id, eps)
  }
}

async function rateAnime(val: number) {
  if (!selectedAnime.value) return
  try {
    await animeAPI.update(selectedAnime.value.id, { rating: val })
    selectedAnime.value.rating = val
    ElMessage.success('评分已保存')
  } catch (err) {
    console.error('评分失败:', err)
    ElMessage.error('评分失败')
  }
}

function enterDetail() {
  if (!selectedAnime.value) return
  drawerVisible.value = false
  router.push(`/anime/${selectedAnime.value.id}`)
}

function continueWatching() {
  // 找到最近未看的集数，跳转播放
  const eps = episodesMap.value.get(selectedAnime.value?.id || '') || []
  const nextEp = eps.find(e => !e.watched) || eps[eps.length - 1]
  if (nextEp) {
    enterDetail()
    // 详情页内处理自动播放
  }
}

onMounted(() => {
  loadAnimeList()
})
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: #ffffff;
}

.nav-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid #e4e7ed;
  padding: 0;
  height: 64px;
}

.nav-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 32px;
  height: 32px;
  background-color: #000;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 14px;
}

.logo-section h1 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 280px;
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.toolbar-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 14px;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

.anime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
}

.anime-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.anime-card:hover {
  transform: translateY(-2px);
}

.card-cover {
  position: relative;
  aspect-ratio: 3/4;
  overflow: hidden;
  background-color: #f5f7fa;
}

.card-cover :deep(.el-image) {
  width: 100%;
  height: 100%;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.cover-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
}

.play-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  background: rgba(0, 0, 0, 0.2);
}

.play-icon .el-icon {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #303133;
}

.anime-card:hover .play-icon {
  opacity: 1;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(0, 0, 0, 0.3);
}

.progress-fill {
  height: 100%;
  background: #f56c6c;
}

.card-info {
  padding: 16px;
}

.anime-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.anime-meta {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
}

.anime-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.more-tags {
  font-size: 12px;
  color: #c0c4cc;
}

.anime-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-item {
  cursor: pointer;
  transition: border-color 0.2s;
}

.list-item:hover {
  border-color: #c0c4cc;
}

.list-content {
  display: flex;
  gap: 16px;
}

.list-cover {
  width: 120px;
  height: 80px;
  border-radius: 4px;
  flex-shrink: 0;
}

.list-cover-placeholder {
  width: 120px;
  height: 80px;
  border-radius: 4px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  flex-shrink: 0;
}

.list-info {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.list-main {
  flex: 1;
}

.list-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 4px;
}

.list-subtitle {
  font-size: 13px;
  color: #909399;
  margin: 0 0 8px;
}

.list-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #606266;
}

.list-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #f7ba2a;
  font-weight: 600;
}

/* 侧拉抽屉样式 */
.preview-drawer :deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
}

.drawer-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.immersive-cover {
  position: relative;
  height: 280px;
  flex-shrink: 0;
  overflow: hidden;
}

.cover-bg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-bg-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.cover-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, transparent 100%);
}

.cover-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24px;
  color: #fff;
}

.drawer-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 8px;
  line-height: 1.3;
  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.drawer-subtitle {
  font-size: 14px;
  opacity: 0.8;
  margin: 0 0 12px;
}

.drawer-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.drawer-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-section {
  margin-bottom: 20px;
}

.score-display {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 12px;
}

.score-num {
  font-size: 32px;
  font-weight: 700;
  color: #67c23a;
}

.score-bar {
  flex: 1;
}

.score-label {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.summary-section {
  margin-bottom: 20px;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.summary-text {
  font-size: 14px;
  line-height: 1.7;
  color: #606266;
  margin: 0;
}

.summary-text.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tags-section {
  margin-bottom: 20px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.recent-section {
  margin-bottom: 20px;
}

.recent-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 13px;
}

.recent-ep {
  font-weight: 600;
  color: #303133;
  min-width: 60px;
}

.recent-name {
  flex: 1;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-section {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}

.enter-btn {
  flex: 1;
}

@media (max-width: 768px) {
  .search-input {
    width: 180px;
  }
  
  .anime-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  
  .list-content {
    flex-direction: column;
  }
  
  .list-cover,
  .list-cover-placeholder {
    width: 100%;
    height: 160px;
  }
  
  .immersive-cover {
    height: 240px;
  }
}
</style>