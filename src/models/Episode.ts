export interface Episode {
  id: number;
  subjectId: number;
  ep: number;
  name: string;
  nameCn: string;
  airdate: string;
  duration: string;
  desc: string;
  filePath?: string // 视频文件相对路径，用于播放
  watched: boolean // 是否已看
  watched_at?: Date // 观看日期（用于热力图）
  rating: number // 单集评分 1-10，0 表示未评
  notes?: string // 单集观后感（富文本，可含时间戳）
}