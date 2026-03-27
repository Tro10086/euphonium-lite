const BGM_API = 'https://api.bgm.tv/v0';

export interface BangumiSearchResult {
  id: number;
  name: string;
  name_cn: string;
  summary: string;
  images: { large: string; common: string; medium: string; small: string; grid: string };
  date?: string;
  eps: number;
  type: number; // 1:书籍 2:动画 3:音乐 4:游戏 6:三次元
}

export async function searchAnime(keyword: string): Promise<BangumiSearchResult[]> {
  const res = await fetch(`${BGM_API}/search/subjects?limit=10`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword }),
  });
  if (!res.ok) throw new Error(`搜索失败: ${res.status}`);
  const data = await res.json();
  // 根据官方文档，返回的数据结构为 { data: [...] }
  console.log(data)
  return data.data || [];
}

export async function fetchAnimeDetail(id: number): Promise<BangumiSearchResult> {
  const res = await fetch(`${BGM_API}/subjects/${id}`);
  if (!res.ok) throw new Error(`获取详情失败: ${res.status}`);
  return await res.json();
}