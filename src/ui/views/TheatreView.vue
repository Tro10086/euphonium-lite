<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Anime, Episode } from '@/models/Anime';
import type { VideoFile } from '@/models/File';
import type { TipTapJSON } from '@/models/Note';
import { animeAPI, episodeAPI, fileAPI } from '@/services/storage';
import { createPlaybackUrl, revokePlaybackUrl } from '@/services/playback';
import { attachmentAPI, notesAPI } from '@/services/notes';
import { uiState } from '@/ui/stores/uiState';
import {
  Play, PlayCircle, Star, Maximize, Pause,
  Volume2, VolumeX, ChevronDown, Heart, SkipBack, SkipForward
} from 'lucide-vue-next';

const route = useRoute();
const videoRef = ref<HTMLVideoElement | null>(null);
const realAnime = ref<Anime | null>(null);
const realEpisodes = ref<Episode[]>([]);
const filesByEpisode = ref<Record<string, VideoFile[]>>({});
const isLoading = ref(false);
const playbackError = ref('');
const videoUrl = ref('');
const noteId = ref<string | null>(null);
const noteText = ref('');
const noteAttachmentIds = ref<string[]>([]);
const noteMessage = ref('');

const hasRealData = computed(() => Boolean(realAnime.value));
const uniqueTags = (tags: string[] | undefined) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
const media = computed(() => {
  if (!realAnime.value) {
    return {
      id: String(route.params.id ?? ''),
      title: '未找到馆藏条目',
      meta: '',
      year: '',
      episodes: 0,
      score: 0,
      tags: ['本地库'],
      desc: '请先在导入页扫描并确认本地媒体。',
      image: '',
      episodesList: [],
    };
  }

  return {
    id: realAnime.value.id,
    title: realAnime.value.name_cn || realAnime.value.name || '未命名条目',
    year: realAnime.value.air_year || (realAnime.value.date ? Number(realAnime.value.date.slice(0, 4)) : ''),
    episodes: realAnime.value.total_episodes || realEpisodes.value.length,
    score: realAnime.value.bangumi_score || realAnime.value.rating || 0,
    tags: uniqueTags(realAnime.value.tags),
    desc: realAnime.value.summary || '暂无简介',
    image: realAnime.value.cover || '',
    episodesList: realEpisodes.value.map((ep) => ep.name_cn || ep.name || `第 ${ep.ep} 集`),
  };
});

const episodeRows = computed(() => {
  if (!hasRealData.value) return [];

  return realEpisodes.value.map((ep) => ({
    id: ep.id,
    title: ep.name_cn || ep.name || `第 ${ep.ep} 集`,
    ep: ep.ep,
    progress: ep.watch_percentage || 0,
  }));
});
const activeEpisodeIdx = ref(0);
const rating = ref(0);
const isFavorited = ref(false);

// Player State
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const volume = ref(80);
const isMuted = ref(false);
const currentSourceIdx = ref(0);
const isSeeking = ref(false);
const isSourcePickerOpen = ref(false);

const activeEpisode = computed(() => realEpisodes.value[activeEpisodeIdx.value] || null);
const currentFiles = computed(() => {
  const ep = activeEpisode.value;
  return ep ? filesByEpisode.value[ep.id] || [] : [];
});
const activeVideoFile = computed(() => currentFiles.value[currentSourceIdx.value] || null);
const noteTargetId = computed(() => activeEpisode.value?.id ?? realAnime.value?.id ?? '');
const noteTargetType = computed(() => (activeEpisode.value ? 'episode' : 'anime'));
const sourceOptions = computed(() => {
  if (!hasRealData.value) return ['暂无可播放文件'];
  return currentFiles.value.length ? currentFiles.value.map((file) => file.name) : ['暂无可播放文件'];
});
const progressPercent = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100));
});

const togglePlay = async () => {
  playbackError.value = '';

  if (!activeVideoFile.value) {
    playbackError.value = hasRealData.value
      ? '当前剧集没有关联本地视频文件。'
      : '请先导入并确认真实馆藏数据。';
    return;
  }

  const video = videoRef.value;
  if (!video) return;

  try {
    if (video.paused) await video.play();
    else video.pause();
  } catch {
    playbackError.value = 'Lite 暂不支持此视频格式、编码或浏览器拒绝播放。';
  }
};
const toggleMute = () => {
  isMuted.value = !isMuted.value;
  if (videoRef.value) videoRef.value.muted = isMuted.value;
};
const toggleSourcePicker = () => isSourcePickerOpen.value = !isSourcePickerOpen.value;

const formatTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0;
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const saveProgress = async () => {
  if (!hasRealData.value || !realAnime.value || !activeEpisode.value) return;

  const position = Math.max(0, Math.floor(currentTime.value));
  const total = Math.max(0, Math.floor(duration.value));
  const percentage = total > 0 ? Math.min(100, Math.round((position / total) * 100)) : 0;
  const now = new Date();

  await Promise.all([
    episodeAPI.update(activeEpisode.value.id, {
      duration_seconds: total || activeEpisode.value.duration_seconds,
      watch_progress: position,
      watch_percentage: percentage,
      watched: percentage >= 90,
      watched_at: percentage >= 90 ? now : activeEpisode.value.watched_at,
    }),
    animeAPI.update(realAnime.value.id, {
      last_watched_episode: activeEpisode.value.ep,
      last_watched_position: position,
      last_watched_at: now,
      status: 'watching',
    }),
  ]);

  const idx = activeEpisodeIdx.value;
  const ep = realEpisodes.value[idx];
  if (ep) {
    realEpisodes.value[idx] = {
      ...ep,
      duration_seconds: total || ep.duration_seconds,
      watch_progress: position,
      watch_percentage: percentage,
      watched: percentage >= 90,
      watched_at: percentage >= 90 ? now : ep.watched_at,
      updated_at: now,
    };
  }
  realAnime.value = {
    ...realAnime.value,
    last_watched_episode: activeEpisode.value.ep,
    last_watched_position: position,
    last_watched_at: now,
    status: 'watching',
    updated_at: now,
  };
};

function textToTipTapJson(text: string, attachmentIds: string[]): TipTapJSON {
  const paragraphs: TipTapJSON[] = text
    .split('\n')
    .map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    }));

  const images: TipTapJSON[] = attachmentIds.map((attachmentId) => ({
    type: 'image',
    attrs: { attachmentId },
  }));

  return {
    type: 'doc',
    content: [...paragraphs, ...images],
  };
}

function plainTextFromTipTapJson(json: TipTapJSON): string {
  const lines: string[] = [];
  const walk = (node: TipTapJSON) => {
    if (node.type === 'paragraph') {
      lines.push((node.content ?? []).map((child) => child.text ?? '').join(''));
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return lines.join('\n').trim();
}

async function loadNote() {
  noteMessage.value = '';
  noteId.value = null;
  noteText.value = '';
  noteAttachmentIds.value = [];
  const targetId = noteTargetId.value;
  if (!targetId) return;

  const notes = await notesAPI.getByTarget(noteTargetType.value, targetId);
  const note = notes[0];
  if (!note) return;

  noteId.value = note.id;
  noteText.value = note.plainText || plainTextFromTipTapJson(note.tiptapJson);
  noteAttachmentIds.value = [...note.attachmentIds];
}

async function saveNote(message = '笔记已保存') {
  const targetId = noteTargetId.value;
  if (!targetId) return;
  if (!noteId.value && !noteText.value.trim() && noteAttachmentIds.value.length === 0) return;

  noteId.value = await notesAPI.save({
    id: noteId.value ?? undefined,
    targetType: noteTargetType.value,
    targetId,
    tiptapJson: textToTipTapJson(noteText.value, noteAttachmentIds.value),
    plainText: noteText.value,
    attachmentIds: [...noteAttachmentIds.value],
  });
  noteMessage.value = message;
}

const toggleFavorite = async () => {
  if (!realAnime.value) return;

  const nextValue = !isFavorited.value;
  await animeAPI.update(realAnime.value.id, { is_favorite: nextValue });
  isFavorited.value = nextValue;
  realAnime.value = {
    ...realAnime.value,
    is_favorite: nextValue,
    updated_at: new Date(),
  };
  uiState.libraryVersion += 1;
};

function insertTimestampNote() {
  const seconds = Math.max(0, Math.floor(currentTime.value));
  const label = `[${formatTime(seconds)}]`;
  noteText.value = noteText.value ? `${noteText.value}\n${label} ` : `${label} `;
}

async function captureScreenshotNote() {
  const video = videoRef.value;
  if (!video || !video.videoWidth || !video.videoHeight) {
    noteMessage.value = '当前没有可截图的视频画面';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(video, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  if (!blob) {
    noteMessage.value = '截图生成失败';
    return;
  }

  await saveNote('笔记已保存，正在添加截图...');
  if (!noteId.value) return;

  const attachmentId = await attachmentAPI.put({
    noteId: noteId.value,
    name: `screenshot-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    blob,
  });
  noteAttachmentIds.value = [...noteAttachmentIds.value, attachmentId];
  await saveNote('截图已加入笔记');
}

let lastProgressSaveAt = 0;
const saveProgressThrottled = () => {
  const now = Date.now();
  if (now - lastProgressSaveAt < 5000) return;
  lastProgressSaveAt = now;
  void saveProgress();
};

const setEpisode = async (index: number) => {
  await saveProgress();
  await saveNote('笔记已自动保存');
  activeEpisodeIdx.value = index;
  if (!hasRealData.value) {
    currentTime.value = 0;
    duration.value = 0;
    isPlaying.value = false;
    return;
  }
  currentTime.value = realEpisodes.value[index]?.watch_progress || 0;
  duration.value = realEpisodes.value[index]?.duration_seconds || 0;
  currentSourceIdx.value = 0;
  isPlaying.value = false;
  playbackError.value = '';
  await loadNote();
};

const prevEpisode = () => {
  if (activeEpisodeIdx.value > 0) void setEpisode(activeEpisodeIdx.value - 1);
};

const nextEpisode = () => {
  if (activeEpisodeIdx.value < episodeRows.value.length - 1) {
    void setEpisode(activeEpisodeIdx.value + 1);
  }
};

const onProgressInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value);
  currentTime.value = val;
  if (videoRef.value) videoRef.value.currentTime = val;
};

const onProgressMouseDown = () => {
  isSeeking.value = true;
};

const onProgressMouseUp = () => {
  isSeeking.value = false;
  void saveProgress();
};

const toggleFullscreen = () => {
  const el = document.querySelector('.video-container');
  if (!document.fullscreenElement) {
    el?.requestFullscreen().catch(err => console.error(err));
  } else {
    void document.exitFullscreen();
  }
};

const loadPlaybackUrl = async () => {
  revokePlaybackUrl(videoUrl.value);
  videoUrl.value = '';
  playbackError.value = '';
  isPlaying.value = false;

  const file = activeVideoFile.value;
  if (!file) return;

  try {
    videoUrl.value = await createPlaybackUrl(file);
  } catch (error) {
    playbackError.value = error instanceof Error ? error.message : String(error);
  }
};

const loadTheatreData = async () => {
  isLoading.value = true;
  playbackError.value = '';
  revokePlaybackUrl(videoUrl.value);
  videoUrl.value = '';

  try {
    const animeId = String(route.params.id || '');
    const anime = await animeAPI.getById(animeId);

    if (!anime) {
      realAnime.value = null;
      realEpisodes.value = [];
      filesByEpisode.value = {};
      activeEpisodeIdx.value = 0;
      currentTime.value = 0;
      duration.value = 0;
      isFavorited.value = false;
      return;
    }

    const episodes = (await episodeAPI.getByAnimeId(anime.id)).sort(
      (a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep),
    );
    const fileIds = [...new Set(episodes.flatMap((ep) => ep.file_ids || []))];
    const files = fileIds.length ? await fileAPI.getByIds(fileIds) : [];
    const filesById = new Map(files.map((file) => [file.id, file]));

    realAnime.value = anime;
    isFavorited.value = Boolean(anime.is_favorite);
    realEpisodes.value = episodes;
    filesByEpisode.value = Object.fromEntries(
      episodes.map((ep) => [
        ep.id,
        (ep.file_ids || []).map((id) => filesById.get(id)).filter(Boolean) as VideoFile[],
      ]),
    );

    const resumeIdx = episodes.findIndex((ep) => ep.ep === anime.last_watched_episode);
    activeEpisodeIdx.value = Math.max(0, resumeIdx);
    currentSourceIdx.value = 0;
    currentTime.value =
      episodes[activeEpisodeIdx.value]?.watch_progress ||
      anime.last_watched_position ||
      0;
    duration.value = episodes[activeEpisodeIdx.value]?.duration_seconds || 0;
    await loadNote();
  } finally {
    isLoading.value = false;
  }
};

const onLoadedMetadata = () => {
  const video = videoRef.value;
  if (!video) return;

  duration.value = Number.isFinite(video.duration) ? video.duration : 0;
  const resumeAt = currentTime.value;
  if (resumeAt > 0 && resumeAt < duration.value) video.currentTime = resumeAt;
  video.volume = volume.value / 100;
  video.muted = isMuted.value;
};

const onTimeUpdate = () => {
  const video = videoRef.value;
  if (!video || isSeeking.value) return;

  currentTime.value = video.currentTime;
  if (Number.isFinite(video.duration)) duration.value = video.duration;
  saveProgressThrottled();
};

const onPlay = () => {
  isPlaying.value = true;
};

const onPause = () => {
  isPlaying.value = false;
  void saveProgress();
};

const onVideoError = () => {
  isPlaying.value = false;
  playbackError.value = 'Lite 暂不支持此视频格式或编码。若文件为 MKV/H.265，请使用浏览器支持的 MP4/H.264 或 WebM。';
};

onMounted(() => {
  void loadTheatreData();
});
onUnmounted(() => {
  void saveProgress();
  void saveNote('笔记已自动保存');
  revokePlaybackUrl(videoUrl.value);
});

watch(() => route.params.id, () => {
  void loadTheatreData();
});

watch([activeVideoFile, activeEpisodeIdx], () => {
  void loadPlaybackUrl();
});

watch(noteTargetId, () => {
  void loadNote();
});

watch(volume, (value) => {
  if (videoRef.value) videoRef.value.volume = value / 100;
});
</script>

<template>
  <div class="theatre-view">
    <div class="theatre-container">
      <!-- Video Player Section -->
      <section class="player-section">
        <div class="video-container group">
          <video
            v-if="videoUrl"
            ref="videoRef"
            :src="videoUrl"
            class="video-player"
            playsinline
            @loadedmetadata="onLoadedMetadata"
            @timeupdate="onTimeUpdate"
            @play="onPlay"
            @pause="onPause"
            @ended="onPause"
            @error="onVideoError"
          ></video>
          <img v-else-if="media.image" :src="media.image" :alt="media.title" class="video-placeholder" />
          <div v-else class="video-empty">暂无视频预览</div>
          <div class="video-overlay" @click="togglePlay"></div>
          <div v-if="playbackError" class="playback-error">{{ playbackError }}</div>
          <div v-else-if="isLoading" class="playback-status">加载中...</div>
          
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
                  :max="Math.max(duration, 1)"
                  :value="currentTime"
                  @input="onProgressInput"
                  @mousedown="onProgressMouseDown"
                  @mouseup="onProgressMouseUp"
                  @touchstart="onProgressMouseDown"
                  @touchend="onProgressMouseUp"
                  class="progress-slider"
                />
                <div class="progress-bar-bg">
                  <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
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
                  :disabled="activeEpisodeIdx === episodeRows.length - 1"
                  :class="{ disabled: activeEpisodeIdx === episodeRows.length - 1 }"
                >
                  <SkipForward :size="20" fill="currentColor" />
                </button>
                <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
              </div>
              
              <div class="controls-right">
                <div class="source-wrapper">
                  <button class="source-picker" @click="toggleSourcePicker">
                    <span>{{ sourceOptions[currentSourceIdx] }}</span>
                    <ChevronDown :size="14" />
                  </button>
                  <div v-if="isSourcePickerOpen" class="source-dropdown">
                    <button
                      v-for="(source, idx) in sourceOptions"
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
                @click="toggleFavorite"
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

          <section class="notes-panel">
            <header class="notes-header">
              <h3>剧集笔记</h3>
              <div class="notes-actions">
                <button class="note-tool" @click="insertTimestampNote">时间戳</button>
                <button class="note-tool" @click="captureScreenshotNote">截图</button>
                <button class="note-save" @click="saveNote()">保存</button>
              </div>
            </header>
            <textarea
              v-model="noteText"
              class="note-editor"
              placeholder="记录这集的分镜、台词、感想..."
            ></textarea>
            <footer class="notes-footer">
              <span v-if="noteAttachmentIds.length">附件 {{ noteAttachmentIds.length }} 个</span>
              <span v-if="noteMessage">{{ noteMessage }}</span>
            </footer>
          </section>
        </div>

        <!-- Episodes List -->
        <aside class="episodes-panel">
          <h3 class="panel-title">选集</h3>
          <div class="episodes-list">
            <button
              v-for="(ep, index) in episodeRows"
              :key="ep.id"
              class="episode-item"
              :class="{ active: activeEpisodeIdx === index }"
              @click="void setEpisode(index)"
            >
              <span class="ep-title">{{ ep.title }}</span>
              <span v-if="ep.progress" class="ep-progress">{{ ep.progress }}%</span>
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

.video-player {
  width: 100%;
  height: 100%;
  display: block;
  background: #000;
}

.video-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
}

.playback-error,
.playback-status {
  position: absolute;
  left: 24px;
  right: 24px;
  top: 24px;
  z-index: 25;
  padding: 12px 14px;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  line-height: 1.5;
  background: rgba(30, 30, 30, 0.72);
  backdrop-filter: blur(10px);
}

.playback-error {
  background: rgba(128, 24, 24, 0.78);
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

.notes-panel {
  margin-top: 32px;
  border-top: 1px solid var(--outline-variant);
  padding-top: 24px;
}

.notes-header,
.notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.notes-header h3 {
  font-size: 18px;
  font-weight: 700;
}

.notes-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-tool,
.note-save {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
}

.note-tool {
  color: var(--primary);
  background-color: var(--surface-low);
}

.note-save {
  color: white;
  background-color: var(--primary);
}

.note-editor {
  width: 100%;
  min-height: 180px;
  margin-top: 16px;
  padding: 16px;
  resize: vertical;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface);
  color: var(--on-surface);
  line-height: 1.6;
  outline: none;
}

.note-editor:focus {
  border-color: var(--primary);
}

.notes-footer {
  min-height: 24px;
  margin-top: 8px;
  color: var(--on-surface-variant);
  font-size: 12px;
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

.ep-progress {
  margin-right: 8px;
  font-size: 12px;
  color: var(--on-surface-variant);
  opacity: 0.7;
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
