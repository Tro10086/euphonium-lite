import Dexie from 'dexie'
import type { Anime, Episode, WatchHistory, VideoFile } from './models'

export class EuphoniumDB extends Dexie {
  anime!: Dexie.Table<Anime, string>
  episodes!: Dexie.Table<Episode, string>
  watchHistory!: Dexie.Table<WatchHistory, string>
  files!: Dexie.Table<VideoFile, string>; 

  constructor() {
    super('EuphoniumLite')
    this.version(1).stores({
      anime: 'id, title, status, type, rating, updated_at',
      episodes: 'id, anime_id, episode_number, watched, watched_at',
      watchHistory: 'id, anime_id, episode_id, watched_at',
      files: 'id, path, name, ext, parentPath',
      dirHandle: 'id'
    })
  }
}

export const db = new EuphoniumDB()
