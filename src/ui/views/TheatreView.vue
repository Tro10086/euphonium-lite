<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Anime, Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import type { TipTapJSON } from '@/models/Note'
import { animeAPI, episodeAPI, fileAPI, libraryRootAPI } from '@/services/storage'
import { createPlaybackUrl, revokePlaybackUrl } from '@/services/playback'
import { attachmentAPI, notesAPI } from '@/services/notes'
import { uiState } from '@/ui/stores/uiState'
import {
  Play,
  PlayCircle,
  Star,
  Maximize,
  Pause,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Captions,
  CaptionsOff,
  Gauge,
  Heart,
  SkipBack,
  SkipForward,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const videoRef = ref<HTMLVideoElement | null>(null)
const playerSectionRef = ref<HTMLElement | null>(null)
const noteEditorRef = ref<HTMLTextAreaElement | null>(null)
const realAnime = ref<Anime | null>(null)
const realEpisodes = ref<Episode[]>([])
const filesByEpisode = ref<Record<string, VideoFile[]>>({})
const extraFiles = ref<VideoFile[]>([])
const isLoading = ref(false)
const playbackError = ref('')
const videoUrl = ref('')
const subtitleUrl = ref('')
const subtitleLabel = ref('')
const noteId = ref<string | null>(null)
const noteText = ref('')
const noteAttachmentIds = ref<string[]>([])
const noteMessage = ref('')
const noteAttachmentPreviews = ref<Array<{ id: string; name: string; url: string }>>([])

const hasRealData = computed(() => Boolean(realAnime.value))
const uniqueTags = (tags: string[] | undefined) =>
  Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)))
function pathLabel(path?: string) {
  return path?.split('/').filter(Boolean).at(-1) ?? ''
}
function extraVideoLabel(file: VideoFile) {
  return (
    file.extra_label ||
    pathLabel(file.extra_group_path) ||
    pathLabel(file.parent_path) ||
    '附加视频'
  )
}
type PlaybackMode = 'episode' | 'extra'
type PlaybackTarget = { mode: PlaybackMode; index: number }
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
    }
  }

  return {
    id: realAnime.value.id,
    title: realAnime.value.name_cn || realAnime.value.name || '未命名条目',
    year:
      realAnime.value.air_year ||
      (realAnime.value.date ? Number(realAnime.value.date.slice(0, 4)) : ''),
    episodes: realAnime.value.total_episodes || realEpisodes.value.length,
    score: realAnime.value.bangumi_score || realAnime.value.rating || 0,
    tags: uniqueTags(realAnime.value.tags),
    desc: realAnime.value.summary || '暂无简介',
    image: realAnime.value.cover || '',
    episodesList: realEpisodes.value.map((ep) => ep.name_cn || ep.name || `第 ${ep.ep} 集`),
  }
})

const allEpisodeRows = computed(() => {
  if (!hasRealData.value) return []

  return realEpisodes.value.map((ep) => ({
    id: ep.id,
    title: ep.name_cn || ep.name || '未命名',
    ep: ep.ep,
    progress: ep.watch_percentage || 0,
  }))
})
const episodeRows = computed(() =>
  allEpisodeRows.value
    .map((ep, originalIndex) => ({
      ...ep,
      originalIndex,
      fileCount: filesByEpisode.value[ep.id]?.length || 0,
    }))
    .filter((ep) => ep.fileCount > 0),
)
const activeEpisodeIdx = ref(0)
const activePlaybackMode = ref<PlaybackMode>('episode')
const activeListTab = ref<PlaybackMode>('episode')
const activeExtraIdx = ref(0)
const rating = ref(0)
const isFavorited = ref(false)

// Player State
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isMuted = ref(false)
const currentSourceIdx = ref(0)
const isSeeking = ref(false)
const isSourcePickerOpen = ref(false)
const isRatePickerOpen = ref(false)
const isInfoDrawerOpen = ref(false)
const isInfoPanelCollapsed = ref(false)
const isCompactTheatre = ref(false)
const isMediaDescExpanded = ref(false)
const showMediaDescToggle = ref(false)
const playerFrameWidth = ref('100%')
const mediaDescRef = ref<HTMLElement | null>(null)
const playerFrameStyle = computed(() => ({
  width: playerFrameWidth.value,
}))
let playerResizeObserver: ResizeObserver | null = null
const playbackRates = [2, 1.5, 1.25, 1, 0.75, 0.5]
const playbackRate = ref(1)
const noRenderableVideoMessage =
  '当前浏览器只解码出了声音，没有可显示的视频画面。通常是视频编码或封装不受原生播放器支持，请换用 H.264/AAC MP4 或 WebM，或先转码后播放。'
let shouldPlayOnReady = false
let videoFrameCheckTimer: number | null = null
let noteAutosaveTimer: number | null = null
let isHydratingNote = false
let progressAnimationFrame: number | null = null
let isAdvancingAfterEnded = false

const activeEpisode = computed(() => realEpisodes.value[activeEpisodeIdx.value] || null)
const activeExtraFile = computed(() => extraFiles.value[activeExtraIdx.value] || null)
const episodeCurrentFiles = computed(() => {
  const ep = activeEpisode.value
  return ep ? filesByEpisode.value[ep.id] || [] : []
})
const currentFiles = computed(() =>
  activePlaybackMode.value === 'extra'
    ? activeExtraFile.value
      ? [activeExtraFile.value]
      : []
    : episodeCurrentFiles.value,
)
const activeVideoFile = computed(() => currentFiles.value[currentSourceIdx.value] || null)
const noteTargetId = computed(() =>
  activePlaybackMode.value === 'extra'
    ? (activeExtraFile.value?.id ?? realAnime.value?.id ?? '')
    : (activeEpisode.value?.id ?? realAnime.value?.id ?? ''),
)
const noteTargetType = computed(() =>
  activePlaybackMode.value === 'extra' ? 'file' : activeEpisode.value ? 'episode' : 'anime',
)
const noteAttachmentPreviewById = computed(
  () => new Map(noteAttachmentPreviews.value.map((preview) => [preview.id, preview])),
)
const notePreviewHtml = computed(() =>
  renderNoteMarkdown(noteText.value, noteAttachmentPreviewById.value),
)
const sourceOptions = computed(() => {
  if (!hasRealData.value) return ['暂无可播放文件']
  return currentFiles.value.length
    ? currentFiles.value.map((file) => file.name)
    : ['暂无可播放文件']
})
const extraRows = computed(() =>
  extraFiles.value.map((file, index) => ({
    file,
    index,
    label: extraVideoLabel(file),
  })),
)
const progressPercent = computed(() => {
  if (!duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})
const progressTrackStyle = computed(() => ({
  '--progress-percent': `${progressPercent.value}%`,
}))
const volumePercent = computed(() => Math.min(100, Math.max(0, volume.value)))
const formatPlaybackRate = (rate: number) => `${Number.isInteger(rate) ? rate.toFixed(1) : rate}x`
const playbackRateLabel = computed(() => formatPlaybackRate(playbackRate.value))
const canPickSubtitle = computed(
  () => typeof window !== 'undefined' && 'showOpenFilePicker' in window,
)
const activeEpisodeRowIndex = computed(() =>
  episodeRows.value.findIndex((ep) => ep.originalIndex === activeEpisodeIdx.value),
)
const canGoPrevPlaybackItem = computed(() =>
  activePlaybackMode.value === 'episode'
    ? activeEpisodeRowIndex.value > 0
    : activeExtraIdx.value > 0,
)
const canGoNextPlaybackItem = computed(() =>
  activePlaybackMode.value === 'episode'
    ? activeEpisodeRowIndex.value >= 0 && activeEpisodeRowIndex.value < episodeRows.value.length - 1
    : activeExtraIdx.value >= 0 && activeExtraIdx.value < extraRows.value.length - 1,
)
const activeListEmptyText = computed(() =>
  activeListTab.value === 'episode' ? '暂无可播放选集' : '暂无附加视频',
)
const isInfoPanelVisible = computed(() =>
  isCompactTheatre.value ? isInfoDrawerOpen.value : !isInfoPanelCollapsed.value,
)
const infoPanelToggleLabel = computed(() =>
  isInfoPanelVisible.value ? 'Collapse info panel' : 'Expand info panel',
)
const theatreContainerClass = computed(() => ({
  'info-panel-collapsed': !isCompactTheatre.value && isInfoPanelCollapsed.value,
}))

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineText(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
}

function renderInlineNoteMarkdown(
  value: string,
  attachments: Map<string, { id: string; name: string; url: string }>,
) {
  const imagePattern = /!\[([^\]]*)\]\(attachment:([^)]+)\)/g
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = imagePattern.exec(value))) {
    parts.push(renderInlineText(value.slice(lastIndex, match.index)))
    const alt = match[1] ?? '截图'
    const attachmentId = match[2] ?? ''
    const attachment = attachments.get(attachmentId)
    if (attachment) {
      parts.push(
        `<img class="note-inline-image" src="${escapeHtml(attachment.url)}" alt="${escapeHtml(
          alt || attachment.name,
        )}" title="${escapeHtml(attachment.name)}" />`,
      )
    } else {
      parts.push(renderInlineText(match[0]))
    }
    lastIndex = match.index + match[0].length
  }

  parts.push(renderInlineText(value.slice(lastIndex)))
  return parts.join('')
}

function renderNoteMarkdown(
  markdown: string,
  attachments: Map<string, { id: string; name: string; url: string }>,
) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1]?.length ?? 1
      html.push(`<h${level}>${renderInlineNoteMarkdown(heading[2] ?? '', attachments)}</h${level}>`)
      continue
    }

    html.push(`<p>${renderInlineNoteMarkdown(line, attachments)}</p>`)
  }

  return html.join('\n')
}

const updatePlayerFrame = () => {
  const section = playerSectionRef.value
  if (!section) {
    playerFrameWidth.value = '100%'
    return
  }

  const { width, height } = section.getBoundingClientRect()
  if (width <= 0 || height <= 0) {
    playerFrameWidth.value = '100%'
    return
  }

  playerFrameWidth.value = `${Math.floor(Math.min(width, (height * 16) / 9))}px`
}

const updateTheatreMode = () => {
  isCompactTheatre.value =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1180px)').matches
}

const clearVideoFrameCheck = () => {
  if (videoFrameCheckTimer === null) return
  window.clearTimeout(videoFrameCheckTimer)
  videoFrameCheckTimer = null
}

const reportNoRenderableVideo = (video: HTMLVideoElement) => {
  if (playbackError.value === noRenderableVideoMessage) return

  video.pause()
  isPlaying.value = false
  playbackError.value = noRenderableVideoMessage
}

const checkRenderableVideoFrame = () => {
  const video = videoRef.value
  if (!video || !videoUrl.value || playbackError.value) return

  const hasLoadedMediaData = video.readyState >= 2
  const hasRenderableFrame = video.videoWidth > 0 && video.videoHeight > 0
  if (hasLoadedMediaData && !hasRenderableFrame) reportNoRenderableVideo(video)
}

const scheduleVideoFrameCheck = (delay = 1200) => {
  clearVideoFrameCheck()
  if (!videoUrl.value) return

  videoFrameCheckTimer = window.setTimeout(() => {
    videoFrameCheckTimer = null
    checkRenderableVideoFrame()
  }, delay)
}

const cancelProgressAnimation = () => {
  if (progressAnimationFrame === null) return
  window.cancelAnimationFrame(progressAnimationFrame)
  progressAnimationFrame = null
}

const syncPlaybackPosition = () => {
  const video = videoRef.value
  if (!video || isSeeking.value) return

  currentTime.value = video.currentTime
  if (Number.isFinite(video.duration)) duration.value = video.duration
}

const startProgressAnimation = () => {
  cancelProgressAnimation()

  const tick = () => {
    syncPlaybackPosition()
    progressAnimationFrame = window.requestAnimationFrame(tick)
  }

  progressAnimationFrame = window.requestAnimationFrame(tick)
}

const playWhenReadyIfRequested = async () => {
  if (!shouldPlayOnReady) return

  const video = videoRef.value
  if (!video) return

  shouldPlayOnReady = false
  try {
    await video.play()
    playbackError.value = ''
  } catch {
    playbackError.value = '浏览器阻止了自动播放，请手动点击播放。'
  }
}

const checkMediaDescriptionOverflow = () => {
  void nextTick(() => {
    const el = mediaDescRef.value
    if (!el) {
      showMediaDescToggle.value = false
      return
    }

    const wasExpanded = isMediaDescExpanded.value
    if (wasExpanded) el.classList.remove('is-expanded')
    showMediaDescToggle.value = el.scrollHeight > el.clientHeight + 2
    if (wasExpanded) el.classList.add('is-expanded')
  })
}

const toggleInfoPanel = () => {
  if (isCompactTheatre.value) {
    isInfoDrawerOpen.value = !isInfoDrawerOpen.value
    return
  }

  isInfoPanelCollapsed.value = !isInfoPanelCollapsed.value
  requestAnimationFrame(updatePlayerFrame)
}

const togglePlay = async () => {
  playbackError.value = ''

  if (!activeVideoFile.value) {
    playbackError.value = hasRealData.value
      ? '当前剧集没有关联本地视频文件。'
      : '请先导入并确认真实馆藏数据。'
    return
  }

  const video = videoRef.value
  if (!video) {
    shouldPlayOnReady = true
    return
  }

  try {
    if (video.paused) await video.play()
    else video.pause()
  } catch {
    playbackError.value = 'Lite 暂不支持此视频格式、编码或浏览器拒绝播放。'
  }
}
const toggleMute = () => {
  isMuted.value = !isMuted.value
  if (videoRef.value) videoRef.value.muted = isMuted.value
}
const toggleSourcePicker = () => {
  isSourcePickerOpen.value = !isSourcePickerOpen.value
  if (isSourcePickerOpen.value) isRatePickerOpen.value = false
}
const selectSource = (index: number) => {
  if (index === currentSourceIdx.value) {
    isSourcePickerOpen.value = false
    return
  }

  shouldPlayOnReady = isPlaying.value || Boolean(videoRef.value && !videoRef.value.paused)
  currentSourceIdx.value = index
  isSourcePickerOpen.value = false
}
const toggleRatePicker = () => {
  isRatePickerOpen.value = !isRatePickerOpen.value
  if (isRatePickerOpen.value) isSourcePickerOpen.value = false
}
const selectPlaybackRate = (rate: number) => {
  playbackRate.value = rate
  isRatePickerOpen.value = false
  if (videoRef.value) videoRef.value.playbackRate = rate
}

const setRating = async (value: number) => {
  rating.value = value
  if (!realAnime.value) return

  await animeAPI.update(realAnime.value.id, { rating: value })
  realAnime.value = {
    ...realAnime.value,
    rating: value,
    updated_at: new Date(),
  }
  uiState.libraryVersion += 1
}

const formatTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0
  const h = Math.floor(safeSeconds / 3600)
  const m = Math.floor((safeSeconds % 3600) / 60)
  const s = Math.floor(safeSeconds % 60)
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const clearSubtitle = () => {
  revokePlaybackUrl(subtitleUrl.value)
  subtitleUrl.value = ''
  subtitleLabel.value = ''
}

const clearNoteAttachmentPreviews = () => {
  for (const preview of noteAttachmentPreviews.value) URL.revokeObjectURL(preview.url)
  noteAttachmentPreviews.value = []
}

async function loadNoteAttachmentPreviews(ids: string[]) {
  clearNoteAttachmentPreviews()
  if (ids.length === 0) return

  const attachments = await attachmentAPI.getByIds(ids)
  noteAttachmentPreviews.value = attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: URL.createObjectURL(attachment.blob),
  }))
}

function clearNoteAutosaveTimer() {
  if (noteAutosaveTimer === null) return
  window.clearTimeout(noteAutosaveTimer)
  noteAutosaveTimer = null
}

async function getSubtitleStartDirectory(file: VideoFile) {
  if (!file.root_id) return null

  const root = await libraryRootAPI.getById(file.root_id)
  if (!root?.handle) return null

  let permission = await root.handle.queryPermission({ mode: 'read' })
  if (permission !== 'granted') {
    permission = await root.handle.requestPermission({ mode: 'read' })
  }
  if (permission !== 'granted') return null

  let directory = root.handle
  const segments = (file.parent_path ?? '').split('/').filter(Boolean)
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment)
  }

  return directory
}

function srtToVtt(text: string) {
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .filter((line, index) => !(index === 0 && /^\d+$/.test(line.trim())))
        .join('\n'),
    )
    .join('\n\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')

  return `WEBVTT\n\n${blocks}`
}

function assTimeToVtt(value: string) {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (!match) return ''

  const hours = Number.parseInt(match[1]!, 10)
  const minutes = Number.parseInt(match[2]!, 10)
  const seconds = Number.parseInt(match[3]!, 10)
  const milliseconds = Number.parseInt((match[4] ?? '0').padEnd(3, '0').slice(0, 3), 10)

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`
}

function splitAssFields(value: string, fieldCount: number) {
  if (fieldCount <= 1) return [value]

  const parts = value.split(',')
  if (parts.length <= fieldCount) return parts

  return [...parts.slice(0, fieldCount - 1), parts.slice(fieldCount - 1).join(',')]
}

function stripAssText(value: string) {
  return value
    .replace(/{[^}]*}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

function assToVtt(text: string) {
  const defaultFormat = [
    'layer',
    'start',
    'end',
    'style',
    'name',
    'marginl',
    'marginr',
    'marginv',
    'effect',
    'text',
  ]
  let eventFormat = defaultFormat
  const cues: string[] = []

  for (const rawLine of text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')) {
    const line = rawLine.trim()
    if (/^Format\s*:/i.test(line)) {
      eventFormat = line
        .replace(/^Format\s*:/i, '')
        .split(',')
        .map((field) => field.trim().toLowerCase())
      continue
    }

    if (!/^Dialogue\s*:/i.test(line)) continue

    const fields = splitAssFields(line.replace(/^Dialogue\s*:/i, '').trim(), eventFormat.length)
    const startIndex = eventFormat.indexOf('start')
    const endIndex = eventFormat.indexOf('end')
    const textIndex = eventFormat.indexOf('text')
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) continue

    const start = assTimeToVtt(fields[startIndex] ?? '')
    const end = assTimeToVtt(fields[endIndex] ?? '')
    const cueText = stripAssText(fields[textIndex] ?? '')
    if (!start || !end || !cueText) continue

    cues.push(`${start} --> ${end}\n${cueText}`)
  }

  if (!cues.length) throw new Error('无法解析 .ass/.ssa 字幕内容。')

  return `WEBVTT\n\n${cues.join('\n\n')}`
}

async function createSubtitleUrl(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'vtt') return URL.createObjectURL(file)
  if (ext === 'srt') {
    const vtt = srtToVtt(await file.text())
    return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
  }
  if (ext === 'ass' || ext === 'ssa') {
    const vtt = assToVtt(await file.text())
    return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
  }
  throw new Error('当前只支持 .vtt、.srt、.ass 和 .ssa 字幕。')
}

async function pickSubtitleFile() {
  if (!canPickSubtitle.value) {
    playbackError.value = '当前浏览器不支持从视频文件夹选择字幕'
    return
  }

  const file = activeVideoFile.value
  if (!file) return

  try {
    const startIn = await getSubtitleStartDirectory(file)
    if (!startIn) {
      playbackError.value = '无法定位视频所在文件夹'
      return
    }

    const handles = await window.showOpenFilePicker({
      multiple: false,
      startIn,
      types: [
        {
          description: '字幕文件',
          accept: {
            'text/vtt': ['.vtt'],
            'application/x-subrip': ['.srt'],
            'text/x-ssa': ['.ass', '.ssa'],
          },
        },
      ],
      excludeAcceptAllOption: false,
    })
    const handle = handles[0]
    if (!handle) return

    const subtitleFile = await handle.getFile()
    const url = await createSubtitleUrl(subtitleFile)
    clearSubtitle()
    subtitleUrl.value = url
    subtitleLabel.value = subtitleFile.name
    playbackError.value = ''

    await nextTick()
    const tracks = videoRef.value?.textTracks
    if (tracks?.length) tracks[tracks.length - 1]!.mode = 'showing'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    playbackError.value = error instanceof Error ? error.message : String(error)
  }
}

async function toggleSubtitle() {
  if (subtitleUrl.value) {
    clearSubtitle()
    return
  }

  await pickSubtitleFile()
}

const getRouteEpisodeId = () => {
  const value = route.query.episodeId
  return typeof value === 'string' ? value : ''
}

const getRouteStartSeconds = () => {
  const value = route.query.t
  const seconds = typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null
}

const goToAllNotes = () => {
  if (!realAnime.value) return
  void router.push({ name: 'notes', query: { animeId: realAnime.value.id } })
}

const saveProgress = async () => {
  if (activePlaybackMode.value === 'extra') return
  if (!hasRealData.value || !realAnime.value || !activeEpisode.value) return

  const position = Math.max(0, Math.floor(currentTime.value))
  const total = Math.max(0, Math.floor(duration.value))
  const percentage = total > 0 ? Math.min(100, Math.round((position / total) * 100)) : 0
  const now = new Date()
  const hasPlaybackPosition = position > 0 || percentage > 0

  await Promise.all([
    episodeAPI.update(activeEpisode.value.id, {
      duration_seconds: total || activeEpisode.value.duration_seconds,
      watch_progress: position,
      watch_percentage: percentage,
      watched: percentage >= 90,
      watched_at: percentage >= 90 ? now : activeEpisode.value.watched_at,
    }),
    hasPlaybackPosition
      ? animeAPI.update(realAnime.value.id, {
          last_watched_episode: activeEpisode.value.ep,
          last_watched_position: position,
          last_watched_at: now,
          status: 'watching',
        })
      : Promise.resolve(),
  ])

  const idx = activeEpisodeIdx.value
  const ep = realEpisodes.value[idx]
  if (ep) {
    realEpisodes.value[idx] = {
      ...ep,
      duration_seconds: total || ep.duration_seconds,
      watch_progress: position,
      watch_percentage: percentage,
      watched: percentage >= 90,
      watched_at: percentage >= 90 ? now : ep.watched_at,
      updated_at: now,
    }
  }
  if (hasPlaybackPosition) {
    realAnime.value = {
      ...realAnime.value,
      last_watched_episode: activeEpisode.value.ep,
      last_watched_position: position,
      last_watched_at: now,
      status: 'watching',
      updated_at: now,
    }
  }
}

function textToTipTapJson(text: string, attachmentIds: string[]): TipTapJSON {
  const imagePattern = /!\[([^\]]*)\]\(attachment:([^)]+)\)/g
  const attachmentIdSet = new Set(attachmentIds)
  const content: TipTapJSON[] = []

  for (const line of text.split('\n')) {
    let lastIndex = 0
    let match: RegExpExecArray | null
    imagePattern.lastIndex = 0

    while ((match = imagePattern.exec(line))) {
      const before = line.slice(lastIndex, match.index)
      if (before) content.push({ type: 'paragraph', content: [{ type: 'text', text: before }] })

      const attachmentId = match[2] ?? ''
      if (attachmentIdSet.has(attachmentId)) {
        content.push({ type: 'image', attrs: { attachmentId, alt: match[1] ?? '' } })
      } else {
        content.push({ type: 'paragraph', content: [{ type: 'text', text: match[0] }] })
      }
      lastIndex = match.index + match[0].length
    }

    const rest = line.slice(lastIndex)
    if (rest || !content.length) {
      content.push({ type: 'paragraph', content: rest ? [{ type: 'text', text: rest }] : [] })
    }
  }

  return {
    type: 'doc',
    content,
  }
}

function loadNote() {
  isHydratingNote = true
  clearNoteAutosaveTimer()
  noteMessage.value = ''
  noteId.value = null
  noteText.value = ''
  noteAttachmentIds.value = []
  clearNoteAttachmentPreviews()
  isHydratingNote = false
}

async function saveNote(message = '笔记已保存', force = false) {
  clearNoteAutosaveTimer()
  const targetId = noteTargetId.value
  if (!targetId) return
  if (!force && !noteId.value && !noteText.value.trim() && noteAttachmentIds.value.length === 0) {
    return
  }

  noteId.value = await notesAPI.save({
    id: noteId.value ?? undefined,
    targetType: noteTargetType.value,
    targetId,
    tiptapJson: textToTipTapJson(noteText.value, noteAttachmentIds.value),
    plainText: noteText.value,
    attachmentIds: [...noteAttachmentIds.value],
  })
  noteMessage.value = message
}

function scheduleNoteAutosave() {
  if (isHydratingNote) return
  if (!noteId.value && !noteText.value.trim() && noteAttachmentIds.value.length === 0) return

  clearNoteAutosaveTimer()
  noteAutosaveTimer = window.setTimeout(() => {
    noteAutosaveTimer = null
    void saveNote('笔记已自动保存')
  }, 1500)
}

async function flushNoteAutosave(message = '笔记已自动保存') {
  clearNoteAutosaveTimer()
  await saveNote(message)
}

const toggleFavorite = async () => {
  if (!realAnime.value) return

  const nextValue = !isFavorited.value
  await animeAPI.update(realAnime.value.id, { is_favorite: nextValue })
  isFavorited.value = nextValue
  realAnime.value = {
    ...realAnime.value,
    is_favorite: nextValue,
    updated_at: new Date(),
  }
  uiState.libraryVersion += 1
}

function insertTimestampNote() {
  const seconds = Math.max(0, Math.floor(currentTime.value))
  const label = `[${formatTime(seconds)}]`
  insertIntoNote(`${label} `)
}

function insertIntoNote(value: string) {
  const textarea = noteEditorRef.value
  if (!textarea) {
    noteText.value = noteText.value ? `${noteText.value}\n${value}` : value
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const prefix = noteText.value.slice(0, start)
  const suffix = noteText.value.slice(end)
  const separatorBefore = prefix && !prefix.endsWith('\n') ? '\n' : ''
  const separatorAfter = suffix && !suffix.startsWith('\n') ? '\n' : ''
  noteText.value = `${prefix}${separatorBefore}${value}${separatorAfter}${suffix}`

  void nextTick(() => {
    const cursor = start + separatorBefore.length + value.length
    textarea.focus()
    textarea.setSelectionRange(cursor, cursor)
  })
}

async function captureScreenshotNote() {
  const video = videoRef.value
  if (!video || !video.videoWidth || !video.videoHeight) {
    noteMessage.value = '当前没有可截图的视频画面'
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) return
  context.drawImage(video, 0, 0)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85)
  })
  if (!blob) {
    noteMessage.value = '截图生成失败'
    return
  }

  await saveNote('笔记已保存，正在添加截图...', true)
  if (!noteId.value) return

  const attachmentId = await attachmentAPI.put({
    noteId: noteId.value,
    name: `screenshot-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
    blob,
  })
  noteAttachmentIds.value = [...noteAttachmentIds.value, attachmentId]
  insertIntoNote(`![截图](attachment:${attachmentId})`)
  await loadNoteAttachmentPreviews(noteAttachmentIds.value)
  await saveNote('截图已加入笔记', true)
}

let lastProgressSaveAt = 0
const saveProgressThrottled = () => {
  const now = Date.now()
  if (now - lastProgressSaveAt < 5000) return
  lastProgressSaveAt = now
  void saveProgress()
}

const setEpisode = async (index: number, options: { autoplay?: boolean } = { autoplay: true }) => {
  if (!realEpisodes.value[index]) return
  if (activePlaybackMode.value === 'episode' && index === activeEpisodeIdx.value) return

  shouldPlayOnReady = options.autoplay ?? true
  await saveProgress()
  await flushNoteAutosave()
  activePlaybackMode.value = 'episode'
  activeListTab.value = 'episode'
  activeEpisodeIdx.value = index
  if (!hasRealData.value) {
    currentTime.value = 0
    duration.value = 0
    isPlaying.value = false
    shouldPlayOnReady = false
    return
  }
  currentTime.value = realEpisodes.value[index]?.watch_progress || 0
  duration.value = realEpisodes.value[index]?.duration_seconds || 0
  currentSourceIdx.value = 0
  isPlaying.value = false
  playbackError.value = ''
  await loadNote()
}

const setExtraFile = async (
  index: number,
  options: { autoplay?: boolean } = { autoplay: true },
) => {
  if (!extraFiles.value[index]) return
  if (activePlaybackMode.value === 'extra' && index === activeExtraIdx.value) return

  shouldPlayOnReady = options.autoplay ?? true
  await saveProgress()
  await flushNoteAutosave()
  activePlaybackMode.value = 'extra'
  activeListTab.value = 'extra'
  activeExtraIdx.value = index
  currentSourceIdx.value = 0
  currentTime.value = 0
  duration.value = 0
  isPlaying.value = false
  playbackError.value = ''
  await loadNote()
}

const getAdjacentPlaybackTarget = (direction: -1 | 1): PlaybackTarget | null => {
  if (activePlaybackMode.value === 'extra') {
    const targetIndex = activeExtraIdx.value + direction
    return extraFiles.value[targetIndex] ? { mode: 'extra', index: targetIndex } : null
  }

  const rowIndex = activeEpisodeRowIndex.value
  const target = episodeRows.value[rowIndex + direction]
  return target ? { mode: 'episode', index: target.originalIndex } : null
}

const setPlaybackTarget = (target: PlaybackTarget, options?: { autoplay?: boolean }) => {
  return target.mode === 'extra'
    ? setExtraFile(target.index, options)
    : setEpisode(target.index, options)
}

const prevPlaybackItem = () => {
  const target = getAdjacentPlaybackTarget(-1)
  if (target) void setPlaybackTarget(target)
}

const nextPlaybackItem = () => {
  const target = getAdjacentPlaybackTarget(1)
  if (target) void setPlaybackTarget(target)
}

const selectListTab = (tab: PlaybackMode) => {
  activeListTab.value = tab
}

const onProgressInput = (e: Event) => {
  const val = Number((e.target as HTMLInputElement).value)
  currentTime.value = val
  if (videoRef.value) videoRef.value.currentTime = val
}

const onProgressMouseDown = () => {
  isSeeking.value = true
}

const onProgressMouseUp = () => {
  isSeeking.value = false
  void saveProgress()
}

const toggleFullscreen = () => {
  const el = document.querySelector('.video-container')
  if (!document.fullscreenElement) {
    el?.requestFullscreen().catch((err) => console.error(err))
  } else {
    void document.exitFullscreen()
  }
}

const loadPlaybackUrl = async () => {
  clearVideoFrameCheck()
  revokePlaybackUrl(videoUrl.value)
  videoUrl.value = ''
  playbackError.value = ''
  isPlaying.value = false

  const file = activeVideoFile.value
  if (!file) {
    shouldPlayOnReady = false
    return
  }

  try {
    videoUrl.value = await createPlaybackUrl(file)
  } catch (error) {
    shouldPlayOnReady = false
    playbackError.value = error instanceof Error ? error.message : String(error)
  }
}

const loadTheatreData = async () => {
  isLoading.value = true
  playbackError.value = ''
  clearVideoFrameCheck()
  revokePlaybackUrl(videoUrl.value)
  videoUrl.value = ''

  try {
    const animeId = String(route.params.id || '')
    const anime = await animeAPI.getById(animeId)

    if (!anime) {
      realAnime.value = null
      realEpisodes.value = []
      filesByEpisode.value = {}
      extraFiles.value = []
      activePlaybackMode.value = 'episode'
      activeListTab.value = 'episode'
      activeExtraIdx.value = 0
      activeEpisodeIdx.value = 0
      currentTime.value = 0
      duration.value = 0
      isFavorited.value = false
      rating.value = 0
      return
    }

    const episodes = (await episodeAPI.getByAnimeId(anime.id)).sort(
      (a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep),
    )
    const fileIds = [...new Set(episodes.flatMap((ep) => ep.file_ids || []))]
    const [files, animeFiles] = await Promise.all([
      fileIds.length ? fileAPI.getByIds(fileIds) : Promise.resolve([]),
      fileAPI.getByAnimeId(anime.id),
    ])
    const filesById = new Map(files.map((file) => [file.id, file]))

    realAnime.value = anime
    isFavorited.value = Boolean(anime.is_favorite)
    rating.value = anime.rating || 0
    realEpisodes.value = episodes
    filesByEpisode.value = Object.fromEntries(
      episodes.map((ep) => [
        ep.id,
        (ep.file_ids || [])
          .map((id) => filesById.get(id))
          .filter((file): file is VideoFile => file !== undefined && file.media_kind !== 'extra'),
      ]),
    )
    extraFiles.value = animeFiles
      .filter((file) => file.media_kind === 'extra' && file.scan_state !== 'missing')
      .sort(
        (a, b) =>
          (a.extra_label || '').localeCompare(b.extra_label || '') || a.path.localeCompare(b.path),
      )

    const playableEpisodeIndexes = episodes
      .map((ep, index) => ({ index, fileCount: filesByEpisode.value[ep.id]?.length || 0 }))
      .filter((ep) => ep.fileCount > 0)
      .map((ep) => ep.index)
    const hasPlayableEpisode = playableEpisodeIndexes.length > 0
    const queryEpisodeId = getRouteEpisodeId()
    const queryEpisodeIdx = queryEpisodeId
      ? episodes.findIndex((ep) => ep.id === queryEpisodeId)
      : -1
    const resumeIdx = episodes.findIndex((ep) => ep.ep === anime.last_watched_episode)
    const preferredIdx = queryEpisodeIdx >= 0 ? queryEpisodeIdx : resumeIdx
    activeEpisodeIdx.value = playableEpisodeIndexes.includes(preferredIdx)
      ? preferredIdx
      : (playableEpisodeIndexes[0] ?? Math.max(0, preferredIdx))
    activePlaybackMode.value = hasPlayableEpisode
      ? 'episode'
      : extraFiles.value.length
        ? 'extra'
        : 'episode'
    activeListTab.value = activePlaybackMode.value
    activeExtraIdx.value = 0
    currentSourceIdx.value = 0
    currentTime.value =
      activePlaybackMode.value === 'episode'
        ? (getRouteStartSeconds() ??
          episodes[activeEpisodeIdx.value]?.watch_progress ??
          anime.last_watched_position ??
          0)
        : 0
    duration.value =
      activePlaybackMode.value === 'episode'
        ? episodes[activeEpisodeIdx.value]?.duration_seconds || 0
        : 0
    await loadNote()
  } finally {
    isLoading.value = false
  }
}

const onLoadedMetadata = () => {
  const video = videoRef.value
  if (!video) return

  duration.value = Number.isFinite(video.duration) ? video.duration : 0
  const resumeAt = currentTime.value
  if (resumeAt > 0 && resumeAt < duration.value) video.currentTime = resumeAt
  video.volume = volume.value / 100
  video.muted = isMuted.value
  video.playbackRate = playbackRate.value
  scheduleVideoFrameCheck()
  void playWhenReadyIfRequested()
}

const onLoadedData = () => {
  scheduleVideoFrameCheck(500)
}

const onTimeUpdate = () => {
  syncPlaybackPosition()
  saveProgressThrottled()
}

const onPlay = () => {
  isPlaying.value = true
  startProgressAnimation()
  scheduleVideoFrameCheck()
}

const onPause = () => {
  clearVideoFrameCheck()
  cancelProgressAnimation()
  syncPlaybackPosition()
  isPlaying.value = false
  if (!isAdvancingAfterEnded) void saveProgress()
}

const onEnded = () => {
  clearVideoFrameCheck()
  cancelProgressAnimation()
  syncPlaybackPosition()
  if (duration.value) currentTime.value = duration.value
  isPlaying.value = false
  isAdvancingAfterEnded = true

  const target = getAdjacentPlaybackTarget(1)
  void (async () => {
    try {
      if (target) await setPlaybackTarget(target, { autoplay: true })
      else await saveProgress()
    } finally {
      isAdvancingAfterEnded = false
    }
  })()
}

const onVideoError = () => {
  clearVideoFrameCheck()
  cancelProgressAnimation()
  shouldPlayOnReady = false
  isPlaying.value = false
  playbackError.value =
    'Lite 暂不支持此视频格式或编码。若文件为 MKV/H.265，请使用浏览器支持的 MP4/H.264 或 WebM。'
}

onMounted(() => {
  updateTheatreMode()
  void loadTheatreData()
  checkMediaDescriptionOverflow()
  requestAnimationFrame(updatePlayerFrame)
  if (playerSectionRef.value && typeof ResizeObserver !== 'undefined') {
    playerResizeObserver = new ResizeObserver(updatePlayerFrame)
    playerResizeObserver.observe(playerSectionRef.value)
  }
  window.addEventListener('resize', updatePlayerFrame)
  window.addEventListener('resize', updateTheatreMode)
  window.addEventListener('resize', checkMediaDescriptionOverflow)
})
onUnmounted(() => {
  void saveProgress()
  void flushNoteAutosave()
  clearVideoFrameCheck()
  cancelProgressAnimation()
  revokePlaybackUrl(videoUrl.value)
  clearSubtitle()
  clearNoteAttachmentPreviews()
  playerResizeObserver?.disconnect()
  window.removeEventListener('resize', updatePlayerFrame)
  window.removeEventListener('resize', updateTheatreMode)
  window.removeEventListener('resize', checkMediaDescriptionOverflow)
})

watch(
  () => [route.params.id, route.query.episodeId, route.query.t],
  () => {
    void loadTheatreData()
  },
)

watch(
  () => media.value.desc,
  () => {
    isMediaDescExpanded.value = false
    checkMediaDescriptionOverflow()
  },
)

watch([activeVideoFile, activeEpisodeIdx], () => {
  clearSubtitle()
  void loadPlaybackUrl()
})

watch(noteTargetId, () => {
  void loadNote()
})

watch(noteText, () => {
  scheduleNoteAutosave()
})

watch(volume, (value) => {
  if (videoRef.value) videoRef.value.volume = value / 100
})

watch(playbackRate, (value) => {
  if (videoRef.value) videoRef.value.playbackRate = value
})
</script>

<template>
  <div class="theatre-view">
    <div class="theatre-container" :class="theatreContainerClass">
      <!-- Video Player Section -->
      <section ref="playerSectionRef" class="player-section">
        <div class="video-container group" :style="playerFrameStyle">
          <video
            v-if="videoUrl"
            ref="videoRef"
            :src="videoUrl"
            class="video-player"
            playsinline
            @loadedmetadata="onLoadedMetadata"
            @loadeddata="onLoadedData"
            @timeupdate="onTimeUpdate"
            @play="onPlay"
            @pause="onPause"
            @ended="onEnded"
            @error="onVideoError"
          >
            <track
              v-if="subtitleUrl"
              kind="subtitles"
              srclang="zh"
              :label="subtitleLabel || '字幕'"
              :src="subtitleUrl"
              default
            />
          </video>
          <img
            v-else-if="media.image"
            :src="media.image"
            :alt="media.title"
            class="video-placeholder"
          />
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
              <div
                class="progress-container"
                :class="{ 'is-seeking': isSeeking }"
                :style="progressTrackStyle"
              >
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
                <div class="progress-bar-bg" aria-hidden="true">
                  <div class="progress-fill"></div>
                </div>
                <div class="progress-thumb" aria-hidden="true"></div>
              </div>
            </div>

            <div class="controls-bottom">
              <div class="controls-left">
                <button
                  class="control-icon"
                  @click="prevPlaybackItem"
                  :disabled="!canGoPrevPlaybackItem"
                  :class="{ disabled: !canGoPrevPlaybackItem }"
                >
                  <SkipBack :size="20" fill="currentColor" />
                </button>
                <button class="control-icon play-pause" @click="togglePlay">
                  <Play v-if="!isPlaying" :size="24" fill="currentColor" />
                  <Pause v-else :size="24" fill="currentColor" />
                </button>
                <button
                  class="control-icon"
                  @click="nextPlaybackItem"
                  :disabled="!canGoNextPlaybackItem"
                  :class="{ disabled: !canGoNextPlaybackItem }"
                >
                  <SkipForward :size="20" fill="currentColor" />
                </button>
                <span class="time-display"
                  >{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span
                >
              </div>

              <div class="controls-right">
                <div class="source-wrapper">
                  <button class="source-picker rate-picker" title="倍速" @click="toggleRatePicker">
                    <Gauge :size="14" />
                    <span>{{ playbackRateLabel }}</span>
                    <ChevronDown :size="14" />
                  </button>
                  <div v-if="isRatePickerOpen" class="source-dropdown rate-dropdown">
                    <button
                      v-for="rate in playbackRates"
                      :key="rate"
                      @click="selectPlaybackRate(rate)"
                      :class="{ active: playbackRate === rate }"
                    >
                      {{ formatPlaybackRate(rate) }}
                    </button>
                  </div>
                </div>

                <div class="source-wrapper">
                  <button class="source-picker" @click="toggleSourcePicker">
                    <span>{{ sourceOptions[currentSourceIdx] }}</span>
                    <ChevronDown :size="14" />
                  </button>
                  <div v-if="isSourcePickerOpen" class="source-dropdown">
                    <button
                      v-for="(source, idx) in sourceOptions"
                      :key="idx"
                      @click="selectSource(idx)"
                      :class="{ active: currentSourceIdx === idx }"
                    >
                      {{ source }}
                    </button>
                  </div>
                </div>

                <button
                  v-if="canPickSubtitle"
                  class="control-icon"
                  :class="{ active: Boolean(subtitleUrl) }"
                  :title="subtitleUrl ? '关闭字幕' : '加载字幕'"
                  @click="toggleSubtitle"
                >
                  <CaptionsOff v-if="subtitleUrl" :size="20" />
                  <Captions v-else :size="20" />
                </button>

                <div class="volume-container">
                  <button class="control-icon" @click="toggleMute">
                    <Volume2 v-if="!isMuted" :size="20" />
                    <VolumeX v-else :size="20" />
                  </button>
                  <div
                    class="volume-slider-wrap"
                    :style="{ '--volume-percent': volumePercent + '%' }"
                  >
                    <input
                      type="range"
                      v-model.number="volume"
                      min="0"
                      max="100"
                      class="volume-slider"
                    />
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
      <button
        class="drawer-toggle"
        :class="{ 'is-open': isInfoPanelVisible }"
        type="button"
        :aria-expanded="isInfoPanelVisible"
        :aria-label="infoPanelToggleLabel"
        :title="infoPanelToggleLabel"
        @click="toggleInfoPanel"
      >
        <ChevronRight v-if="isInfoPanelVisible" :size="20" />
        <ChevronLeft v-else :size="20" />
      </button>

      <section class="info-drawer" :class="{ open: isInfoDrawerOpen }">
        <div class="info-grid">
          <!-- Metadata Area -->
          <div class="metadata-area">
            <header class="media-header">
              <div class="title-wrap">
                <h1 class="media-title">{{ media.title }}</h1>
                <div v-if="media.tags.length" class="tags">
                  <span v-for="tag in media.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
                <div class="media-meta">
                  <span v-if="media.year">{{ media.year }}</span>
                  <span v-if="media.year && media.episodes" class="meta-dot"></span>
                  <span v-if="media.episodes">{{ media.episodes }} 集</span>
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
                  <Heart
                    :size="22"
                    :fill="isFavorited ? '#c62828' : 'none'"
                    :color="isFavorited ? '#c62828' : 'currentColor'"
                  />
                </button>
              </div>
              <div class="rating-action">
                <span class="interaction-text">评分</span>
                <div class="stars-list">
                  <button v-for="i in 5" :key="i" @click="setRating(i)" class="star-btn">
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
                      <stop offset="0%" style="stop-color: var(--primary); stop-opacity: 1" />
                      <stop
                        offset="100%"
                        style="stop-color: var(--primary-container); stop-opacity: 1"
                      />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>

            <div class="media-desc-wrap">
              <p
                ref="mediaDescRef"
                class="media-desc"
                :class="{ 'is-expanded': isMediaDescExpanded }"
              >
                {{ media.desc }}
              </p>
              <button
                v-if="showMediaDescToggle"
                class="media-desc-toggle"
                type="button"
                @click="isMediaDescExpanded = !isMediaDescExpanded"
              >
                {{ isMediaDescExpanded ? '收起' : '展开全部' }}
              </button>
            </div>

            <section class="notes-panel">
              <header class="notes-header">
                <h3>剧集笔记</h3>
                <div class="notes-actions">
                  <button class="note-tool" @click="goToAllNotes">全部笔记</button>
                  <button class="note-tool" @click="insertTimestampNote">时间戳</button>
                  <button class="note-tool" @click="captureScreenshotNote">截图</button>
                  <button class="note-save" @click="saveNote()">保存</button>
                </div>
              </header>
              <textarea
                ref="noteEditorRef"
                v-model="noteText"
                class="note-editor"
                placeholder="记录这集的分镜、台词、感想..."
              ></textarea>
              <article
                v-if="notePreviewHtml"
                class="note-preview"
                v-html="notePreviewHtml"
              ></article>
              <footer class="notes-footer">
                <span v-if="noteAttachmentIds.length">附件 {{ noteAttachmentIds.length }} 个</span>
                <span v-if="noteMessage">{{ noteMessage }}</span>
              </footer>
            </section>
          </div>

          <aside class="watch-list-panel">
            <div class="watch-list-tabs" role="tablist" aria-label="播放列表">
              <button
                class="watch-list-tab"
                :class="{ active: activeListTab === 'episode' }"
                type="button"
                role="tab"
                :aria-selected="activeListTab === 'episode'"
                @click="selectListTab('episode')"
              >
                <span>选集</span>
                <span class="tab-count">{{ episodeRows.length }}</span>
              </button>
              <button
                class="watch-list-tab"
                :class="{ active: activeListTab === 'extra' }"
                type="button"
                role="tab"
                :aria-selected="activeListTab === 'extra'"
                @click="selectListTab('extra')"
              >
                <span>附加视频</span>
                <span class="tab-count">{{ extraRows.length }}</span>
              </button>
            </div>

            <div class="watch-list-body">
              <div v-if="activeListTab === 'episode' && episodeRows.length" class="episodes-list">
                <button
                  v-for="ep in episodeRows"
                  :key="ep.id"
                  class="episode-item"
                  :class="{
                    active:
                      activePlaybackMode === 'episode' && activeEpisodeIdx === ep.originalIndex,
                  }"
                  @click="void setEpisode(ep.originalIndex)"
                >
                  <span class="ep-main">
                    <span class="ep-number">第 {{ ep.ep }} 集</span>
                    <span class="ep-title">{{ ep.title }}</span>
                  </span>
                  <span v-if="ep.progress" class="ep-progress">{{ ep.progress }}%</span>
                  <PlayCircle
                    v-if="activePlaybackMode === 'episode' && activeEpisodeIdx === ep.originalIndex"
                    :size="16"
                    class="active-dot-icon"
                  />
                </button>
              </div>

              <div v-else-if="activeListTab === 'extra' && extraRows.length" class="episodes-list">
                <button
                  v-for="row in extraRows"
                  :key="row.file.id"
                  class="episode-item extra-item"
                  :class="{
                    active: activePlaybackMode === 'extra' && activeExtraIdx === row.index,
                  }"
                  @click="void setExtraFile(row.index)"
                >
                  <span class="ep-main">
                    <span class="ep-number">{{ row.label }}</span>
                    <span class="ep-title">{{ row.file.name }}</span>
                  </span>
                  <PlayCircle
                    v-if="activePlaybackMode === 'extra' && activeExtraIdx === row.index"
                    :size="16"
                    class="active-dot-icon"
                  />
                </button>
              </div>

              <div v-else class="watch-list-empty">{{ activeListEmptyText }}</div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.theatre-view {
  min-height: calc(100vh - 108px);
  padding-bottom: 0;
}

.theatre-container {
  --info-panel-width: clamp(300px, 24vw, 360px);
  --drawer-handle-width: 20px;
  --drawer-handle-height: 58px;
  --drawer-handle-radius: 14px;
  --drawer-handle-offset: 27px;
  --volume-track-height: 4px;
  --volume-thumb-size: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--info-panel-width);
  gap: 24px;
  align-items: stretch;
  width: 100%;
  max-width: none;
  height: calc(100vh - 108px);
  min-height: 420px;
  margin: 0 auto;
}

.theatre-container.info-panel-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

/* Player Section */
.player-section {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  margin-bottom: 0;
}

.video-container {
  position: relative;
  flex: 0 1 auto;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  background-color: #000;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.4);
}

.video-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}

.video-player {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
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
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}

.progress-fill {
  width: var(--progress-percent);
  height: 100%;
  background-color: white;
  border-radius: inherit;
}

.progress-thumb {
  position: absolute;
  top: 50%;
  left: var(--progress-percent);
  width: 8px;
  height: 8px;
  pointer-events: none;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  transition:
    width 0.16s ease,
    height 0.16s ease;
  z-index: 25;
}

.progress-container:hover .progress-thumb,
.progress-container.is-seeking .progress-thumb {
  width: 16px;
  height: 16px;
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

.progress-slider::-webkit-slider-runnable-track {
  height: 20px;
  background: transparent;
}

.progress-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.progress-slider::-moz-range-track {
  height: 20px;
  background: transparent;
  border: 0;
}

.progress-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.controls-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left,
.controls-right {
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

.control-icon.active {
  opacity: 1;
  color: white;
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
  max-width: 220px;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 6px 14px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.source-picker span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-picker:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.rate-picker {
  max-width: none;
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
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
  background: rgba(255, 255, 255, 0.1);
}

.source-dropdown button.active {
  color: white;
  background: rgba(255, 255, 255, 0.15);
}

.rate-dropdown {
  min-width: 84px;
  max-height: 260px;
  overflow-y: auto;
}

.volume-container {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.volume-slider-wrap {
  width: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transition:
    width 0.24s ease,
    margin-left 0.24s ease,
    opacity 0.18s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.volume-container:hover .volume-slider-wrap {
  width: 84px;
  margin-left: 8px;
  overflow: visible;
  opacity: 1;
  pointer-events: auto;
}

.volume-slider {
  width: 72px;
  height: 18px;
  flex: 0 0 72px;
  appearance: none;
  margin: 0;
  background: transparent;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: var(--volume-thumb-size);
  height: var(--volume-thumb-size);
  background: white;
  border-radius: 50%;
  border: none;
  box-shadow: none;
  margin-top: calc((var(--volume-track-height) - var(--volume-thumb-size)) / 2);
}

.volume-slider::-webkit-slider-runnable-track {
  height: var(--volume-track-height);
  background: linear-gradient(
    to right,
    white 0%,
    white var(--volume-percent),
    rgba(255, 255, 255, 0.24) var(--volume-percent),
    rgba(255, 255, 255, 0.24) 100%
  );
  border-radius: 999px;
}

.volume-slider::-moz-range-track {
  height: var(--volume-track-height);
  background: rgba(255, 255, 255, 0.24);
  border-radius: 999px;
}

.volume-slider::-moz-range-progress {
  height: var(--volume-track-height);
  background: white;
  border-radius: 999px;
}

.volume-slider::-moz-range-thumb {
  width: var(--volume-thumb-size);
  height: var(--volume-thumb-size);
  background: white;
  border-radius: 50%;
  border: none;
  box-shadow: none;
}

/* Info Grid */
.drawer-toggle {
  position: fixed;
  top: 50%;
  right: calc(var(--info-panel-width) + var(--drawer-handle-offset));
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--drawer-handle-width);
  height: var(--drawer-handle-height);
  color: var(--on-surface);
  background-color: var(--surface);
  border: 1px solid var(--outline-variant);
  border-right: 0;
  border-radius: var(--drawer-handle-radius) 0 0 var(--drawer-handle-radius);
  opacity: 0.2;
  box-shadow: -8px 12px 28px rgba(0, 0, 0, 0.1);
  padding: 0;
  transform: translateY(-50%);
  transition:
    right 0.24s ease,
    color 0.2s ease,
    opacity 0.2s ease,
    border-radius 0.2s ease;
}

.drawer-toggle:hover {
  color: var(--primary);
  opacity: 1;
}

.theatre-container.info-panel-collapsed .drawer-toggle {
  right: 0;
  border-right: 0;
  border-left: 1px solid var(--outline-variant);
  border-radius: var(--drawer-handle-radius) 0 0 var(--drawer-handle-radius);
  box-shadow: -8px 12px 28px rgba(0, 0, 0, 0.1);
}

.info-drawer {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  padding-right: 4px;
  scrollbar-width: none;
}

.info-drawer::-webkit-scrollbar,
.episodes-list::-webkit-scrollbar {
  display: none;
}

.theatre-container.info-panel-collapsed .info-drawer {
  display: none;
}

.info-grid {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  height: 100%;
  min-height: 0;
}

.metadata-area {
  min-height: 0;
}

.media-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.media-title {
  font-size: clamp(24px, 2vw, 30px);
  font-weight: 800;
  line-height: 1.12;
  overflow-wrap: anywhere;
}

.tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.media-meta {
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
  font-size: 34px;
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
  flex-wrap: wrap;
  gap: 16px 24px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--outline-variant);
}

.favorite-action,
.rating-action {
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
  font-size: 14px;
  line-height: 1.65;
  color: var(--on-surface-variant);
  display: -webkit-box;
  margin: 0;
  overflow-wrap: anywhere;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.media-desc.is-expanded {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}

.media-desc-toggle {
  margin-top: 6px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.notes-panel {
  margin-top: 24px;
  border-top: 1px solid var(--outline-variant);
  padding-top: 20px;
}

.notes-header,
.notes-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.notes-header h3 {
  font-size: 16px;
  font-weight: 700;
}

.notes-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  min-height: 150px;
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

.note-preview {
  max-height: 220px;
  margin-top: 10px;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface-low);
  color: var(--on-surface);
  font-size: 13px;
  line-height: 1.6;
}

.note-preview :deep(p),
.note-preview :deep(h1),
.note-preview :deep(h2),
.note-preview :deep(h3) {
  margin: 0 0 10px;
}

.note-preview :deep(.note-inline-image) {
  display: block;
  max-width: min(100%, 260px);
  height: auto;
  margin: 8px 0;
  border: 1px solid var(--outline-variant);
  border-radius: 8px;
  background-color: var(--surface);
}

.notes-footer {
  min-height: 24px;
  margin-top: 8px;
  color: var(--on-surface-variant);
  font-size: 12px;
}

.watch-list-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--surface);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--shadow-ambient);
}

.watch-list-tabs {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border-radius: 8px;
  background-color: var(--surface-low);
}

.watch-list-tab {
  min-width: 0;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 800;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}

.watch-list-tab.active {
  color: var(--primary);
  background-color: var(--surface);
}

.tab-count {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  background-color: color-mix(in srgb, var(--primary) 14%, transparent);
  color: inherit;
  font-size: 11px;
  line-height: 1.45;
}

.watch-list-body {
  flex: 1;
  min-height: 0;
  padding-top: 12px;
  overflow: hidden;
}

.episodes-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  scrollbar-width: none;
}

.watch-list-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 700;
}

.extra-item .ep-number {
  max-width: 96px;
  padding: 2px 8px;
  border-radius: 6px;
  background-color: var(--surface-low);
  color: var(--primary);
  font-size: 12px;
}

.episode-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 12px 14px;
  border-radius: 10px;
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
  flex-shrink: 0;
  color: var(--primary); /* Restored to primary but maybe bold it or similar */
  filter: drop-shadow(0 0 5px var(--primary));
}

.ep-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ep-number,
.ep-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
}

.ep-number {
  flex: 0 0 auto;
}

.ep-title {
  flex: 1;
}

.ep-progress {
  flex-shrink: 0;
  margin-right: 8px;
  font-size: 12px;
  color: var(--on-surface-variant);
  opacity: 0.7;
}

@media (max-width: 1180px) {
  .theatre-container {
    --info-panel-width: min(360px, calc(100vw - 56px));
    grid-template-columns: minmax(0, 1fr);
  }

  .drawer-toggle {
    right: 0;
    border-right: 0;
    border-left: 1px solid var(--outline-variant);
    border-radius: var(--drawer-handle-radius) 0 0 var(--drawer-handle-radius);
    box-shadow: -8px 12px 32px rgba(0, 0, 0, 0.12);
  }

  .drawer-toggle:hover {
    color: var(--primary);
  }

  .drawer-toggle.is-open {
    right: var(--info-panel-width);
    border-left: 0;
    border-right: 1px solid var(--outline-variant);
  }

  .info-drawer {
    position: fixed;
    top: 60px;
    right: 0;
    z-index: 70;
    width: var(--info-panel-width);
    height: calc(100vh - 60px);
    padding: 24px 16px 24px 20px;
    background-color: var(--background);
    box-shadow: -24px 0 48px rgba(0, 0, 0, 0.18);
    transform: translateX(100%);
    transition: transform 0.28s ease;
  }

  .info-drawer.open {
    transform: translateX(0);
  }
}

@media (max-width: 760px) {
  .theatre-view,
  .theatre-container {
    min-height: calc(100vh - 108px);
  }

  .theatre-container {
    --info-panel-width: min(340px, calc(100vw - 48px));
  }

  .video-container {
    border-radius: 12px;
  }

  .video-controls {
    padding: 16px;
  }

  .controls-bottom {
    flex-wrap: wrap;
    gap: 10px;
  }

  .controls-left,
  .controls-right {
    min-width: 0;
    gap: 10px;
  }

  .controls-right {
    flex: 1;
    justify-content: flex-end;
  }

  .source-picker {
    max-width: 160px;
    padding: 6px 10px;
  }

  .time-display {
    margin-left: 0;
    font-size: 12px;
    white-space: nowrap;
  }

  .volume-slider-wrap {
    display: none;
  }

  .master-play-btn-circular {
    width: 64px;
    height: 64px;
  }

  .playback-error,
  .playback-status {
    top: 16px;
    right: 16px;
    left: 16px;
    font-size: 12px;
  }

  .info-drawer {
    width: var(--info-panel-width);
    padding: 20px 14px 20px 18px;
  }

  .media-header,
  .notes-header,
  .notes-footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .score-wrap {
    align-items: flex-start;
  }

  .notes-actions {
    justify-content: flex-start;
  }
}
</style>
