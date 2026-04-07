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
              <div class="progress-fill" style="width: 45%"></div>
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

    <!-- 抽屉详情 -->
    <el-drawer
      v-model="drawerVisible"
      :title="selectedAnime?.name_cn || '番剧详情'"
      size="480px"
      :with-header="false"
      destroy-on-close
    >
      <div v-if="selectedAnime" class="drawer-content">
        <!-- 封面区 -->
        <div class="drawer-cover">
          <el-image
            v-if="selectedAnime.cover"
            :src="selectedAnime.cover"
            fit="cover"
          />
          <div v-else class="drawer-cover-placeholder">
            <el-icon :size="64"><VideoCamera /></el-icon>
          </div>
          <div class="drawer-play">
            <el-button type="primary" :icon="VideoPlay" circle size="large" />
          </div>
        </div>

        <!-- 信息区 -->
        <div class="drawer-info">
          <h2>{{ selectedAnime.name_cn }}</h2>
          <p class="original-name">{{ selectedAnime.name }}</p>
          
          <div class="info-tags">
            <el-tag :type="getStatusType(selectedAnime.status)">
              {{ getStatusText(selectedAnime.status) }}
            </el-tag>
            <span>{{ selectedAnime.total_episodes }} 集</span>
            <span v-if="selectedAnime.date">首播: {{ selectedAnime.date }}</span>
          </div>

          <!-- Bangumi 评分 -->
          <el-card v-if="selectedAnime.bangumi_score" class="score-card">
            <div class="score-display">
              <div class="score-number">{{ selectedAnime.bangumi_score }}</div>
              <div class="score-bar">
                <el-progress :percentage="selectedAnime.bangumi_score * 10" :show-text="false" :stroke-width="8" status="success" />
                <div class="score-label">Bangumi 评分</div>
              </div>
            </div>
          </el-card>

          <!-- 个人评分 -->
          <div class="rating-section">
            <span class="rating-label">我的评分:</span>
            <el-rate
              v-model="userRating"
              :max="10"
              show-score
              score-template="{value} 分"
              @change="rateAnime"
            />
          </div>

          <!-- 简介 -->
          <el-descriptions title="简介" :column="1" border>
            <el-descriptions-item>
              {{ selectedAnime.summary || '暂无简介' }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 标签 -->
          <div v-if="selectedAnime.tags?.length" class="tags-section">
            <h4>标签</h4>
            <div class="tag-list">
              <el-tag
                v-for="tag in selectedAnime.tags"
                :key="tag"
                class="clickable-tag"
              >
                #{{ tag }}
              </el-tag>
            </div>
          </div>

          <!-- 剧集列表 -->
          <el-divider />
          <div class="episodes-section">
            <div class="episodes-header">
              <h4>剧集 ({{ animeEpisodes.length }})</h4>
              <el-button v-if="animeEpisodes.length > 0" link type="primary" @click="markAllWatched">
                全部标记为已看
              </el-button>
            </div>
            
            <el-skeleton v-if="isLoadingEpisodes" :rows="3" animated />
            
            <el-empty v-else-if="animeEpisodes.length === 0" description="暂无剧集数据" />
            
            <div v-else class="episodes-list">
              <div
                v-for="ep in animeEpisodes"
                :key="ep.id"
                class="episode-item"
                @click="toggleEpisodeWatched(ep)"
              >
                <div class="episode-number">{{ ep.ep }}</div>
                <div class="episode-info">
                  <div class="episode-name">{{ ep.name_cn || ep.name || `第 ${ep.ep} 集` }}</div>
                  <div class="episode-meta">
                    <span v-if="ep.duration_seconds">{{ formatDuration(ep.duration_seconds) }}</span>
                    <span v-if="ep.airdate">{{ ep.airdate }}</span>
                    <el-tag v-if="ep.file_ids?.length" type="info" size="small">
                      {{ ep.file_ids.length }} 个文件
                    </el-tag>
                  </div>
                </div>
                <el-icon v-if="ep.watched" class="watched-icon" color="#67c23a"><CircleCheckFilled /></el-icon>
                <el-icon v-else class="unwatched-icon"><CircleCheck /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search, Menu, Grid, List, Loading, VideoCamera, VideoPlay,
  Filter, StarFilled, CircleCheck, CircleCheckFilled
} from '@element-plus/icons-vue'
import { animeAPI, episodeAPI } from '@/services/storage'
import type { Anime, Episode } from '@/models/Anime'
import { ElMessage } from 'element-plus'

const router = useRouter()

// 状态
const isLoading = ref(true)
const isLoadingEpisodes = ref(false)
const animeList = ref<Anime[]>([])
const animeEpisodes = ref<Episode[]>([])
const selectedAnime = ref<Anime | null>(null)
const drawerVisible = ref(false)
const searchQuery = ref('')
const viewMode = ref<'grid' | 'list'>('grid')
const userRating = ref(0)

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
  if (hrs > 0) {
    return `${hrs}h ${mins % 60}m`
  }
  return `${mins}m`
}

async function loadAnimeList() {
  isLoading.value = true
  try {
    animeList.value = await animeAPI.getAll()
  } catch (err) {
    console.error('加载番剧列表失败:', err)
    ElMessage.error('加载失败')
  } finally {
    isLoading.value = false
  }
}

async function openDrawer(anime: Anime) {
  selectedAnime.value = anime
  userRating.value = anime.rating || 0
  drawerVisible.value = true
  isLoadingEpisodes.value = true
  animeEpisodes.value = []
  
  try {
    animeEpisodes.value = await episodeAPI.getByAnimeId(anime.id)
    animeEpisodes.value.sort((a, b) => a.ep - b.ep)
  } catch (err) {
    console.error('加载剧集失败:', err)
    ElMessage.error('加载剧集失败')
  } finally {
    isLoadingEpisodes.value = false
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

async function toggleEpisodeWatched(episode: Episode) {
  try {
    await episodeAPI.update(episode.id, { watched: !episode.watched })
    episode.watched = !episode.watched
  } catch (err) {
    console.error('更新观看状态失败:', err)
    ElMessage.error('更新失败')
  }
}

async function markAllWatched() {
  if (!selectedAnime.value || animeEpisodes.value.length === 0) return
  
  try {
    await Promise.all(
      animeEpisodes.value.map(ep => 
        episodeAPI.update(ep.id, { watched: true })
      )
    )
    animeEpisodes.value.forEach(ep => ep.watched = true)
    ElMessage.success('已全部标记为已看')
  } catch (err) {
    console.error('批量标记失败:', err)
    ElMessage.error('标记失败')
  }
}

// 生命周期
onMounted(() => {
  loadAnimeList()
})
</script>

<style scoped>
/* 布局 */
.home-container {
  min-height: 100vh;
  background-color: #ffffff;
}

.nav-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: rgba(255, 255, 255, 0.8);
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

/* 工具栏 */
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

/* 加载状态 */
.loading-state {
  display: flex;
  justify-content: center;
  padding: 80px 0;
}

/* 网格视图 */
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

.status-tag,
.rating-tag {
  font-weight: 600;
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

/* 列表视图 */
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

/* 抽屉内容 */
.drawer-content {
  padding-bottom: 24px;
}

.drawer-cover {
  position: relative;
  aspect-ratio: 16/9;
  background: #303133;
  overflow: hidden;
}

.drawer-cover :deep(.el-image) {
  width: 100%;
  height: 100%;
  opacity: 0.9;
}

.drawer-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}

.drawer-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-info {
  padding: 24px;
}

.drawer-info h2 {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  margin: 0 0 8px;
  line-height: 1.3;
}

.original-name {
  font-size: 14px;
  color: #909399;
  margin: 0 0 16px;
}

.info-tags {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.info-tags span {
  font-size: 13px;
  color: #606266;
}

.score-card {
  margin-bottom: 20px;
  background: #f5f7fa;
}

.score-display {
  display: flex;
  align-items: center;
  gap: 16px;
}

.score-number {
  font-size: 36px;
  font-weight: 700;
  color: #67c23a;
}

.score-bar {
  flex: 1;
}

.score-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.rating-section {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.rating-label {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.tags-section {
  margin-top: 20px;
}

.tags-section h4 {
  font-size: 14px;
  color: #303133;
  margin: 0 0 12px;
  font-weight: 600;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.clickable-tag {
  cursor: pointer;
}

.episodes-section {
  margin-top: 20px;
}

.episodes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.episodes-header h4 {
  font-size: 14px;
  color: #303133;
  margin: 0;
  font-weight: 600;
}

.episodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.episode-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.episode-item:hover {
  background-color: #f5f7fa;
}

.episode-number {
  width: 32px;
  height: 32px;
  background: #f5f7fa;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  flex-shrink: 0;
}

.episode-info {
  flex: 1;
  min-width: 0;
}

.episode-name {
  font-size: 14px;
  color: #303133;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.episode-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.watched-icon {
  font-size: 20px;
}

.unwatched-icon {
  font-size: 20px;
  color: #dcdfe6;
}

/* 响应式 */
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
}
</style>