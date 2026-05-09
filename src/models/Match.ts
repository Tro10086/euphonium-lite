export type MatchStatus =
  | 'idle' // 扫描完成，未开始匹配
  | 'selected' // 已经选择了 anime_id，未开始关联剧集
  | 'mapping' // 关联剧集集数和文件的过程中
  | 'completed' // 完成流程

export interface MatchRecord {
  folder_key?: string
  root_id?: string
  parent_path?: string
  folder_name?: string
  keyword: string // IndexedDB primary key; V2+ stores folder_key here for migration safety.
  search_keyword?: string
  name: string
  season: number
  status?: MatchStatus
  selected_anime_id: number
  selected_local_anime_id?: string
  candidate_bangumi_ids?: number[]
  draft_mappings: Record<number, string[]>
  unmapped_file_ids?: string[]
  extra_file_ids?: string[]
  offset?: number
  warnings?: string[]
  created_at?: Date
  updated_at?: Date
}
