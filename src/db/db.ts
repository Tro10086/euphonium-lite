import Dexie from 'dexie'
import type { Anime, Episode } from '@/models/Anime';
import type { WatchHistory } from '@/models/History';
import type { VideoFile } from '@/models/File';


export class EuphoniumDB extends Dexie {
  anime!: Dexie.Table<Anime, string>
  episodes!: Dexie.Table<Episode, string>
  watchHistory!: Dexie.Table<WatchHistory, string>
  files!: Dexie.Table<VideoFile, string>; 

  constructor() {
    super('EuphoniumLite')
    this.version(1).stores({
      anime: 'id, name_cn, bangumi_id, bangumi_score, rating, status, date, updated_at',
      episodes: 'id, anime_id, ep, watched, watched_at, rating',
      watchHistory: 'id, anime_id, episode_id, watched_at',
      files: 'id',
      dirHandle: 'id'
    })
  }
}

export const db = new EuphoniumDB()
