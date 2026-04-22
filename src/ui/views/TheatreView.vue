<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { mockStore } from '@/ui/stores/mockData';
import { 
  Play, PlayCircle, BookmarkPlus, Star, Maximize, Pause, 
  Volume2, VolumeX, ChevronDown, Heart, SkipBack, SkipForward 
} from 'lucide-vue-next';

const route = useRoute();
const media = computed(() => {
  const id = Number(route.params.id);
  const found = mockStore.collections.find(item => item.id === id);
  return found || mockStore.collections[0];
});
const activeEpisodeIdx = ref(0);
const rating = ref(0);
const isFavorited = ref(false);

// Player State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(5400); // 1h 30m in seconds
const volume = ref(80);
const isMuted = ref(false);
const currentSourceIdx = ref(0);
const sources = ['源 1', '源 2', '4K 高清'];
const isSeeking = ref(false);
const isSourcePickerOpen = ref(false);

const togglePlay = () => isPlaying.value = !isPlaying.value;
const toggleMute = () => isMuted.value = !isMuted.value;
const toggleSourcePicker = () => isSourcePickerOpen.value = !isSourcePickerOpen.value;

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const setEpisode = (index: number) => {
  activeEpisodeIdx.value = index;
  currentTime.value = 0;
  isPlaying.value = true;
};

const prevEpisode = () => {
  if (activeEpisodeIdx.value > 0) setEpisode(activeEpisodeIdx.value - 1);
};

const nextEpisode = () => {
  if (activeEpisodeIdx.value < media.value.episodesList.length - 1) {
    setEpisode(activeEpisodeIdx.value + 1);
  }
};

const onProgressInput = (e: Event) => {
  const val = (e.target as HTMLInputElement).value;
  currentTime.value = parseInt(val);
};

const onProgressMouseDown = () => {
  isSeeking.value = true;
};

const onProgressMouseUp = () => {
  isSeeking.value = false;
};

const toggleFullscreen = () => {
  const el = document.querySelector('.video-container');
  if (!document.fullscreenElement) {
    el?.requestFullscreen().catch(err => console.error(err));
  } else {
    document.exitFullscreen();
  }
};

// Mock progress timer
let timer: any;
onMounted(() => {
  timer = setInterval(() => {
    if (isPlaying.value && !isSeeking.value && currentTime.value < duration.value) {
      currentTime.value += 1;
    }
  }, 1000);
});
onUnmounted(() => clearInterval(timer));

watch(() => route.params.id, () => {
  activeEpisodeIdx.value = 0;
  currentTime.value = 0;
  isPlaying.value = false;
});
</script>

<template>
  <div class="theatre-view">
    <div class="theatre-container">
      <!-- Video Player Section -->
      <section class="player-section">
        <div class="video-container group">
          <img :src="media.image" :alt="media.title" class="video-placeholder" />
          <div class="video-overlay" @click="togglePlay"></div>
          
          <!-- Play Button Overlay -->
          <button v-if="!isPlaying" class="master-play-btn-circular" @click="togglePlay">
            <Play :size="40" fill="currentColor" />
          </button>

          <!-- Controls Bar -->
          <div class="video-controls">
            <div class="controls-top">
              <div class="progress-container">
                <input 
                  type="range" 
                  min="0" 
                  :max="duration" 
                  :value="currentTime" 
                  @input="onProgressInput"
                  @mousedown="onProgressMouseDown"
                  @mouseup="onProgressMouseUp"
                  @touchstart="onProgressMouseDown"
                  @touchend="onProgressMouseUp"
                  class="progress-slider"
                />
                <div class="progress-bar-bg">
                  <div class="progress-fill" :style="{ width: (currentTime / duration) * 100 + '%' }"></div>
                </div>
              </div>
            </div>
            
            <div class="controls-bottom">
              <div class="controls-left">
                <button 
                  class="control-icon" 
                  @click="prevEpisode"
                  :disabled="activeEpisodeIdx === 0"
                  :class="{ disabled: activeEpisodeIdx === 0 }"
                >
                  <SkipBack :size="20" fill="currentColor" />
                </button>
                <button class="control-icon play-pause" @click="togglePlay">
                  <Play v-if="!isPlaying" :size="24" fill="currentColor" />
                  <Pause v-else :size="24" fill="currentColor" />
                </button>
                <button 
                  class="control-icon" 
                  @click="nextEpisode"
                  :disabled="activeEpisodeIdx === media.episodesList.length - 1"
                  :class="{ disabled: activeEpisodeIdx === media.episodesList.length - 1 }"
                >
                  <SkipForward :size="20" fill="currentColor" />
                </button>
                <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
              </div>
              
              <div class="controls-right">
                <div class="source-wrapper">
                  <button class="source-picker" @click="toggleSourcePicker">
                    <span>{{ sources[currentSourceIdx] }}</span>
                    <ChevronDown :size="14" />
                  </button>
                  <div v-if="isSourcePickerOpen" class="source-dropdown">
                    <button 
                      v-for="(source, idx) in sources" 
                      :key="idx"
                      @click="currentSourceIdx = idx; isSourcePickerOpen = false"
                      :class="{ active: currentSourceIdx === idx }"
                    >{{ source }}</button>
                  </div>
                </div>
                
                <div class="volume-container">
                  <button class="control-icon" @click="toggleMute">
                    <Volume2 v-if="!isMuted" :size="20" />
                    <VolumeX v-else :size="20" />
                  </button>
                  <div class="volume-slider-wrap">
                    <input type="range" v-model="volume" min="0" max="100" class="volume-slider" />
                  </div>
                </div>
                
                <button class="control-icon" @click="toggleFullscreen">
                  <Maximize :size="20" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Info & Episodes Grid -->
      <div class="info-grid">
        <!-- Metadata Area -->
        <div class="metadata-area">
          <header class="media-header">
            <div class="title-wrap">
              <h1 class="media-title">{{ media.title }}</h1>
              <div class="tags">
                <span v-for="tag in media.tags" :key="tag" class="tag">{{ tag }}</span>
                <span class="meta-dot"></span>
                <span>{{ media.year }}</span>
                <span class="meta-dot"></span>
                <span>{{ media.episodes }} 集</span>
              </div>
            </div>
            <div class="score-wrap">
              <span class="score-value">{{ media.score }}</span>
              <span class="score-label">SCORE</span>
            </div>
          </header>

          <!-- NEW: Ratings & Favorite Section -->
          <div class="user-interaction-bar">
            <div class="favorite-action">
              <span class="interaction-text">收藏</span>
              <button 
                class="plain-heart-btn" 
                :class="{ active: isFavorited }"
                @click="isFavorited = !isFavorited"
              >
                <Heart :size="22" :fill="isFavorited ? '#c62828' : 'none'" :color="isFavorited ? '#c62828' : 'currentColor'" />
              </button>
            </div>
            <div class="rating-action">
              <span class="interaction-text">评分</span>
              <div class="stars-list">
                <button 
                  v-for="i in 5" 
                  :key="i"
                  @click="rating = i"
                  class="star-btn"
                >
                  <Star 
                    :size="20" 
                    :fill="i <= rating ? 'url(#star-gradient)' : 'none'" 
                    :color="i <= rating ? 'transparent' : 'currentColor'" 
                  />
                </button>
              </div>
              <!-- SVG Gradient definition for stars -->
              <svg width="0" height="0" class="absolute">
                <defs>
                  <linearGradient id="star-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:var(--primary);stop-opacity:1" />
                    <stop offset="100%" style="stop-color:var(--primary-container);stop-opacity:1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          <p class="media-desc">{{ media.desc }}</p>
        </div>

        <!-- Episodes List -->
        <aside class="episodes-panel">
          <h3 class="panel-title">选集</h3>
          <div class="episodes-list">
            <button 
              v-for="(ep, index) in media.episodesList" 
              :key="index"
              class="episode-item"
              :class="{ active: activeEpisodeIdx === index }"
              @click="setEpisode(index)"
            >
              <span class="ep-title">{{ ep }}</span>
              <PlayCircle v-if="activeEpisodeIdx === index" :size="16" class="active-dot-icon" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theatre-view {
  min-height: 100vh;
  padding-bottom: 64px;
}

.theatre-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Player Section */
.player-section {
  margin-bottom: 48px;
}

.video-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 32px 64px rgba(0,0,0,0.4);
}

.video-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}

.video-overlay {
  position: absolute;
  inset: 0;
  cursor: pointer;
  z-index: 5;
}

.master-play-btn-circular {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 80px;
  height: 80px;
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  color: white;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
  z-index: 10;
}

.master-play-btn-circular:hover {
  transform: translate(-50%, -50%) scale(1.1);
  background-color: rgba(255, 255, 255, 0.25);
}

.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  padding: 20px 32px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 20;
}

.video-container:hover .video-controls {
  opacity: 1;
}

.controls-top {
  margin-bottom: 12px;
}

.progress-container {
  position: relative;
  height: 4px;
  width: 100%;
}

.progress-bar-bg {
  width: 100%;
  height: 4px;
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: white;
  border-radius: 2px;
}

.progress-slider {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 20px;
  transform: translateY(-50%);
  appearance: none;
  background: transparent !important;
  cursor: pointer;
  z-index: 30;
  margin: 0;
}

/* Chrome/Safari Slider Thumb */
.progress-slider::-webkit-slider-thumb {
  appearance: none;
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
  border: none;
  transition: all 0.2s ease;
}

.progress-slider:hover::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  transform: scale(1);
}

/* Firefox Slider Thumb */
.progress-slider::-moz-range-thumb {
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
  border: none;
  transition: all 0.2s ease;
}

.progress-slider:hover::-moz-range-thumb {
  width: 16px;
  height: 16px;
}

.controls-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left, .controls-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-icon {
  color: white;
  opacity: 0.8;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-icon:hover {
  opacity: 1;
  color: white;
  transform: scale(1.1);
}

.control-icon.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  transform: none !important;
}

.control-icon.play-pause {
  background: transparent;
  width: 44px;
  height: 44px;
}

.time-display {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  font-family: 'JetBrains Mono', monospace;
  margin-left: 8px;
}

.source-wrapper {
  position: relative;
}

.source-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 6px 14px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.source-picker:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.source-dropdown {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 0;
  background-color: rgba(30, 30, 30, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  z-index: 40;
}

.source-dropdown button {
  padding: 8px 12px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
  text-align: left;
  transition: background 0.2s;
}

.source-dropdown button:hover {
  background: rgba(255,255,255,0.1);
}

.source-dropdown button.active {
  color: white;
  background: rgba(255, 255, 255, 0.15);
}

.volume-container {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.volume-slider-wrap {
  width: 0;
  overflow: hidden; /* Added hidden to fix thumb showing when collapsed */
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
}

.volume-container:hover .volume-slider-wrap {
  width: 80px; /* Adjusted back slightly for better fit */
  margin-left: 8px;
}

.volume-slider {
  width: 80px;
  height: 4px;
  appearance: none;
  background: rgba(255, 255, 255, 0.2) !important;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  background-image: linear-gradient(to right, white 0%, white v-bind('volume + "%"'), transparent v-bind('volume + "%"')) !important;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 2px 5px rgba(0,0,0,0.4);
  margin-top: -4px; /* Center dot on 4px track */
}

.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(0,0,0,0.4);
  border: none;
}

.volume-slider:hover::-webkit-slider-thumb {
  transform: scale(1.3);
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 64px;
}

@media (max-width: 1024px) {
  .info-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
}

.media-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.media-title {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -1px;
}

.tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 14px;
  color: var(--on-surface-variant);
  font-weight: 500;
}

.tag {
  background-color: var(--primary-light);
  color: var(--primary);
  opacity: 0.8;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
}

.meta-dot {
  width: 4px;
  height: 4px;
  background-color: var(--outline-variant);
  border-radius: 50%;
}

.score-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.score-value {
  font-size: 44px;
  font-weight: 800;
  color: var(--primary);
  line-height: 1;
}

.score-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--on-surface-variant);
  opacity: 0.6;
}

/* NEW Interaction Bar */
.user-interaction-bar {
  display: flex;
  align-items: center;
  gap: 40px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--outline-variant);
}

.favorite-action, .rating-action {
  display: flex;
  align-items: center;
  gap: 12px;
}

.interaction-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface-variant);
}

.plain-heart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant);
  transition: all 0.3s ease;
}

.plain-heart-btn:hover {
  transform: scale(1.1);
}

.stars-list {
  display: flex;
  gap: 4px;
}

.star-btn {
  transition: transform 0.2s;
  color: var(--on-surface-variant);
}

.star-btn:hover {
  transform: scale(1.2);
}

.media-desc {
  font-size: 16px;
  line-height: 1.7;
  color: var(--on-surface-variant);
}

/* Episodes Panel */
.episodes-panel {
  background-color: var(--surface);
  border-radius: 24px;
  padding: 32px;
  box-shadow: var(--shadow-ambient);
  height: fit-content;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 24px;
}

.episodes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.episode-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface-variant);
  transition: all 0.2s ease;
  text-align: left;
}

.episode-item:hover {
  background-color: var(--surface-low);
  color: var(--on-surface);
}

.episode-item.active {
  background-color: var(--surface-low);
  color: var(--primary);
}

.active-dot-icon {
  color: var(--primary); /* Restored to primary but maybe bold it or similar */
  filter: drop-shadow(0 0 5px var(--primary));
}

.ep-title {
  flex: 1;
}

/* Range input overrides */
input[type="range"] {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  appearance: none;
  background: transparent;
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}
</style>
