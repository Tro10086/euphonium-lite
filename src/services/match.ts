import { db } from '@/db/db';
import { parseVideoFileName } from '@/utils/fileNameParser';
import { getSearchResults } from './bangumi';
import type { MatchCandidate } from '@/models/Match';
import { fileAPI, matchAPI } from './storage';
import type { BangumiAnime } from '@/models/Bangumi';

export async function match(): Promise<Map<string, BangumiAnime[]>> {
  const files = await fileAPI.getAll();
  
  // 去重：相同 keyword 只搜一次
  const pendingKeywords = new Map<string, { title: string; season: number }>();
  
  for (const file of files) {
    const parsed = parseVideoFileName(file.name);
    if (!parsed?.title || !parsed.season || !parsed.episode) continue;
    
    const seasonStr = parsed.season === 1 ? '' : `第${parsed.season}季`;
    const keyword = `${parsed.title}${seasonStr}`;
    
    if (!pendingKeywords.has(keyword)) {
      pendingKeywords.set(keyword, { title: parsed.title, season: parsed.season });
    }
  }
  
  // 并行搜索
  const matchCandidate = new Map<string, BangumiAnime[]>();
  
  await Promise.all(
    Array.from(pendingKeywords.entries()).map(async ([keyword, info]) => {
      const existing = await matchAPI.getByKeyword(keyword);
      
      // 已完成或处理中，跳过
      if (existing && existing.status !== 'idle') {
        return;
      }
      if (existing) {
        if (existing.status !== 'idle') 
          return;
      } else {
        await matchAPI.add({
          keyword,
          name: info.title,
          season: info.season,
        });
      }
      
      try {
        const results = await getSearchResults(keyword);
        if (results.length === 0) {
          console.warn(`无搜索结果: ${keyword}`);
          return;
        }
        
        matchCandidate.set(keyword, results);
      } catch (error) {
        console.error(`搜索失败: ${keyword}`, error);
      }
    })
  );
  
  return matchCandidate;
}

export async function scanAndMatch(): Promise<MatchCandidate[]> {
  const files = await db.files.toArray();
  const candidateCache = new Map<string, MatchCandidate>();

  for (const file of files) {
    const parsed = parseVideoFileName(file.name);
    const { title, season, episode } = parsed || {}
    if (parsed && parsed.title && parsed.episode && parsed.season) {
      const keyword = `${parsed.title} ${parsed.season}`
      const ep = parsed.episode;
      if (candidateCache.has(keyword)) {
        const cached = candidateCache.get(keyword);
        if (cached) {
          cached.videoFiles[ep]?.push(file);
        }
      } else {
        try {
          const results = await getSearchResults(keyword);
          const matchCandidate: MatchCandidate = {
            animes: results,
            videoFiles: {},
          };
          (matchCandidate.videoFiles[ep] ??= []).push(file);
          candidateCache.set(keyword, matchCandidate);
        } catch (error) {
          console.error(`搜索失败: ${keyword}`, error);
        }
      }
    }
  }

  return Array.from(candidateCache.values());
}