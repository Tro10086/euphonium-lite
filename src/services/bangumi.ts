import type { BangumiAnime, BangumiEpisode } from "@/models/Bangumi";

const BGM_API = 'https://api.bgm.tv/v0';

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
  const results = await searchSubjects(keyword);
  searchCache.set(keyword, results);
  return results;
}

async function searchSubjects(keyword: string): Promise<BangumiAnime[]> {
  const url = `${BGM_API}/search/subjects?limit=10`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, filter }),
  });
  if (!res.ok) throw new Error(`搜索失败: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

export async function getEpisodes(subject_id: number, limit: number): Promise<BangumiEpisode[]> {
  const url = `${BGM_API}/episodes?subject_id=${subject_id}&limit=${limit}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`获取剧集失败: ${res.status}`);
  const data = await res.json();
  return data.data || [];
}

// export async function fetchAnimeDetail(id: number): Promise<BangumiSearchResult> {
//   const res = await fetch(`${BGM_API}/subjects/${id}`);
//   if (!res.ok) throw new Error(`获取详情失败: ${res.status}`);
//   return await res.json();
// }