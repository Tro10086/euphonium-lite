import type { BangumiAnime } from './Bangumi'
import type { VideoFile } from './File'

export interface MatchPreviewGroup {
  key: string // 聚合键
  title: string
  season: number
  candidates: BangumiAnime[] // 候选动画列表
  selectedAnimeId?: number // 用户选择的动画ID
  files: {
    // 文件按集数分组
    [episodeNumber: number]: VideoFile[]
  }
  // 可选：允许用户手动覆盖某个文件的集数
  overrides?: { [fileId: string]: number }
}

export type MatchStatus =
  | 'idle' // 扫描完成，未开始匹配
  | 'selected' // 已经选择了 anime_id，未开始关联剧集
  | 'mapping' // 关联剧集集数和文件的过程中
  | 'completed' // 完成流程

export interface MatchRecord {
  keyword: string
  name: string
  season: number
  status?: MatchStatus
  selected_anime_id: number
  draft_mappings: Record<number, string[]>
  created_at?: Date
  updated_at?: Date
}
