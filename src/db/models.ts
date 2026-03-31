// 观看状态枚举
export type AnimeStatus = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped'

// 番剧类型枚举
export type AnimeType = 'TV' | 'OVA' | 'Movie' | 'Special' | 'Other'

// 番剧主表
export interface Anime {
  id: string // UUID
  name_cn: string // 中文名
  name?: string // 日文/英文名
  bangumi_id?: number // Bangumi ID
  cover?: string // 封面图片 URL
  summary?: string // 简介
  rating: number // 个人评分 1-10，0 表示未评
  bangumi_score: number
  status: AnimeStatus
  // type: AnimeType
  tags: string[] // 标签数组
  total_episodes: number // 总集数
  date?: string // 首播季，如 "2025-04"
  created_at: Date
  updated_at: Date
  overall_notes?: string // 整体观后感（富文本，可含时间戳）
}

// 剧集表
export interface Episode {
  id: string // UUID
  anime_id: string // 关联的番剧 ID
  episode_number: number // 集数
  file_id?: string // 视频文件相对路径，用于播放
  name: string;
  nameCn: string;
  airdate: string;
  duration_seconds: string;
  desc: string;
  watched: boolean // 是否已看
  watched_at?: Date // 观看日期（用于热力图）
  rating: number // 单集评分 1-10，0 表示未评
  notes?: string // 单集观后感（富文本，可含时间戳）
  // 记录最后一次关联的文件信息（用于追溯）
  last_file_path?: string   // 文件路径缓存
  last_matched_at?: Date    // 最后匹配时间
}

// 观看历史（用于热力图）
export interface WatchHistory {
  id: string // UUID
  anime_id: string
  episode_id: string
  watched_at: Date // 精确到日（或可精确到分钟）
}

// 视频文件
export interface VideoFile {
  id: string;              // 文件唯一标识（可使用路径 hash）
  path: string;            // 相对于授权目录的路径（用于显示和播放）
  name: string;            // 文件名
  ext: string;             // 扩展名
  size: number;            // 文件大小（字节）
  modified: number;        // 最后修改时间戳
  parentPath: string;      // 父目录相对路径（便于分组）
}
