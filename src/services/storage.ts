import { db } from '@/db/db'
import type { Anime, Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import type { WatchHistory } from '@/models/History'
import type { MatchRecord } from '@/models/Match'
import type { LibraryRoot } from '@/models/Library'
import { notesDb } from '@/services/notes'

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
    return db.anime.add(newAnime)
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

  async delete(id: string) {
    return this.moveToTrash(id)
  },
}

export const episodeAPI = {
  async add(episode: Omit<Episode, 'id' | 'rating' | 'watched' | 'created_at' | 'updated_at'>) {
    const now = new Date()
    const newEpisode: Episode = {
      ...episode,
      id: crypto.randomUUID(),
      watched: false,
      rating: 0,
      created_at: now,
      updated_at: now,
    }
    return db.episodes.add(newEpisode)
  },

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

  async getById(id: string) {
    return db.episodes.get(id)
  },

  async update(id: string, changes: Omit<Partial<Episode>, 'id' | 'updated_at'>) {
    return db.episodes.update(id, { ...changes, updated_at: new Date() })
  },

  async delete(id: string) {
    return db.episodes.delete(id)
  },

  async getByAnimeId(animeId: string) {
    return db.episodes.where('anime_id').equals(animeId).toArray()
  },
  // 其他方法后续补充
}

// 观看历史相关操作（后续补充）
export const watchHistoryAPI = {
  async add(history: Omit<WatchHistory, 'id'>) {
    const newHistory: WatchHistory = { ...history, id: crypto.randomUUID() }
    return db.watchHistory.add(newHistory)
  },
}

// 文件增删改查
export const fileAPI = {
  async getById(id: string) {
    return db.files.get(id)
  },

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

  // // 删除文件时不采用级联删除，而是将episode表中的file_id设置为空
  // async delete(files: VideoFile[]): Promise<void> {
  //   if (files.length === 0) return
  //   const ids = files.map((f) => f.id)
  //   const idSet = new Set(ids)
  //   await db.transaction('rw', [db.files, db.episodes], async () => {
  //     // 遍历所有 episodes，从 file_ids 中移除指定的 id
  //     await db.episodes.toCollection().modify((ep) => {
  //       if (ep.file_ids && ep.file_ids.length > 0) {
  //         const filtered = ep.file_ids.filter((id) => !idSet.has(id))

  //         // 只在确实有变化时才更新（避免不必要的写入）
  //         if (filtered.length !== ep.file_ids.length) {
  //           ep.file_ids = filtered.length > 0 ? filtered : []
  //         }
  //       }
  //     })
  //     await db.files.bulkDelete(ids)
  //   })
  // },

  // 删除文件（利用 ep_id 快速定位）
  async delete(files: VideoFile[]) {
    if (files.length === 0) return

    // 按 ep_id 分组，避免重复更新同一 EP
    const epGroups = new Map<string, Set<string>>()

    for (const file of files) {
      if (file.ep_id) {
        const set = epGroups.get(file.ep_id) ?? new Set()
        set.add(file.id)
        epGroups.set(file.ep_id, set)
      }
    }

    await db.transaction('rw', [db.files, db.episodes], async () => {
      // 逐个 EP 更新（精确打击，无需扫描）
      for (const [epId, fileIdSet] of epGroups) {
        await db.episodes.where({ id: epId }).modify((ep) => {
          if (ep.file_ids) {
            ep.file_ids = ep.file_ids.filter((id) => !fileIdSet.has(id))
            if (ep.file_ids.length === 0) delete ep.file_ids
          }
        })
      }

      await db.files.bulkDelete(files.map((f) => f.id))
    })
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

  async getByKeyword(keyword: string) {
    return (
      (await db.match.where('search_keyword').equals(keyword).first()) ??
      (await db.match.where('keyword').equals(keyword).first())
    )
  },

  async getByFolderKey(folderKey: string) {
    return db.match.where('folder_key').equals(folderKey).first()
  },

  async getByKey(key: string) {
    return db.match.get(key)
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
