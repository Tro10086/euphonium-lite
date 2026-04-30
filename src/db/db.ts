import Dexie from 'dexie'
import type { Anime, Episode } from '@/models/Anime';
import type { WatchHistory } from '@/models/History';
import type { VideoFile } from '@/models/File';
import type { MatchRecord } from '@/models/Match';
import type { LibraryRoot } from '@/models/Library';
import type { UserCollection } from '@/models/Collection';


export class EuphoniumDB extends Dexie {
  libraryRoots!: Dexie.Table<LibraryRoot, string>
  dirHandle!: Dexie.Table<{ id: string; handle: FileSystemDirectoryHandle }, string>
  anime!: Dexie.Table<Anime, string>
  episodes!: Dexie.Table<Episode, string>
  watchHistory!: Dexie.Table<WatchHistory, string>
  files!: Dexie.Table<VideoFile, string>; 
  match!: Dexie.Table<MatchRecord, string>; 
  collections!: Dexie.Table<UserCollection, string>

  constructor() {
    super('EuphoniumLite')
    this.version(1).stores({
      anime: 'id, name_cn, bangumi_id, bangumi_score, rating, status, date, updated_at',
      episodes: 'id, anime_id, file_id, ep, watched, watched_at, rating',
      watchHistory: 'id, anime_id, episode_id, watched_at',
      files: 'id',
      dirHandle: 'id',
      match: 'keyword'
    })

    this.version(2)
      .stores({
        libraryRoots: 'id, name, updated_at, last_scanned_at',
        anime: 'id, bangumi_id, name_cn, bangumi_score, rating, status, date, air_year, updated_at',
        episodes:
          'id, anime_id, bangumi_episode_id, ep, sort, type, watched, watched_at, rating, updated_at, [anime_id+ep], [anime_id+sort]',
        watchHistory: 'id, anime_id, episode_id, watched_at',
        files:
          'id, root_id, path, parent_path, quickHash, ep_id, anime_id, scan_state, last_seen_at, [root_id+path], [size+quickHash]',
        dirHandle: 'id',
        match:
          'keyword, folder_key, search_keyword, root_id, parent_path, status, selected_anime_id, updated_at',
      })
      .upgrade((transaction) =>
        transaction
          .table('match')
          .toCollection()
          .modify((record) => {
            record.folder_key ??= record.keyword
            record.search_keyword ??= record.name ?? record.keyword
          }),
      )

    this.version(3).stores({
      libraryRoots: 'id, name, updated_at, last_scanned_at',
      anime: 'id, bangumi_id, name_cn, bangumi_score, rating, status, date, air_year, updated_at',
      episodes:
        'id, anime_id, bangumi_episode_id, ep, sort, type, watched, watched_at, rating, updated_at, [anime_id+ep], [anime_id+sort]',
      watchHistory: 'id, anime_id, episode_id, watched_at',
      files:
        'id, root_id, path, parent_path, quickHash, ep_id, anime_id, scan_state, last_seen_at, [root_id+path], [size+quickHash]',
      dirHandle: 'id',
      match:
        'keyword, folder_key, search_keyword, root_id, parent_path, status, selected_anime_id, updated_at',
      collections: 'id, label, order, updated_at',
    })
  }
}

export const db = new EuphoniumDB()
