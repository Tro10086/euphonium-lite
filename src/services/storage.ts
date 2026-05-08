import { db } from '@/db/db'
import type { Anime, Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import type { MatchRecord } from '@/models/Match'
import type { LibraryRoot } from '@/models/Library'
import type { UserCollection } from '@/models/Collection'
import { notesDb } from '@/services/notes'
import { rememberAnimeFilterOptions } from '@/services/filterOptions'

const toDate = (value: Date | string | number | null | undefined): Date | null => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const libraryRootAPI = {
  async add(root: LibraryRoot) {
    return db.libraryRoots.put(root)
  },

  async getById(id: string) {
    return db.libraryRoots.get(id)
  },

  async getAll() {
    return db.libraryRoots.toArray()
  },

  async update(id: string, changes: Omit<Partial<LibraryRoot>, 'id' | 'created_at'>) {
    return db.libraryRoots.update(id, { ...changes, updated_at: new Date() })
  },
}

const normalizeAnimeIds = (animeIds: string[] | undefined) =>
  Array.from(new Set((animeIds ?? []).filter(Boolean)))

export const collectionAPI = {
  async getAll() {
    return db.collections.orderBy('order').toArray()
  },

  async replaceAll(collections: UserCollection[]) {
    const existing = await db.collections.toArray()
    const existingIds = new Set(existing.map((collection) => collection.id))
    const nextIds = new Set(collections.map((collection) => collection.id))
    const removedIds = [...existingIds].filter((id) => !nextIds.has(id))

    const normalized = collections.map((collection, index) => ({
      ...collection,
      animeIds: normalizeAnimeIds(collection.animeIds),
      order: index,
      updated_at: new Date(),
    }))

    await db.transaction('rw', db.collections, async () => {
      if (normalized.length > 0) await db.collections.bulkPut(normalized)
      if (removedIds.length > 0) await db.collections.bulkDelete(removedIds)
    })

    return this.getAll()
  },

  async update(id: string, changes: Partial<Pick<UserCollection, 'label' | 'animeIds' | 'order'>>) {
    const existing = await db.collections.get(id)
    if (!existing) return 0

    return db.collections.update(id, {
      ...changes,
      ...(changes.animeIds ? { animeIds: normalizeAnimeIds(changes.animeIds) } : {}),
      updated_at: new Date(),
    })
  },

  async addAnimeIds(id: string, animeIds: string[]) {
    const collection = await db.collections.get(id)
    if (!collection) return 0
    return this.update(id, {
      animeIds: [...collection.animeIds, ...animeIds],
    })
  },

  async removeAnimeIds(id: string, animeIds: string[]) {
    const collection = await db.collections.get(id)
    if (!collection) return 0
    const removeSet = new Set(animeIds)
    return this.update(id, {
      animeIds: collection.animeIds.filter((animeId) => !removeSet.has(animeId)),
    })
  },

}

export const animeAPI = {
  async add(anime: Omit<Anime, 'id' | 'rating' | 'status' | 'created_at' | 'updated_at'>) {
    const now = new Date()
    const newAnime: Anime = {
      ...anime,
      id: crypto.randomUUID(),
      rating: 0,
      status: 'planned',
      is_favorite: anime.is_favorite ?? false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      purge_requested_at: null,
    }
    const id = await db.anime.add(newAnime)
    rememberAnimeFilterOptions(newAnime)
    return id
  },

  async getAll() {
    return db.anime.toArray()
  },

  async getById(id: string) {
    return db.anime.get(id)
  },

  async getByBangumiId(bangumi_id: number) {
    return db.anime.where('bangumi_id').equals(bangumi_id).first()
  },

  async update(id: string, changes: Omit<Partial<Anime>, 'id' | 'created_at' | 'updated_at'>) {
    return db.anime.update(id, { ...changes, updated_at: new Date() })
  },

  async moveToTrash(id: string) {
    return db.anime.update(id, {
      deleted_at: new Date(),
      purge_requested_at: null,
      updated_at: new Date(),
    })
  },

  async restoreFromTrash(id: string) {
    return db.anime.update(id, {
      deleted_at: null,
      purge_requested_at: null,
      updated_at: new Date(),
    })
  },

  async markTrashDeleted(id: string) {
    return db.anime.update(id, {
      deleted_at: new Date(),
      purge_requested_at: new Date(),
      updated_at: new Date(),
    })
  },

  async markTrashDeletedBulk(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids))
    const now = new Date()
    await Promise.all(uniqueIds.map((id) => db.anime.update(id, {
      deleted_at: now,
      purge_requested_at: now,
      updated_at: now,
    })))
    return uniqueIds.length
  },

  async purgeExpiredTrash(days = 7) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    const expired = await db.anime
      .filter((anime) => {
        const deletedAt = toDate(anime.deleted_at)
        return deletedAt && !anime.purge_requested_at ? deletedAt.getTime() <= cutoff : false
      })
      .toArray()

    if (expired.length === 0) return 0

    const now = new Date()
    await Promise.all(expired.map((anime) => db.anime.update(anime.id, {
      purge_requested_at: now,
      updated_at: now,
    })))

    return expired.length
  },

}

export const episodeAPI = {
  async bulkAdd(
    eps: Omit<Episode, 'id' | 'rating' | 'watched' | 'created_at' | 'updated_at'>[],
  ): Promise<Episode[]> {
    if (eps.length === 0) return []

    const now = new Date()
    const epsWithIds = eps.map((ep) => ({
      ...ep,
      id: crypto.randomUUID(),
      rating: 0,
      watched: false,
      created_at: now,
      updated_at: now,
    })) as Episode[]

    await db.episodes.bulkAdd(epsWithIds, { allKeys: true })
    return epsWithIds
  },

  async getAll() {
    return db.episodes.toArray()
  },

  async update(id: string, changes: Omit<Partial<Episode>, 'id' | 'updated_at'>) {
    return db.episodes.update(id, { ...changes, updated_at: new Date() })
  },

  async getByAnimeId(animeId: string) {
    return db.episodes.where('anime_id').equals(animeId).toArray()
  },
}

// 文件增删改查
export const fileAPI = {
  async getByIds(ids: string[]) {
    return db.files.where('id').anyOf(ids).toArray()
  },

  async getAll() {
    return db.files.toArray()
  },

  async getByRootId(rootId: string) {
    return db.files.where('root_id').equals(rootId).toArray()
  },

  async add(files: VideoFile[]) {
    if (files.length) await db.files.bulkAdd(files)
  },

  async update(files: VideoFile[]) {
    if (files.length) await db.files.bulkPut(files)
  },

  async markMissing(files: VideoFile[]) {
    if (files.length) {
      await db.files.bulkPut(files.map((file) => ({ ...file, scan_state: 'missing' as const })))
    }
  },

}

// 匹配记录增删改查
export const matchAPI = {
  async getAll(): Promise<MatchRecord[]> {
    return db.match.toArray()
  },

  async delete(key: string) {
    const existing = await this.getByFolderKey(key)
    return db.match.delete(existing?.keyword ?? key)
  },

  async getByFolderKey(folderKey: string) {
    return db.match.where('folder_key').equals(folderKey).first()
  },

  async add(
    match: Omit<MatchRecord, 'status' | 'selected_anime_id' | 'created_at' | 'updated_at'>,
  ) {
    const now = new Date()
    const folderKey = match.folder_key ?? match.keyword
    const searchKeyword = match.search_keyword ?? match.keyword
    const newMatchRecord: MatchRecord = {
      ...match,
      keyword: folderKey,
      folder_key: folderKey,
      search_keyword: searchKeyword,
      status: 'idle',
      selected_anime_id: 0,
      created_at: now,
      updated_at: now,
    }
    return db.match.add(newMatchRecord)
  },

  async update(
    key: string,
    changes: Omit<Partial<MatchRecord>, 'keyword' | 'name' | 'season' | 'created_at'>,
  ) {
    const existing = await this.getByFolderKey(key)
    return db.match.update(existing?.keyword ?? key, { ...changes, updated_at: new Date() })
  },

  async claimForImport(key: string, bangumiId: number) {
    let claimed = false
    await db.transaction('rw', db.match, async () => {
      const existing = await this.getByFolderKey(key)
      if (!existing || existing.status !== 'idle') return

      await db.match.update(existing.keyword, {
        status: 'mapping',
        selected_anime_id: bangumiId,
        updated_at: new Date(),
      })
      claimed = true
    })

    return claimed
  },
}

export const debugAPI = {
  async clearAll() {
    await Promise.all([db.delete(), notesDb.delete()])
  },
}
