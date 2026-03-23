import Dexie from 'dexie'
import type { Anime, Episode, WatchHistory } from './models'

export class EuphoniumDB extends Dexie {
  anime!: Dexie.Table<Anime, string>
  episodes!: Dexie.Table<Episode, string>
  watchHistory!: Dexie.Table<WatchHistory, string>

  constructor() {
    super('EuphoniumLite')
    this.version(1).stores({
      anime: 'id, title, status, type, rating, updated_at',
      episodes: 'id, anime_id, episode_number, watched, watched_at',
      watchHistory: 'id, anime_id, episode_id, watched_at',
    })
  }
}

export const db = new EuphoniumDB()
