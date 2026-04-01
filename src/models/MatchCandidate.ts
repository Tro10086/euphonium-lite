import type { BangumiAnime } from "./Bangumi";
import type { VideoFile } from "./File";


export interface MatchPreviewGroup {
  key: string;                    // 聚合键
  title: string;
  season: number;
  candidates: BangumiAnime[];           // 候选动画列表
  selectedAnimeId?: number;       // 用户选择的动画ID
  files: {                        // 文件按集数分组
    [episodeNumber: number]: VideoFile[];
  };
  // 可选：允许用户手动覆盖某个文件的集数
  overrides?: { [fileId: string]: number };
}
