export interface WatchHistory {
  id: string // UUID
  anime_id: string
  episode_id: string
  watched_at: Date // 精确到日（或可精确到分钟）
}