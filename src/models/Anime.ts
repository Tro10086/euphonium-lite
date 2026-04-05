export type AnimeStatus = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped'

export interface Anime {
  id: string // UUID
  name_cn: string // 中文名
  name?: string // 日文/英文名
  bangumi_id?: number // Bangumi 条目 ID
  cover?: string // 封面 URL
  summary?: string // 简介
  bangumi_score?: number // Bangumi 评分
  rating: number // 个人评分 (1-10, 0=未评)
  status: AnimeStatus // 观看状态
  tags: string[] // 标签数组
  total_episodes: number // 总集数（由 API 提供）
  date?: string // 首播日期 YYYY-MM-DD
  created_at: Date // 创建时间
  updated_at: Date // 更新时间
  overall_notes?: string // 整体观后感（富文本）
}

export interface Episode {
  id: string // UUID
  anime_id: string // 关联 anime.id
  ep: number // 集数（从 1 开始）
  name?: string // 日文/英文标题
  name_cn?: string // 中文标题
  airdate?: string // 播出日期
  duration_seconds?: number // 时长（秒）
  desc?: string // 简介
  file_ids?: string[] // 关联 files.id（可为空，支持多文件时需改为一对多）
  last_file_path?: string | null // 最后一次关联的文件路径（备份）
  watched: boolean // 是否已看
  watched_at?: Date | null // 观看日期
  rating: number // 单集评分 (0-10)
  notes?: string // 单集观后感（富文本）
  created_at: Date // 创建时间
  updated_at: Date // 更新时间
}
