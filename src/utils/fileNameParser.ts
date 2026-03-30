export interface ParsedFileInfo {
  title: string;      // 提取的番剧名（中文或日文）
  season: number;     // 季数，默认1
  episode: number;    // 集数，默认0（表示无法解析）
  confidence: number; // 置信度，0-1
}

export function formatParsedFileInfo(info: ParsedFileInfo): string {
  return `标题: ${info.title}, 季: ${info.season}, 集: ${info.episode}`;
}

// 常见集数模式正则
const episodePatterns = [
  /[\[(]?(\d+)[\])\s_-]*(?:话|集|话)?/,               // [01], (01), 01话, 01集
  /[Ss](\d+)[Ee](\d+)/,                               // S01E02
  /第(\d+)话/,                                         // 第1话
  /EP?(\d+)/i,                                         // EP01, EP1
];

// 常见杂质词（字幕组、分辨率等）
const cleanupRegex = /(\[.*?\]|\(.*?\)|\s*-\s*|\d{3,4}p|1080p|720p|HEVC|x264|x265|AAC|FLAC|字幕组)/gi;

export function parseVideoFileName(fileName: string): ParsedFileInfo {
  // 去除扩展名
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  // 去除杂质
  let cleaned = nameWithoutExt.replace(cleanupRegex, '');
  
  // 尝试提取集数
  let episode = 0;
  let confidence = 0;
  for (const pattern of episodePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      episode = parseInt(match[1]!, 10);
      confidence = 0.9;
      // 从原字符串中移除集数部分，得到番剧名
      cleaned = cleaned.replace(pattern, '');
      break;
    }
  }
  
  // 如果没找到集数，尝试从文件名中寻找纯数字（可能为集数）
  if (episode === 0) {
    const digitMatch = cleaned.match(/\b(\d{1,2})\b/);
    if (digitMatch && parseInt(digitMatch[1]!, 10) <= 200) {
      episode = parseInt(digitMatch[1]!, 10);
      confidence = 0.6;
      cleaned = cleaned.replace(digitMatch[0], '');
    }
  }
  
  // 清理多余空格和分隔符
  let title = cleaned.trim().replace(/\s+/g, ' ').replace(/[_-]+$/, '');
  
  // 尝试提取季数（S02, 第二季等）
  let season = 1;
  const seasonMatch = title.match(/[Ss](\d+)/) || title.match(/第(\d+)季/);
  if (seasonMatch) {
    season = parseInt(seasonMatch[1]!, 10);
    title = title.replace(seasonMatch[0], '');
  }
  
  // 如果 title 为空，则使用原始文件名（去除扩展名和杂质后）
  if (!title) {
    title = nameWithoutExt.replace(cleanupRegex, '').trim();
    confidence = Math.max(0.3, confidence);
  }
  
  return { title, season, episode, confidence };
}