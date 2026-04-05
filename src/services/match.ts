import { parseVideoFileName } from '@/utils/fileNameParser'
import { getSearchResults } from './bangumi'
import { fileAPI, matchAPI } from './storage'
import type { BangumiAnime } from '@/models/Bangumi'

export async function createMatch(): Promise<Map<string, BangumiAnime[]>> {
  const files = await fileAPI.getAll()

  // 去重：相同 keyword 只搜一次
  const pendingKeywords = new Map<
    string,
    { title: string; season: number; draft_mappings: Record<number, string[]> }
  >()

  for (const file of files) {
    const parsed = parseVideoFileName(file.name)
    if (!parsed?.title || !parsed.season || !parsed.episode) continue

    const seasonStr = parsed.season === 1 ? '' : `第${parsed.season}季`
    const keyword = `${parsed.title}${seasonStr}`

    const entry =
      pendingKeywords.get(keyword) ??
      pendingKeywords
        .set(keyword, {
          title: parsed.title,
          season: parsed.season,
          draft_mappings: {},
        })
        .get(keyword)!

    ;(entry.draft_mappings[parsed.episode] ??= []).push(file.id)
  }

  // 并行搜索
  const matchCandidate = new Map<string, BangumiAnime[]>()

  await Promise.all(
    Array.from(pendingKeywords.entries()).map(async ([keyword, info]) => {
      const existing = await matchAPI.getByKeyword(keyword)

      // 已完成或处理中，跳过
      if (existing) {
        if (existing.status !== 'idle') return
      } else {
        await matchAPI.add({
          keyword,
          name: info.title,
          season: info.season,
          draft_mappings: info.draft_mappings,
        })
      }

      try {
        const results = await getSearchResults(keyword)
        if (results.length === 0) {
          console.warn(`无搜索结果: ${keyword}`)
          return
        }

        matchCandidate.set(keyword, results)
      } catch (error) {
        console.error(`搜索失败: ${keyword}`, error)
      }
    }),
  )

  return matchCandidate
}

export async function selectMatch(keyword: string, bangumi_id: number) {
  const existing = await matchAPI.getByKeyword(keyword)
  if (!existing || existing?.status !== 'idle') return
  await matchAPI.update(keyword, {
    status: 'selected',
    selected_anime_id: bangumi_id,
  })
}

export async function mappingMatch(keyword: string, draft_mappings: Record<number, string[]>) {
  const existing = await matchAPI.getByKeyword(keyword)
  if (!existing || existing?.selected_anime_id) return
  await matchAPI.update(keyword, {
    status: 'mapping',
    draft_mappings: draft_mappings,
  })
}

export async function completeMatch(keyword: string) {
  const existing = await matchAPI.getByKeyword(keyword)
  if (!existing) return
  await matchAPI.update(keyword, {
    status: 'completed',
  })
}
