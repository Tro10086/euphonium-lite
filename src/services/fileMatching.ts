import { db } from '@/db/db';
import { parseVideoFileName, type ParsedFileInfo } from '@/utils/fileNameParser';
import { searchAnime, type BangumiSearchResult } from './bangumi';

export interface MatchCandidate {
  fileId: string;
  filePath: string;
  fileName: string;
  parsed: ParsedFileInfo | null;          // 解析结果，可能为null
  suggestions: BangumiSearchResult[];      // 搜索候选列表
  selectedSuggestionId?: number;            // 用户选择的条目id
}

export async function scanAndMatch(): Promise<MatchCandidate[]> {
  const files = await db.files.toArray();   // 从IndexedDB获取所有视频文件
  const candidates: MatchCandidate[] = [];
  const titleCache = new Map<string, BangumiSearchResult[]>(); // 缓存搜索结果，避免重复请求

  for (const file of files) {
    const parsed = parseVideoFileName(file.name);
    let suggestions: BangumiSearchResult[] = [];
    if (parsed && parsed.title) {
      // 检查缓存
      if (titleCache.has(parsed.title)) {
        suggestions = titleCache.get(parsed.title)!;
      } else {
        try {
          suggestions = await searchAnime(parsed.title);
          titleCache.set(parsed.title, suggestions);
        } catch (error) {
          console.error(`搜索失败: ${parsed.title}`, error);
          suggestions = [];
        }
      }
    }

    candidates.push({
      fileId: file.id,
      filePath: file.path,
      fileName: file.name,
      parsed,
      suggestions,
      selectedSuggestionId: suggestions[0]?.id, // 默认选中第一个
    });
  }

  return candidates;
}