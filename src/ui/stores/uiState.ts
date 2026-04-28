import { reactive, watch } from 'vue'

export interface NavItem {
  id: string
  label: string
}

export interface CollectionItem {
  id: string | number
  title: string
  meta: string
  year: number
  episodes: number
  score: number
  tags: string[]
  desc: string
  image: string
  episodesList: string[]
  deletedAt?: Date | null
  purgeRequestedAt?: Date | null
  isFavorite?: boolean
}

interface UISettings {
  theme: 'light' | 'dark' | 'system'
  compactMode: boolean
  defaultRegex: string
  customRegex: string
  cacheSize: string
}

interface UIState {
  homeFilter: string
  activeYear: string
  activeGenre: string
  sortOrder: 'newest' | 'oldest'
  isFilterBarOpen: boolean
  searchQuery: string
  selectedMedia: CollectionItem | null
  isCollectionModalOpen: boolean
  navItems: NavItem[]
  settings: UISettings
}

const SETTINGS_STORAGE_KEY = 'euphonium-ui-settings'

const defaultSettings: UISettings = {
  theme: 'light',
  compactMode: false,
  defaultRegex: '^\\[(?<author>.*?)\\] (?<title>.*?) \\((?<year>\\d{4})\\)$',
  customRegex: '',
  cacheSize: 'IndexedDB',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadPersistedSettings(): Partial<UISettings> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return {}

    const settings: Partial<UISettings> = {}
    if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
      settings.theme = parsed.theme
    }
    if (typeof parsed.compactMode === 'boolean') settings.compactMode = parsed.compactMode
    if (typeof parsed.defaultRegex === 'string') settings.defaultRegex = parsed.defaultRegex
    if (typeof parsed.customRegex === 'string') settings.customRegex = parsed.customRegex
    if (typeof parsed.cacheSize === 'string') settings.cacheSize = parsed.cacheSize
    return settings
  } catch {
    return {}
  }
}

function persistSettings(settings: UISettings) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        theme: settings.theme,
        compactMode: settings.compactMode,
        defaultRegex: settings.defaultRegex,
        customRegex: settings.customRegex,
        cacheSize: settings.cacheSize,
      }),
    )
  } catch {
    // Ignore storage quota/private-mode failures; settings still work in memory.
  }
}

export const uiState = reactive<UIState>({
  homeFilter: 'all',
  activeYear: 'all',
  activeGenre: 'all',
  sortOrder: 'newest',
  isFilterBarOpen: false,
  searchQuery: '',
  selectedMedia: null,
  isCollectionModalOpen: false,
  navItems: [
    { id: 'all', label: '全部' },
    { id: 'recent', label: '最近' },
    { id: 'fav', label: '收藏' },
    { id: 'trash', label: '回收站' },
  ],
  settings: {
    ...defaultSettings,
    ...loadPersistedSettings(),
  },
})

watch(
  () => uiState.settings,
  (settings) => persistSettings(settings),
  { deep: true },
)
