import { db } from '@/db/db'
import type { Anime, Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import type { WatchHistory } from '@/models/History'
import type { MatchRecord } from '@/models/Match'

export const animeAPI = {
  async add(anime: Omit<Anime, 'id' | 'rating' | 'status' | 'created_at' | 'updated_at'>) {
    const now = new Date()
    const newAnime: Anime = {
      ...anime,
      id: crypto.randomUUID(),
      rating: 0,
      status: 'planned',
      created_at: now,
      updated_at: now,
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

  async delete(id: string) {
    return db.anime.delete(id)
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

  async add(files: VideoFile[]) {
    if (files.length) await db.files.bulkAdd(files)
  },

  async update(files: VideoFile[]) {
    if (files.length) await db.files.bulkPut(files)
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

  async delete(keyword: string) {
    return db.match.delete(keyword)
  },

  async getByKeyword(keyword: string) {
    return db.match.get(keyword)
  },

  async add(
    match: Omit<MatchRecord, 'status' | 'selected_anime_id' | 'created_at' | 'updated_at'>,
  ) {
    const now = new Date()
    const newMatchRecord: MatchRecord = {
      ...match,
      status: 'idle',
      selected_anime_id: 0,
      created_at: now,
      updated_at: now,
    }
    return db.match.add(newMatchRecord)
  },

  async update(
    keyword: string,
    changes: Omit<Partial<MatchRecord>, 'keyword' | 'name' | 'season' | 'created_at'>,
  ) {
    return db.match.update(keyword, { ...changes, updated_at: new Date() })
  },
}

export const debugAPI = {
  async clearAll() {
    await db.delete()
    window.location.reload()
  },
}
