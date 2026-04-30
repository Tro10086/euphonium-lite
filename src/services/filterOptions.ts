import type { Anime } from '@/models/Anime'

export interface LibraryFilterOptions {
  years: string[]
  tags: string[]
}

const STORAGE_KEY = 'euphonium-library-filter-options'

const emptyOptions = (): LibraryFilterOptions => ({
  years: [],
  tags: [],
})

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readOptions(): LibraryFilterOptions {
  if (!canUseLocalStorage()) return emptyOptions()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyOptions()

    const parsed = JSON.parse(raw) as Partial<LibraryFilterOptions>
    return {
      years: Array.isArray(parsed.years)
        ? parsed.years.map(String).filter(Boolean)
        : [],
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : [],
    }
  } catch {
    return emptyOptions()
  }
}

function writeOptions(options: LibraryFilterOptions) {
  if (!canUseLocalStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
  } catch {
    // Local filter options are a convenience cache; failing to persist should not block import.
  }
}

function animeYear(anime: Pick<Anime, 'air_year' | 'date'>) {
  const year = anime.air_year || Number.parseInt((anime.date ?? '').slice(0, 4), 10)
  return Number.isFinite(year) && year > 0 ? String(year) : ''
}

export function loadLibraryFilterOptions(): LibraryFilterOptions {
  return readOptions()
}

export function rememberAnimeFilterOptions(
  anime: Pick<Anime, 'air_year' | 'date' | 'tags'>,
): LibraryFilterOptions {
  return rememberAnimeFilterOptionsBulk([anime])
}

export function rememberAnimeFilterOptionsBulk(
  animes: Array<Pick<Anime, 'air_year' | 'date' | 'tags'>>,
): LibraryFilterOptions {
  const current = readOptions()
  const years = new Set(current.years)
  const tags = new Set(current.tags)

  for (const anime of animes) {
    const year = animeYear(anime)
    if (year) years.add(year)

    for (const tag of anime.tags ?? []) {
      const trimmed = tag.trim()
      if (trimmed) tags.add(trimmed)
    }
  }

  const next = {
    years: Array.from(years).sort((a, b) => Number(b) - Number(a)),
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  }

  writeOptions(next)
  return next
}
