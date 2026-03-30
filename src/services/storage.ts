import { db } from '@/db/db'
import type { Anime, Episode, WatchHistory } from '@/db/models'

// 生成 UUID 的工具函数
const generateId = (): string => crypto.randomUUID()

// 番剧相关操作
export const animeAPI = {
  async add(anime: Omit<Anime, 'id' | 'created_at' | 'updated_at'>) {
    const now = new Date()
    const newAnime: Anime = {
      ...anime,
      id: generateId(),
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

  async update(id: string, changes: Partial<Anime>) {
    return db.anime.update(id, { ...changes, updated_at: new Date() })
  },

  async delete(id: string) {
    return db.anime.delete(id)
  },
}

// 剧集相关操作（暂时先只写基础，后续会用到）
export const episodeAPI = {
  async add(episode: Omit<Episode, 'id'>) {
    const newEpisode: Episode = { ...episode, id: generateId() }
    return db.episodes.add(newEpisode)
  },
  async getByAnimeId(animeId: string) {
    return db.episodes.where('anime_id').equals(animeId).toArray()
  },
  // 其他方法后续补充
}

// 观看历史相关操作（后续补充）
export const watchHistoryAPI = {
  async add(history: Omit<WatchHistory, 'id'>) {
    const newHistory: WatchHistory = { ...history, id: generateId() }
    return db.watchHistory.add(newHistory)
  },
}
