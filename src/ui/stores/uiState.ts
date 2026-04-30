import { reactive, watch } from 'vue'
import type { UserCollection } from '@/models/Collection'

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
  userRating?: number
  tags: string[]
  desc: string
  image: string
  episodesList: string[]
  deletedAt?: Date | null
  purgeRequestedAt?: Date | null
  isFavorite?: boolean
  watchedEpisodes?: number
  watchProgress?: number
  createdAt?: Date | null
  updatedAt?: Date | null
  lastWatchedAt?: Date | null
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
  sortOrder: 'name' | 'rating' | 'time' | 'recent'
  isFilterBarOpen: boolean
  searchQuery: string
  selectedMedia: CollectionItem | null
  isCollectionModalOpen: boolean
  libraryVersion: number
  navItems: NavItem[]
  customCollections: UserCollection[]
  settings: UISettings
}

const SETTINGS_STORAGE_KEY = 'euphonium-ui-settings'
const NAV_ORDER_STORAGE_KEY = 'euphonium-nav-order'

export const builtinNavItems: NavItem[] = [
  { id: 'all', label: '全部' },
  { id: 'recent', label: '最近' },
  { id: 'fav', label: '收藏' },
  { id: 'trash', label: '回收站' },
]

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

function loadPersistedNavOrder(): string[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function persistNavOrder(navItems: NavItem[]) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(
      NAV_ORDER_STORAGE_KEY,
      JSON.stringify(navItems.map((item) => item.id)),
    )
  } catch {
    // Ignore storage failures; order still works in memory.
  }
}

export function buildNavItems(
  customCollections: UserCollection[],
  orderedIds: string[] = loadPersistedNavOrder(),
): NavItem[] {
  const builtinsById = new Map(builtinNavItems.map((item) => [item.id, item]))
  const customItems = customCollections
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((collection) => ({
      id: collection.id,
      label: collection.label,
    }))
  const customById = new Map(customItems.map((item) => [item.id, item]))
  const defaultOrder = [...builtinNavItems, ...customItems]
  const availableIds = new Set(defaultOrder.map((item) => item.id))

  const mergedIds = [
    ...orderedIds.filter((id) => availableIds.has(id)),
    ...defaultOrder.map((item) => item.id).filter((id) => !orderedIds.includes(id)),
  ]

  return mergedIds
    .map((id) => builtinsById.get(id) ?? customById.get(id))
    .filter((item): item is NavItem => Boolean(item))
}

export const uiState = reactive<UIState>({
  homeFilter: 'all',
  activeYear: 'all',
  activeGenre: 'all',
  sortOrder: 'recent',
  isFilterBarOpen: false,
  searchQuery: '',
  selectedMedia: null,
  isCollectionModalOpen: false,
  libraryVersion: 0,
  navItems: buildNavItems([]),
  customCollections: [],
  settings: {
    ...defaultSettings,
    ...loadPersistedSettings(),
  },
})

export function rebuildNavItems(
  customCollections: UserCollection[] = uiState.customCollections,
  orderedIds?: string[],
) {
  uiState.customCollections = customCollections
  uiState.navItems = buildNavItems(customCollections, orderedIds)
}

watch(
  () => uiState.settings,
  (settings) => persistSettings(settings),
  { deep: true },
)

watch(
  () => uiState.navItems.map((item) => item.id),
  () => persistNavOrder(uiState.navItems),
  { deep: true },
)
