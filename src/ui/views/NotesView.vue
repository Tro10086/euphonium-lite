<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUpDown,
  Bold,
  CheckSquare,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Code2,
  Columns2,
  Edit3,
  Eye,
  FileText,
  Heading1,
  Italic,
  Link,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-vue-next'
import type { Anime, Episode } from '@/models/Anime'
import type { Attachment, Note, NoteTargetType, TipTapJSON } from '@/models/Note'
import { attachmentAPI, notesAPI } from '@/services/notes'
import { cleanupOrphanAttachments, scanOrphanAttachments } from '@/services/attachmentCleanup'
import { animeAPI, episodeAPI } from '@/services/storage'
import { uiState } from '@/ui/stores/uiState'
import BaseModal from '@/ui/components/BaseModal.vue'

type SortMode = 'updated' | 'episode' | 'wordCount'
type EditorMode = 'edit' | 'split' | 'preview'

interface TimeAnchor {
  label: string
  seconds: number
}

interface NoteAttachmentPreview {
  id: string
  name: string
  mimeType: string
  url: string
}

interface NoteCard {
  note: Note
  anime: Anime
  episode?: Episode
  title: string
  targetLabel: string
  excerpt: string
  fullText: string
  wordCount: number
  attachmentCount: number
  attachments: NoteAttachmentPreview[]
  anchors: TimeAnchor[]
  updatedAt: Date | null
  deletedAt: Date | null
  sortEpisode: number
}

const route = useRoute()
const router = useRouter()

const animes = ref<Anime[]>([])
const episodes = ref<Episode[]>([])
const notes = ref<Note[]>([])
const attachmentPreviewById = ref<Record<string, NoteAttachmentPreview>>({})
const selectedAnimeId = ref('')
const searchQuery = ref('')
const trashMode = ref(false)
const selectionMode = ref(false)
const selectedNoteIds = ref<Set<string>>(new Set())
const sortMode = ref<SortMode>('updated')
const activeNoteId = ref<string | null>(null)
const isCreating = ref(false)
const editorText = ref('')
const editorMessage = ref('')
const draftTargetKey = ref('')
const targetMenuOpen = ref(false)
const targetDropdownRef = ref<HTMLElement | null>(null)
const isLoading = ref(false)
const editorMode = ref<EditorMode>('split')
const editorTextareaRef = ref<HTMLTextAreaElement | null>(null)
const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
const deleteDialogOpen = ref(false)
const deleteDialogTitle = ref('删除笔记')
const deleteDialogMessage = ref('')
const pendingDeleteAction = ref<(() => Promise<void>) | null>(null)
let saveStatusTimer: ReturnType<typeof setTimeout> | null = null
const cleanupScanResult = ref<{ result: CleanupResult; orphanIds: string[] } | null>(null)
const cleanupResult = ref<{ scannedNotes: number; scannedAttachments: number; orphanBlobs: number; freedBytes: number } | null>(null)
const cleanupLoading = ref(false)
const cleanupDialogOpen = ref(false)

const sortOptions: Array<{ value: SortMode; label: string; shortLabel: string }> = [
  { value: 'updated', label: '按时间', shortLabel: '时间' },
  { value: 'episode', label: '按集数', shortLabel: '集数' },
  { value: 'wordCount', label: '按字数', shortLabel: '字数' },
]

const sortLabel = computed(
  () => sortOptions.find((option) => option.value === sortMode.value)?.label ?? '排序',
)
const sortShortLabel = computed(
  () => sortOptions.find((option) => option.value === sortMode.value)?.shortLabel ?? '更新时间',
)

const animeById = computed(() => new Map(animes.value.map((anime) => [anime.id, anime])))
const episodeById = computed(() => new Map(episodes.value.map((episode) => [episode.id, episode])))
const episodesByAnimeId = computed(() => {
  const grouped = new Map<string, Episode[]>()
  for (const episode of episodes.value) {
    const list = grouped.get(episode.anime_id) ?? []
    list.push(episode)
    grouped.set(episode.anime_id, list)
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => (a.sort ?? a.ep) - (b.sort ?? b.ep))
  }

  return grouped
})

const allCards = computed<NoteCard[]>(() => {
  const cards: NoteCard[] = []

  for (const note of notes.value) {
    const context = resolveNoteContext(note)
    if (!context) continue

    const text = note.plainText || plainTextFromTipTapJson(note.tiptapJson)
    const excerpt = createExcerpt(text)
    const episodeLabel = context.episode ? `第 ${context.episode.ep} 集` : '动画总笔记'

    cards.push({
      note,
      anime: context.anime,
      episode: context.episode,
      title: context.episode
        ? context.episode.name_cn || context.episode.name || `第 ${context.episode.ep} 集`
        : '动画总笔记',
      targetLabel: episodeLabel,
      excerpt,
      fullText: text,
      wordCount: countWords(text),
      attachmentCount: note.attachmentIds.length,
      attachments: note.attachmentIds
        .map((id) => attachmentPreviewById.value[id])
        .filter((attachment): attachment is NoteAttachmentPreview => Boolean(attachment)),
      anchors: parseTimeAnchors(text, context.episode?.duration_seconds),
      updatedAt: toDate(note.updated_at),
      deletedAt: toDate(note.deleted_at),
      sortEpisode: context.episode ? (context.episode.sort ?? context.episode.ep) : 0,
    })
  }

  return cards
})

const animeItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return animes.value
    .filter((anime) => !anime.purge_requested_at)
    .map((anime) => {
      const cards = allCards.value.filter((card) => card.anime.id === anime.id)
      const activeCards = cards.filter((card) => !card.deletedAt)
      const deletedCards = cards.filter((card) => card.deletedAt)
      const modeCards = trashMode.value ? deletedCards : activeCards
      const recentTime = Math.max(
        0,
        ...modeCards.map((card) => card.updatedAt?.getTime() ?? 0),
        toDate(anime.updated_at)?.getTime() ?? 0,
      )

      return {
        anime,
        title: animeTitle(anime),
        aliases: anime.aliases ?? [],
        noteCount: modeCards.length,
        activeCount: activeCards.length,
        deletedCount: deletedCards.length,
        recentTime,
      }
    })
    .filter((item) => {
      if (trashMode.value && item.deletedCount === 0) return false
      if (!query) return true
      const haystack = [item.title, item.anime.name, ...item.aliases]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
    .sort((a, b) => b.recentTime - a.recentTime || a.title.localeCompare(b.title, 'zh-Hans-CN'))
})

const selectedAnime = computed(() => animeById.value.get(selectedAnimeId.value) ?? null)
const selectedAnimeEpisodes = computed(
  () => episodesByAnimeId.value.get(selectedAnimeId.value) ?? [],
)

const currentCards = computed(() => {
  const deleted = trashMode.value
  const cards = allCards.value.filter(
    (card) => card.anime.id === selectedAnimeId.value && Boolean(card.deletedAt) === deleted,
  )

  if (sortMode.value === 'episode') {
    return [...cards].sort((a, b) => a.sortEpisode - b.sortEpisode || compareUpdatedDesc(a, b))
  }

  if (sortMode.value === 'wordCount') {
    return [...cards].sort((a, b) => b.wordCount - a.wordCount || compareUpdatedDesc(a, b))
  }

  return [...cards].sort(compareUpdatedDesc)
})

const newTargetOptions = computed(() => {
  const anime = selectedAnime.value
  if (!anime) return []

  return [
    {
      key: `anime:${anime.id}`,
      label: '动画总笔记',
    },
    ...selectedAnimeEpisodes.value.map((episode) => ({
      key: `episode:${episode.id}`,
      label: `第 ${episode.ep} 集 ${episode.name_cn || episode.name || ''}`.trim(),
    })),
  ]
})

const activeCard = computed(() =>
  activeNoteId.value
    ? (allCards.value.find((card) => card.note.id === activeNoteId.value) ?? null)
    : null,
)

const isEditorOpen = computed(() => isCreating.value || Boolean(activeCard.value))
const editorTitle = computed(() => {
  if (isCreating.value) return '新建笔记'
  return activeCard.value?.title ?? '笔记'
})
const editorEpisodeLabel = computed(() => {
  if (isCreating.value) {
    return newTargetOptions.value.find((option) => option.key === draftTargetKey.value)?.label ?? ''
  }
  return activeCard.value?.targetLabel ?? ''
})
const editorEpisode = computed(() => {
  if (activeCard.value?.episode) return activeCard.value.episode
  if (!isCreating.value) return undefined

  const target = parseTargetKey(draftTargetKey.value)
  if (target?.targetType !== 'episode') return undefined
  return episodeById.value.get(target.targetId)
})
const editorAnchors = computed(() =>
  parseTimeAnchors(editorText.value, editorEpisode.value?.duration_seconds),
)
const editorPreviewHtml = computed(() =>
  renderMarkdown(editorText.value, attachmentPreviewById.value),
)
const editorWordCount = computed(() => countWords(editorText.value))
const selectedCount = computed(() => selectedNoteIds.value.size)
const selectedDraftTargetLabel = computed(
  () => newTargetOptions.value.find((option) => option.key === draftTargetKey.value)?.label ?? '',
)
const currentSelectableNoteIds = computed(() => currentCards.value.map((card) => card.note.id))
const isCurrentListAllSelected = computed(() => {
  const ids = currentSelectableNoteIds.value
  return ids.length > 0 && ids.every((id) => selectedNoteIds.value.has(id))
})

function animeTitle(anime: Anime) {
  return anime.name_cn || anime.name || '未命名动画'
}

function toDate(value: Date | string | number | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function compareUpdatedDesc(a: NoteCard, b: NoteCard) {
  return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
}

function resolveNoteContext(note: Note) {
  if (note.targetType === 'anime') {
    const anime = animeById.value.get(note.targetId)
    return anime ? { anime } : null
  }

  if (note.targetType === 'episode') {
    const episode = episodeById.value.get(note.targetId)
    const anime = episode ? animeById.value.get(episode.anime_id) : undefined
    return anime && episode ? { anime, episode } : null
  }

  return null
}

function plainTextFromTipTapJson(json: TipTapJSON): string {
  const lines: string[] = []
  const walk = (node: TipTapJSON) => {
    if (node.type === 'paragraph') {
      lines.push((node.content ?? []).map((child) => child.text ?? '').join(''))
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(json)
  return lines.join('\n').trim()
}

function extractAttachmentIds(text: string): string[] {
  const regex = /!\[[^\]]*\]\(attachment:([^)]+)\)/g
  const ids = new Set<string>()
  let match
  while ((match = regex.exec(text))) ids.add(match[1])
  return Array.from(ids)
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

function createExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized || '空白笔记'
}

function countWords(text: string) {
  return text.replace(/\s/g, '').length
}

function parseTimeAnchors(text: string, maxSeconds?: number): TimeAnchor[] {
  const anchors: TimeAnchor[] = []
  const seen = new Set<string>()
  const regex = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) && anchors.length < 12) {
    const hours = match[1] ? Number(match[1]) : 0
    const minutes = Number(match[2])
    const seconds = Number(match[3])
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds > 59) continue

    const totalSeconds = hours * 3600 + minutes * 60 + seconds
    if (maxSeconds && totalSeconds > maxSeconds) continue

    const label = match[0]
    const key = `${label}:${totalSeconds}`
    if (seen.has(key)) continue

    seen.add(key)
    anchors.push({ label, seconds: totalSeconds })
  }

  return anchors
}

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

function renderInlineMarkdown(value: string, attachments: Record<string, NoteAttachmentPreview>) {
  const imagePattern = /!\[([^\]]*)\]\(attachment:([^)]+)\)/g
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = imagePattern.exec(value))) {
    parts.push(renderInlineText(value.slice(lastIndex, match.index)))
    const alt = match[1] ?? '截图'
    const attachmentId = match[2] ?? ''
    const attachment = attachments[attachmentId]
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

function renderMarkdown(markdown: string, attachments: Record<string, NoteAttachmentPreview>) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let listType: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (line.startsWith('```')) {
      closeList()
      html.push(inCodeBlock ? '</code></pre>' : '<pre><code>')
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      html.push(`${escapeHtml(rawLine)}\n`)
      continue
    }

    if (!line.trim()) {
      closeList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      closeList()
      const marker = heading[1] ?? '#'
      const content = heading[2] ?? ''
      const level = marker.length
      html.push(`<h${level}>${renderInlineMarkdown(content, attachments)}</h${level}>`)
      continue
    }

    if (/^>\s+/.test(line)) {
      closeList()
      html.push(
        `<blockquote>${renderInlineMarkdown(line.replace(/^>\s+/, ''), attachments)}</blockquote>`,
      )
      continue
    }

    const unordered = line.match(/^[-*]\s+(.+)$/)
    if (unordered) {
      if (listType !== 'ul') {
        closeList()
        listType = 'ul'
        html.push('<ul>')
      }
      html.push(`<li>${renderInlineMarkdown(unordered[1] ?? '', attachments)}</li>`)
      continue
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (ordered) {
      if (listType !== 'ol') {
        closeList()
        listType = 'ol'
        html.push('<ol>')
      }
      html.push(`<li>${renderInlineMarkdown(ordered[1] ?? '', attachments)}</li>`)
      continue
    }

    closeList()
    html.push(`<p>${renderInlineMarkdown(line, attachments)}</p>`)
  }

  closeList()
  if (inCodeBlock) html.push('</code></pre>')
  return html.join('\n')
}

function ensureAttachmentMarkers(text: string, attachmentIds: string[]) {
  const missingIds = attachmentIds.filter((id) => !text.includes(`](attachment:${id})`))
  if (missingIds.length === 0) return text

  const markers = missingIds.map((id) => `![截图](attachment:${id})`).join('\n')
  return text.trim() ? `${text.trimEnd()}\n${markers}` : markers
}

function formatDate(value: Date | null) {
  if (!value) return '未知时间'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function parseTargetKey(key: string): { targetType: NoteTargetType; targetId: string } | null {
  const [targetType, targetId] = key.split(':')
  if ((targetType !== 'anime' && targetType !== 'episode') || !targetId) return null
  return { targetType, targetId }
}

function revokeAttachmentPreviews() {
  for (const preview of Object.values(attachmentPreviewById.value)) URL.revokeObjectURL(preview.url)
  attachmentPreviewById.value = {}
}

function createAttachmentPreview(attachment: Attachment): NoteAttachmentPreview {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    url: URL.createObjectURL(attachment.blob),
  }
}

async function refreshAttachmentPreviews(noteRows: Note[]) {
  const attachmentIds = Array.from(new Set(noteRows.flatMap((note) => note.attachmentIds)))
  revokeAttachmentPreviews()
  if (attachmentIds.length === 0) return

  const attachments = await attachmentAPI.getByIds(attachmentIds)
  attachmentPreviewById.value = Object.fromEntries(
    attachments.map((attachment) => [attachment.id, createAttachmentPreview(attachment)]),
  )
}

async function refreshData() {
  isLoading.value = true
  try {
    const [animeRows, episodeRows, noteRows] = await Promise.all([
      animeAPI.getAll(),
      episodeAPI.getAll(),
      notesAPI.getAll(),
    ])
    animes.value = animeRows
    episodes.value = episodeRows
    await refreshAttachmentPreviews(noteRows)
    notes.value = noteRows
  } finally {
    isLoading.value = false
  }
}

function ensureSelectedAnime() {
  const routeAnimeId = typeof route.query.animeId === 'string' ? route.query.animeId : ''
  const visibleIds = new Set(animeItems.value.map((item) => item.anime.id))

  if (routeAnimeId && visibleIds.has(routeAnimeId)) {
    selectedAnimeId.value = routeAnimeId
    return
  }

  if (selectedAnimeId.value && visibleIds.has(selectedAnimeId.value)) return

  selectedAnimeId.value = animeItems.value[0]?.anime.id ?? ''
}

function selectAnime(id: string) {
  selectedAnimeId.value = id
  closeEditor()
  clearSelection()
}

function cycleSort() {
  const index = sortOptions.findIndex((option) => option.value === sortMode.value)
  sortMode.value = sortOptions[(index + 1) % sortOptions.length]?.value ?? 'updated'
}

function startCreate() {
  if (!selectedAnime.value) return

  const target = newTargetOptions.value[0]
  if (!target) return

  activeNoteId.value = null
  isCreating.value = true
  editorText.value = ''
  editorMessage.value = ''
  draftTargetKey.value = target.key
  editorMode.value = 'split'
  targetMenuOpen.value = false
  clearSelection()
}

function openEditor(card: NoteCard) {
  if (selectionMode.value) {
    toggleNoteSelection(card.note.id)
    return
  }
  if (trashMode.value) return

  activeNoteId.value = card.note.id
  isCreating.value = false
  editorText.value = ensureAttachmentMarkers(card.fullText, card.note.attachmentIds)
  editorMessage.value = ''
  editorMode.value = 'split'
  clearSelection()
}

function closeEditor() {
  activeNoteId.value = null
  isCreating.value = false
  editorText.value = ''
  editorMessage.value = ''
  targetMenuOpen.value = false
}

async function saveEditor() {
  const existingCard = activeCard.value
  const target = isCreating.value
    ? parseTargetKey(draftTargetKey.value)
    : existingCard
      ? { targetType: existingCard.note.targetType, targetId: existingCard.note.targetId }
      : null

  if (!target) return
  if (isCreating.value && !editorText.value.trim()) {
    editorMessage.value = '笔记内容为空'
    return
  }

  setSaveStatus('saving')
  const noteId = existingCard?.note.id
  const attachmentIds = extractAttachmentIds(editorText.value)

  const savedId = await notesAPI.save({
    id: noteId,
    targetType: target.targetType,
    targetId: target.targetId,
    tiptapJson: textToTipTapJson(editorText.value, attachmentIds),
    plainText: editorText.value,
    attachmentIds,
  })

  activeNoteId.value = savedId
  isCreating.value = false
  editorMessage.value = ''
  targetMenuOpen.value = false
  await refreshData()
  setSaveStatus('saved')
}

function clearSaveStatusTimer() {
  if (!saveStatusTimer) return
  clearTimeout(saveStatusTimer)
  saveStatusTimer = null
}

function setSaveStatus(status: 'idle' | 'saving' | 'saved') {
  clearSaveStatusTimer()
  saveStatus.value = status
  if (status === 'saved') {
    saveStatusTimer = setTimeout(() => {
      saveStatus.value = 'idle'
      saveStatusTimer = null
    }, 3000)
  }
}

function clearSelection() {
  selectedNoteIds.value = new Set()
  selectionMode.value = false
}

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  selectedNoteIds.value = new Set()
}

function toggleTargetMenu() {
  if (!isCreating.value || newTargetOptions.value.length === 0) return
  targetMenuOpen.value = !targetMenuOpen.value
}

function closeTargetMenu() {
  targetMenuOpen.value = false
}

function selectDraftTarget(key: string) {
  draftTargetKey.value = key
  closeTargetMenu()
}

function toggleNoteSelection(id: string) {
  const next = new Set(selectedNoteIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedNoteIds.value = next
}

function toggleSelectAll() {
  const ids = currentSelectableNoteIds.value
  if (ids.length === 0) return

  const next = new Set(selectedNoteIds.value)
  if (isCurrentListAllSelected.value) {
    ids.forEach((id) => next.delete(id))
  } else {
    ids.forEach((id) => next.add(id))
  }
  selectedNoteIds.value = next
}

function setEditorMode(mode: EditorMode) {
  editorMode.value = mode
}

function insertMarkdown(prefix: string, suffix = '', placeholder = '') {
  const textarea = editorTextareaRef.value
  if (!textarea) {
    editorText.value += `${prefix}${placeholder}${suffix}`
    return
  }

  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = editorText.value.slice(start, end) || placeholder
  editorText.value = `${editorText.value.slice(0, start)}${prefix}${selected}${suffix}${editorText.value.slice(end)}`

  void nextTick(() => {
    textarea.focus()
    const selectionStart = start + prefix.length
    const selectionEnd = selectionStart + selected.length
    textarea.setSelectionRange(selectionStart, selectionEnd)
  })
}

function insertLine(prefix: string) {
  const textarea = editorTextareaRef.value
  if (!textarea) {
    editorText.value += `${prefix}`
    return
  }

  const start = textarea.selectionStart
  const lineStart = editorText.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  editorText.value = `${editorText.value.slice(0, lineStart)}${prefix}${editorText.value.slice(lineStart)}`

  void nextTick(() => {
    textarea.focus()
    const position = lineStart + prefix.length
    textarea.setSelectionRange(position, position)
  })
}

function insertTimestamp() {
  insertMarkdown('[00:00]')
}

async function insertImageBlob(blob: Blob, name: string) {
  if (!activeNoteId.value) {
    editorMessage.value = '请先保存笔记再粘贴图片'
    return
  }

  const id = await attachmentAPI.put({
    noteId: activeNoteId.value!,
    name,
    blob,
  })

  insertMarkdown('![图片](attachment:', ')', id)

  // 立刻更新预览缓存
  const attachments = await attachmentAPI.getByIds([id])
  if (attachments.length) {
    attachmentPreviewById.value[id] = createAttachmentPreview(attachments[0])
  }
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (!item.type.startsWith('image/')) continue
    e.preventDefault()
    const blob = item.getAsFile()
    if (!blob) continue
    await insertImageBlob(blob, `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`)
  }
}

async function handleDrop(e: DragEvent) {
  const files = e.dataTransfer?.files
  if (!files) return
  e.preventDefault()

  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    await insertImageBlob(file, file.name || `dropped-${Date.now()}.png`)
  }
}

async function softDeleteSelected() {
  const ids = Array.from(selectedNoteIds.value)
  if (ids.length === 0) return
  openDeleteDialog({
    title: '删除笔记',
    message: `确定要删除选中的 ${ids.length} 条笔记吗？删除后可在当前动画的回收站恢复。`,
    action: async () => {
      await Promise.all(ids.map((id) => notesAPI.softDelete(id)))
      if (activeNoteId.value && ids.includes(activeNoteId.value)) closeEditor()
      clearSelection()
      await refreshData()
    },
  })
}

async function softDeleteActiveNote() {
  const card = activeCard.value
  if (!card) return
  openDeleteDialog({
    title: '删除笔记',
    message: `确定要删除「${card.title}」吗？删除后可在当前动画的回收站恢复。`,
    action: async () => {
      await notesAPI.softDelete(card.note.id)
      closeEditor()
      await refreshData()
    },
  })
}

async function restoreSelected() {
  const ids = Array.from(selectedNoteIds.value)
  if (ids.length === 0) return

  await Promise.all(ids.map((id) => notesAPI.restore(id)))
  clearSelection()
  await refreshData()
}

async function deleteSelectedPermanently() {
  const ids = Array.from(selectedNoteIds.value)
  if (ids.length === 0) return
  openDeleteDialog({
    title: '彻底删除',
    message: `确定要彻底删除选中的 ${ids.length} 条笔记吗？此操作不可恢复。`,
    action: async () => {
      await Promise.all(ids.map((id) => notesAPI.deletePermanently(id)))
      clearSelection()
      await refreshData()
    },
  })
}
async function handleScanOrphan() {
  cleanupLoading.value = true
  try {
    cleanupScanResult.value = await scanOrphanAttachments()
    cleanupResult.value = cleanupScanResult.value.result
    cleanupDialogOpen.value = true
  } finally {
    cleanupLoading.value = false
  }
}

async function handleCleanupOrphan() {
  if (!cleanupScanResult.value) return
  cleanupLoading.value = true
  try {
    cleanupResult.value = await cleanupOrphanAttachments(cleanupScanResult.value.orphanIds)
    await refreshData()
  } finally {
    cleanupLoading.value = false
    cleanupDialogOpen.value = false
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function openDeleteDialog(options: {
  title: string
  message: string
  action: () => Promise<void>
}) {
  deleteDialogTitle.value = options.title
  deleteDialogMessage.value = options.message
  pendingDeleteAction.value = options.action
  deleteDialogOpen.value = true
}

async function confirmDeleteDialog() {
  const action = pendingDeleteAction.value
  deleteDialogOpen.value = false
  pendingDeleteAction.value = null
  if (action) await action()
}

function cancelDeleteDialog() {
  deleteDialogOpen.value = false
  pendingDeleteAction.value = null
}

function toggleTrashMode() {
  trashMode.value = !trashMode.value
  closeEditor()
  clearSelection()
  ensureSelectedAnime()
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!targetMenuOpen.value || !targetDropdownRef.value) return
  if (event.target instanceof Node && targetDropdownRef.value.contains(event.target)) return
  closeTargetMenu()
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  closeTargetMenu()
}

function openTheatreAt(card: NoteCard | null, seconds: number) {
  if (!card) return

  const query: Record<string, string> = { t: String(seconds) }
  if (card.episode) query.episodeId = card.episode.id

  const href = router.resolve({
    name: 'theatre',
    params: { id: card.anime.id },
    query,
  }).href
  window.open(href, '_blank', 'noopener')
}

watch(animeItems, ensureSelectedAnime)
watch(() => route.query.animeId, ensureSelectedAnime)

onMounted(async () => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleWindowKeydown)
  await refreshData()
  ensureSelectedAnime()
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('keydown', handleWindowKeydown)
  clearSaveStatusTimer()
  revokeAttachmentPreviews()
})
</script>

<template>
  <div class="notes-page">
    <div class="notes-view">
      <aside class="anime-column">
        <div class="anime-search">
          <Search :size="18" class="search-icon" />
          <input v-model="searchQuery" type="text" placeholder="搜索动画..." class="search-input" />
        </div>

        <div class="anime-list">
          <button
            v-for="item in animeItems"
            :key="item.anime.id"
            class="anime-item"
            :class="{ active: selectedAnimeId === item.anime.id }"
            :title="item.title"
            @click="selectAnime(item.anime.id)"
          >
            <span class="anime-name">{{ item.title }}</span>
            <span class="anime-count">{{ trashMode ? item.deletedCount : item.activeCount }}</span>
          </button>
        </div>
      </aside>

      <section class="notes-workspace">
        <header v-if="!isEditorOpen" class="notes-toolbar">
          <div class="toolbar-title">
            <span class="mode-label">{{ trashMode ? '回收站' : '笔记' }}</span>
            <h1 :title="selectedAnime ? animeTitle(selectedAnime) : ''">
              {{ selectedAnime ? animeTitle(selectedAnime) : '暂无动画' }}
            </h1>
          </div>

          <div class="toolbar-actions header-actions">
            <span v-if="selectionMode" class="selection-summary">已选 {{ selectedCount }}</span>
            <button
              v-if="trashMode"
              class="tool-btn"
              :disabled="selectionMode"
              @click="toggleTrashMode"
            >
              <X :size="16" />
              <span>退出</span>
            </button>
            <button
              v-else
              class="tool-btn"
              :disabled="!selectedAnime || selectionMode"
              @click="startCreate"
            >
              <Plus :size="16" />
              <span>新建</span>
            </button>

            <button
              class="tool-btn"
              :title="sortLabel"
              :disabled="selectionMode"
              @click="cycleSort"
            >
              <ArrowUpDown :size="16" />
              <span>按{{ sortShortLabel }}排序</span>
            </button>

            <button
              class="tool-btn"
              :class="{ active: selectionMode }"
              @click="toggleSelectionMode"
            >
              <CheckSquare v-if="selectionMode" :size="16" />
              <Square v-else :size="16" />
              <span>多选</span>
            </button>

            <button v-if="selectionMode" class="tool-btn" @click="toggleSelectAll">
              <CheckSquare v-if="isCurrentListAllSelected" :size="16" />
              <Square v-else :size="16" />
              <span>{{ isCurrentListAllSelected ? '取消全选' : '全选' }}</span>
            </button>

            <button
              v-if="trashMode && selectionMode"
              class="tool-btn"
              :disabled="selectedCount === 0"
              @click="restoreSelected"
            >
              <RotateCcw :size="16" />
              <span>恢复</span>
            </button>
            <button
              v-else-if="selectionMode"
              class="tool-btn danger"
              :disabled="selectedCount === 0"
              @click="softDeleteSelected"
            >
              <Trash2 :size="16" />
              <span>删除</span>
            </button>
            <button
              class="tool-btn"
              :disabled="selectionMode || cleanupLoading"
              @click="handleScanOrphan"
            >
              <Trash2 :size="16" />
              <span>清理附件</span>
            </button>

            <button
              v-if="trashMode && selectionMode"
              class="tool-btn danger"
              :disabled="selectedCount === 0"
              @click="deleteSelectedPermanently"
            >
              <Trash2 :size="16" />
              <span>彻底删除</span>
            </button>
            <button
              v-else
              class="tool-btn"
              :class="{ active: trashMode }"
              :disabled="selectionMode"
              @click="toggleTrashMode"
            >
              <Trash2 :size="16" />
              <span>回收站</span>
            </button>
          </div>
        </header>

        <div v-if="isEditorOpen" class="editor-layout">
          <header class="editor-header">
            <button class="back-btn" @click="closeEditor">
              <ChevronLeft :size="18" />
              <span>返回</span>
            </button>
            <div class="editor-heading">
              <span v-if="!isCreating && editorEpisodeLabel" class="editor-episode-label">
                {{ editorEpisodeLabel }}
              </span>
              <h2>{{ editorTitle }}</h2>
            </div>
            <div class="editor-actions">
              <button
                v-if="activeCard"
                class="icon-action danger"
                title="删除"
                @click="softDeleteActiveNote"
              >
                <Trash2 :size="18" />
              </button>
              <button class="icon-action primary" title="保存" @click="saveEditor">
                <Save :size="18" />
              </button>
            </div>
          </header>

          <div v-if="isCreating" class="target-row">
            <label id="note-target-label" for="note-target-trigger">所属</label>
            <div ref="targetDropdownRef" class="target-dropdown" :class="{ open: targetMenuOpen }">
              <button
                id="note-target-trigger"
                type="button"
                class="target-trigger"
                :aria-expanded="targetMenuOpen"
                aria-haspopup="listbox"
                aria-labelledby="note-target-label note-target-trigger"
                :disabled="newTargetOptions.length === 0"
                @click="toggleTargetMenu"
              >
                <span class="target-trigger-text">{{ selectedDraftTargetLabel }}</span>
              </button>
              <div
                v-if="targetMenuOpen"
                class="target-menu"
                role="listbox"
                aria-label="选择所属目标"
              >
                <button
                  v-for="option in newTargetOptions"
                  :key="option.key"
                  type="button"
                  class="target-option"
                  :class="{ active: option.key === draftTargetKey }"
                  @click="selectDraftTarget(option.key)"
                >
                  <span>{{ option.label }}</span>
                  <CheckCircle2 v-if="option.key === draftTargetKey" :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="editorAnchors.length" class="timestamp-row">
            <button
              v-for="anchor in editorAnchors"
              :key="`${anchor.label}-${anchor.seconds}`"
              class="timestamp-chip"
              :disabled="isCreating"
              @click="openTheatreAt(activeCard, anchor.seconds)"
            >
              <Clock :size="14" />
              <span>{{ anchor.label }}</span>
            </button>
          </div>

          <section class="markdown-editor">
            <header class="markdown-toolbar">
              <div class="markdown-tools">
                <button title="标题" @click="insertLine('# ')">
                  <Heading1 :size="16" />
                </button>
                <button title="加粗" @click="insertMarkdown('**', '**', '加粗文字')">
                  <Bold :size="16" />
                </button>
                <button title="斜体" @click="insertMarkdown('*', '*', '斜体文字')">
                  <Italic :size="16" />
                </button>
                <button title="引用" @click="insertLine('> ')">
                  <Quote :size="16" />
                </button>
                <button title="无序列表" @click="insertLine('- ')">
                  <List :size="16" />
                </button>
                <button title="有序列表" @click="insertLine('1. ')">
                  <ListOrdered :size="16" />
                </button>
                <button title="代码" @click="insertMarkdown('`', '`', 'code')">
                  <Code2 :size="16" />
                </button>
                <button title="链接" @click="insertMarkdown('[', '](https://)', '链接文字')">
                  <Link :size="16" />
                </button>
                <button title="时间戳" @click="insertTimestamp">
                  <Clock :size="16" />
                </button>
              </div>
              <div class="markdown-modes">
                <button
                  title="编辑"
                  :class="{ active: editorMode === 'edit' }"
                  @click="setEditorMode('edit')"
                >
                  <Edit3 :size="16" />
                </button>
                <button
                  title="分屏"
                  :class="{ active: editorMode === 'split' }"
                  @click="setEditorMode('split')"
                >
                  <Columns2 :size="16" />
                </button>
                <button
                  title="预览"
                  :class="{ active: editorMode === 'preview' }"
                  @click="setEditorMode('preview')"
                >
                  <Eye :size="16" />
                </button>
              </div>
            </header>

            <div class="markdown-body" :class="`mode-${editorMode}`">
              <textarea
                v-show="editorMode !== 'preview'"
                ref="editorTextareaRef"
                v-model="editorText"
                class="note-editor"
                placeholder="记录这部动画或某一集的想法..."
                @paste="handlePaste"
                @drop="handleDrop"
                @dragover.prevent
              ></textarea>
              <article
                v-show="editorMode !== 'edit'"
                class="markdown-preview"
                v-html="editorPreviewHtml"
              ></article>
            </div>
          </section>

          <footer class="editor-footer">
            <div class="editor-footer-left">
              <span class="word-count">总字数 {{ editorWordCount }}</span>
              <span class="save-status" :class="saveStatus">
                <Loader2 v-if="saveStatus === 'saving'" :size="14" class="spin-icon" />
                <CheckCircle2 v-else-if="saveStatus === 'saved'" :size="14" />
                <span v-if="saveStatus === 'saving'">保存中...</span>
                <span v-else-if="saveStatus === 'saved'">已保存</span>
              </span>
              <span v-if="editorMessage">{{ editorMessage }}</span>
            </div>
            <span v-if="!uiState.settings.compactMode" class="editor-hint">
              截图请在放映厅中添加，这里适合整理和修改已有笔记。
            </span>
          </footer>
        </div>

        <div v-else class="notes-list-area">
          <div v-if="isLoading" class="empty-state">正在加载...</div>
          <div v-else-if="currentCards.length === 0" class="empty-state">
            {{ trashMode ? '当前动画没有已删除笔记' : '当前动画还没有笔记' }}
          </div>

          <div v-else class="note-grid">
            <article
              v-for="card in currentCards"
              :key="card.note.id"
              class="note-card"
              :class="{
                selected: selectedNoteIds.has(card.note.id),
                selectable: selectionMode,
                inert: trashMode && !selectionMode,
              }"
              @click="openEditor(card)"
            >
              <button
                v-if="selectionMode"
                class="select-mark"
                @click.stop="toggleNoteSelection(card.note.id)"
              >
                <CheckSquare v-if="selectedNoteIds.has(card.note.id)" :size="18" />
                <Square v-else :size="18" />
              </button>
              <div class="note-cover" :class="{ 'with-image': card.attachments.length }">
                <img
                  v-if="card.attachments[0]"
                  :src="card.attachments[0].url"
                  :alt="card.attachments[0].name"
                  class="note-cover-image"
                />
                <template v-else>
                  <FileText :size="22" />
                  <p>{{ card.excerpt }}</p>
                </template>
              </div>
              <div class="note-meta">
                <span>{{ card.targetLabel }}</span>
                <span>{{ formatDate(card.updatedAt) }}</span>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <BaseModal
      v-model="deleteDialogOpen"
      :title="deleteDialogTitle"
      width="420px"
      :close-on-overlay="false"
      @close="cancelDeleteDialog"
    >
      <p class="dialog-message">{{ deleteDialogMessage }}</p>
      <template #footer>
        <button class="dialog-cancel" @click="cancelDeleteDialog">取消</button>
        <button class="dialog-confirm danger" @click="confirmDeleteDialog">删除</button>
      </template>
    </BaseModal>

    <BaseModal
      v-model="cleanupDialogOpen"
      title="清理未引用附件"
      width="420px"
      :close-on-overlay="false"
      @close="cleanupDialogOpen = false"
    >
      <p v-if="cleanupResult">
        扫描到 <strong>{{ cleanupResult.orphanBlobs }}</strong> 个未被引用的附件，
        可释放 <strong>{{ formatBytes(cleanupResult.freedBytes) }}</strong> 空间。
      </p>
      <template #footer>
        <button class="dialog-cancel" @click="cleanupDialogOpen = false">取消</button>
        <button class="dialog-confirm danger" @click="handleCleanupOrphan">清理</button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.notes-page {
  height: calc(100vh - 108px);
  overflow: hidden;
}

.notes-view {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 24px;
  height: 100%;
  min-height: 0;
}

.anime-column {
  height: 100%;
  min-height: 0;
  border-right: 1px solid var(--outline-variant);
  padding-right: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.anime-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 18px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--primary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid transparent;
  border-radius: 99px;
  outline: none;
  background-color: var(--surface-low);
  color: var(--on-surface);
  font-size: 14px;
}

.search-input:focus {
  border-color: var(--primary-container);
  background-color: var(--surface);
  box-shadow: var(--shadow-soft);
}

.anime-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.anime-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  color: var(--on-surface-variant);
  text-align: left;
}

.anime-item:hover,
.anime-item.active {
  background-color: var(--surface-low);
  color: var(--primary);
}

.anime-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
}

.anime-count {
  flex: 0 0 auto;
  min-width: 28px;
  padding: 3px 8px;
  border-radius: 99px;
  background-color: var(--surface);
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
}

.anime-item.active .anime-count {
  background-color: var(--primary-light);
  color: var(--primary);
}

.notes-workspace {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notes-toolbar,
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.editor-header,
.target-row,
.timestamp-row {
  flex-shrink: 0;
}

.notes-toolbar {
  margin-bottom: 24px;
  flex-shrink: 0;
}

.toolbar-title {
  min-width: 0;
}

.mode-label {
  display: block;
  margin-bottom: 4px;
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
}

.toolbar-title h1 {
  overflow: hidden;
  color: var(--on-surface);
  font-size: 28px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-actions,
.editor-actions {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--primary);
  opacity: 0.6;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
}

.tool-btn {
  min-height: 32px;
}

.tool-btn:hover,
.tool-btn.active {
  color: var(--primary);
  opacity: 1;
}

.tool-btn.danger {
  color: var(--error);
}

.selection-summary {
  height: 32px;
  display: inline-flex;
  align-items: center;
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 700;
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.notes-list-area {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 20px;
}

.note-card {
  position: relative;
  min-height: 280px;
  overflow: hidden;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface);
  box-shadow: var(--shadow-ambient);
  cursor: pointer;
  transition:
    transform 0.25s ease,
    box-shadow 0.25s ease,
    border-color 0.25s ease;
}

.note-card:hover {
  transform: translateY(-5px);
  border-color: var(--primary-container);
  box-shadow: 0 18px 40px rgba(26, 28, 26, 0.12);
}

.note-card.selected {
  border-color: var(--primary);
  outline: 3px solid var(--primary-light);
}

.note-card.selectable {
  cursor: default;
}

.note-card.inert {
  cursor: default;
}

.note-card.inert:hover {
  transform: none;
  border-color: var(--outline-variant);
  box-shadow: var(--shadow-ambient);
}

.select-mark {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.88);
  color: var(--primary);
  box-shadow: var(--shadow-soft);
}

.note-cover {
  height: 224px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--on-surface);
  background:
    linear-gradient(150deg, rgba(255, 222, 165, 0.42), transparent 42%), var(--surface-low);
}

.note-cover.with-image {
  padding: 0;
  background: var(--surface-low);
}

.note-cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.note-cover svg {
  flex: 0 0 auto;
  color: var(--primary);
}

.note-cover p {
  display: -webkit-box;
  overflow: hidden;
  color: var(--on-surface);
  font-size: 18px;
  font-weight: 800;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 6;
}

.note-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 800;
}

.note-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--outline-variant);
  border-radius: 16px;
  color: var(--on-surface-variant);
  background-color: var(--surface-low);
  font-size: 14px;
  font-weight: 700;
}

.editor-layout {
  height: 100%;
  min-height: 0;
  padding: 28px;
  border: 1px solid var(--outline-variant);
  border-radius: 16px;
  background-color: var(--surface);
  box-shadow: var(--shadow-ambient);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 12px 0 9px;
  border-radius: 10px;
  background-color: var(--surface-low);
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 800;
}

.back-btn:hover {
  color: var(--primary);
  background-color: var(--primary-light);
}

.icon-action {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background-color: var(--surface-low);
  color: var(--on-surface-variant);
}

.icon-action:hover {
  color: var(--primary);
  background-color: var(--primary-light);
}

.icon-action.primary {
  color: white;
  background-color: var(--primary);
}

.icon-action.danger {
  color: var(--error);
}

.editor-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.editor-heading h2 {
  overflow: hidden;
  font-size: 22px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-episode-label {
  flex: 0 0 auto;
  color: var(--on-surface-variant);
  font-size: 15px;
  font-weight: 800;
}

.target-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
}

.target-row label {
  color: var(--on-surface-variant);
  font-size: 13px;
  font-weight: 800;
}

.target-dropdown {
  position: relative;
  min-width: 240px;
  max-width: 100%;
}

.target-trigger {
  position: relative;
  width: 100%;
  min-height: 46px;
  padding: 11px 40px 11px 14px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface) 88%, white),
    var(--surface-low)
  );
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  color: var(--on-surface);
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.target-trigger::after {
  position: absolute;
  top: 50%;
  right: 14px;
  width: 7px;
  height: 7px;
  border-right: 2px solid var(--on-surface-variant);
  border-bottom: 2px solid var(--on-surface-variant);
  content: '';
  pointer-events: none;
  transform: translateY(-65%) rotate(45deg);
}

.target-trigger:hover {
  border-color: var(--primary-container);
}

.target-trigger:focus-visible {
  border-color: var(--primary);
  background-color: var(--surface);
  box-shadow:
    0 0 0 3px var(--primary-light),
    var(--shadow-soft);
  outline: none;
}

.target-dropdown.open .target-trigger {
  border-color: var(--primary);
  border-bottom-right-radius: 6px;
  border-bottom-left-radius: 6px;
  box-shadow:
    0 0 0 3px var(--primary-light),
    var(--shadow-soft);
}

.target-dropdown.open .target-trigger::after {
  transform: translateY(-35%) rotate(225deg);
}

.target-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.target-trigger-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-menu {
  position: absolute;
  top: calc(100% - 1px);
  left: 0;
  right: 0;
  z-index: 20;
  overflow: hidden auto;
  max-height: 280px;
  border: 1px solid var(--primary);
  border-top: 0;
  border-radius: 0 0 14px 14px;
  background: color-mix(in srgb, var(--surface) 92%, white);
  box-shadow: 0 18px 36px rgba(26, 28, 26, 0.16);
}

.target-option {
  width: 100%;
  padding: 11px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--on-surface);
  font-size: 14px;
  font-weight: 700;
  text-align: left;
}

.target-option + .target-option {
  border-top: 1px solid color-mix(in srgb, var(--outline-variant) 75%, transparent);
}

.target-option:hover,
.target-option.active {
  background-color: var(--primary-light);
  color: var(--primary);
}

.target-menu::-webkit-scrollbar {
  width: 8px;
}

.target-menu::-webkit-scrollbar-track {
  background: transparent;
}

.target-menu::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background-clip: content-box;
  background-color: color-mix(in srgb, var(--on-surface-variant) 35%, transparent);
}

.timestamp-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

.timestamp-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 10px;
  border-radius: 99px;
  background-color: var(--primary-light);
  color: var(--primary);
  font-size: 12px;
  font-weight: 800;
}

.timestamp-chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.markdown-editor {
  margin-top: 20px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background-color: var(--surface);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--outline-variant);
  background-color: var(--surface-low);
  flex-shrink: 0;
}

.markdown-tools,
.markdown-modes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.markdown-toolbar button {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--on-surface-variant);
}

.markdown-toolbar button:hover,
.markdown-toolbar button.active {
  background-color: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-soft);
}

.markdown-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.markdown-body.mode-edit,
.markdown-body.mode-preview {
  grid-template-columns: 1fr;
}

.note-editor {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 18px;
  resize: none;
  overflow: auto;
  border: 0;
  border-right: 1px solid var(--outline-variant);
  outline: none;
  background-color: var(--surface);
  color: var(--on-surface);
  font-family: var(--font-body);
  font-size: 15px;
  line-height: 1.7;
}

.note-editor:focus {
  background-color: color-mix(in srgb, var(--surface) 92%, var(--primary-light));
}

.markdown-body.mode-edit .note-editor {
  border-right: 0;
}

.markdown-preview {
  min-width: 0;
  min-height: 0;
  padding: 18px 22px;
  overflow: auto;
  color: var(--on-surface);
  line-height: 1.75;
  background-color: var(--surface);
}

.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin: 0 0 12px;
  color: var(--on-surface);
  line-height: 1.25;
}

.markdown-preview :deep(p),
.markdown-preview :deep(blockquote),
.markdown-preview :deep(pre),
.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin: 0 0 12px;
}

.markdown-preview :deep(blockquote) {
  padding: 8px 12px;
  border-left: 3px solid var(--primary-container);
  color: var(--on-surface-variant);
  background-color: var(--surface-low);
}

.markdown-preview :deep(code) {
  padding: 2px 5px;
  border-radius: 5px;
  background-color: var(--surface-low);
  color: var(--primary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.markdown-preview :deep(pre) {
  padding: 12px;
  overflow-x: auto;
  border-radius: 10px;
  background-color: var(--surface-low);
}

.markdown-preview :deep(pre code) {
  padding: 0;
  background-color: transparent;
}

.markdown-preview :deep(a) {
  color: var(--primary);
  font-weight: 700;
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 22px;
}

.markdown-preview :deep(.note-inline-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 14px 0;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background-color: var(--surface-low);
}

.editor-footer {
  display: flex;
  flex-shrink: 0;
  justify-content: space-between;
  gap: 16px;
  min-height: 24px;
  margin-top: 10px;
  color: var(--on-surface-variant);
  font-size: 12px;
  font-weight: 700;
}

.editor-footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.word-count {
  color: var(--on-surface-variant);
}

.save-status {
  min-width: 86px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--on-surface-variant);
}

.save-status.saved {
  color: var(--primary);
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.editor-hint {
  margin-left: auto;
  text-align: right;
}

.dialog-message {
  color: var(--on-surface-variant);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-cancel,
.dialog-confirm {
  padding: 10px 24px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
}

.dialog-cancel {
  color: var(--on-surface-variant);
  background-color: var(--surface-low);
}

.dialog-confirm {
  color: white;
  background: linear-gradient(to right, var(--primary), var(--primary-container));
  box-shadow: var(--shadow-soft);
}

.dialog-confirm.danger {
  background: var(--error);
}

@media (max-width: 980px) {
  .notes-page {
    height: calc(100vh - 108px);
    overflow: hidden;
  }

  .notes-view {
    grid-template-columns: 280px minmax(0, 1fr);
    height: 100%;
  }

  .anime-column {
    height: 100%;
    min-height: 0;
    border-right: 1px solid var(--outline-variant);
    border-bottom: 0;
    padding-right: 20px;
    padding-bottom: 0;
    overflow: hidden;
  }

  .anime-search {
    position: relative;
  }

  .anime-list {
    flex: 1;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 0;
  }

  .notes-workspace {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .notes-list-area {
    overflow-y: auto;
    padding-right: 4px;
  }

  .editor-layout {
    height: calc(100vh - 108px);
  }

  .anime-item {
    flex: 0 0 auto;
  }

  .notes-toolbar,
  .editor-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions,
  .editor-actions {
    justify-content: flex-start;
  }

  .editor-heading {
    justify-content: flex-start;
  }

  .markdown-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .markdown-body {
    grid-template-columns: 1fr;
  }

  .note-editor {
    border-right: 0;
    border-bottom: 1px solid var(--outline-variant);
  }
}
</style>
