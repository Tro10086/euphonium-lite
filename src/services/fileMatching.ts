import { db } from '@/db/db';
import { parseVideoFileName } from '@/utils/fileNameParser';
import { getSearchResults } from './bangumi';
import type { MatchCandidate } from '@/models/MatchCandidate';

export async function scanAndMatch(): Promise<MatchCandidate[]> {
  const files = await db.files.toArray();
  const candidateCache = new Map<string, MatchCandidate>();

  for (const file of files) {
    const parsed = parseVideoFileName(file.name);
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