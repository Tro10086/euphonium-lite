import type { BangumiAnime } from "@/models/BangumiAnime";

const BGM_API = 'https://api.bgm.tv/v0';

// export interface BangumiSearchResult {
//   id: number;
//   name: string;
//   name_cn: string;
//   summary: string;
//   images: { large: string; common: string; medium: string; small: string; grid: string };
//   date?: string;
//   eps: number;
//   type: number; // 1:书籍 2:动画 3:音乐 4:游戏 6:三次元
// }

const filter = {
  type: [2],  // 固定为动画
};

const searchCache = new Map<string, BangumiAnime[]>();

export async function getSearchResults(keyword: string): Promise<BangumiAnime[]> {
  if (searchCache.has(keyword)) {
    console.log(`[Cache hit] ${keyword}`);
    return searchCache.get(keyword)!;
  }
  console.log(`[Cache miss] ${keyword} → fetching`);
  const results = await searchAnime(keyword);
  searchCache.set(keyword, results);
  return results;
}

async function searchAnime(keyword: string): Promise<BangumiAnime[]> {
  const res = await fetch(`${BGM_API}/search/subjects?limit=10`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, filter }),
  });
  if (!res.ok) throw new Error(`搜索失败: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// export async function fetchAnimeDetail(id: number): Promise<BangumiSearchResult> {
//   const res = await fetch(`${BGM_API}/subjects/${id}`);
//   if (!res.ok) throw new Error(`获取详情失败: ${res.status}`);
//   return await res.json();
// }