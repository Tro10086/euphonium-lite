export interface VideoFile {
  id: string // UUID
  root_id?: string
  ep_id?: string
  anime_id?: string
  name: string // 文件名
  path: string // 相对授权目录的路径
  parent_path?: string // 父目录相对路径
  ext: string // 扩展名
  size: number // 文件大小（字节）
  modified: number // 最后修改时间戳
  quickHash: string // 采样哈希
  fullHash?: string
  scan_state?: 'active' | 'missing' | 'ignored'
  last_seen_at?: number
  lastScan: number
}

export interface ParsedFileInfo {
  title: string // 提取的番剧名（中文或日文）
  season: number // 季数，默认1
  episode: number // 集数，默认0（表示无法解析）
}
