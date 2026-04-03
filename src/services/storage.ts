import { db } from '@/db/db'
import type { Anime, Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'
import type { WatchHistory } from '@/models/History'
import type { MatchRecord } from '@/models/Match'

export const animeAPI = {
  async add(anime: Omit<Anime, 'id' | 'created_at' | 'updated_at'>) {
    const now = new Date()
    const newAnime: Anime = {
      ...anime,
      id: crypto.randomUUID(),
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

  async update(id: string, changes: Omit<Partial<Anime>, 'id' | 'created_at' | 'updated_at'>) {
    return db.anime.update(id, { ...changes, updated_at: new Date() })
  },

  async delete(id: string) {
    return db.anime.delete(id)
  },
}

export const episodeAPI = {
  async add(episode: Omit<Episode, 'id' | 'last_matched_at'>) {
    const newEpisode: Episode = { 
      ...episode, 
      id: crypto.randomUUID(),
      last_matched_at: new Date()
    }
    return db.episodes.add(newEpisode)
  },

  async getAll() {
    return db.episodes.toArray()
  },

  async getById(id: string) {
    return db.episodes.get(id)
  },

  async update(id: string, changes: Omit<Partial<Anime>, 'id' | 'last_matched_at'>) {
    return db.episodes.update(id, { ...changes, last_matched_at: new Date() })
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
    return db.files.get(id);
  },

  async getAll() {
    return db.files.toArray();
  },

  async add(files: VideoFile[]): Promise<void> {
    if (files.length) await db.files.bulkAdd(files);
  },

  async update(files: VideoFile[]): Promise<void> {
    if (files.length) await db.files.bulkPut(files);
  },

  // 删除文件时不采用级联删除，而是将episode表中的file_id设置为空
  async delete(files: VideoFile[]): Promise<void> {
    if (files.length === 0) return;
    const ids = files.map(f => f.id);
    await db.transaction('rw', [db.files, db.episodes], async () => {
      await db.episodes
        .where('file_id')
        .anyOf(ids)
        .modify({ file_id: null });
      
      await db.files.bulkDelete(ids);
    });
  },
}

// 匹配记录增删改查
export const matchAPI = {
  async getByKeyword(keyword: string) {
    return db.match.get(keyword);
  },

  async add(match: Omit<MatchRecord, 'status' | 'createAt' | 'updatedAt'>) {
    const now = new Date();
    const newMatchRecord: MatchRecord = { 
      ...match, 
      status: 'idle',
      created_at: now,
      updated_at: now,
    }
    return db.match.add(newMatchRecord)
  },
}
