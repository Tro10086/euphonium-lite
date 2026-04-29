import { parseVideoFileName } from '@/utils/fileNameParser'
import { getSearchResults } from './bangumi'
import { fileAPI, matchAPI } from './storage'
import type { BangumiAnime } from '@/models/Bangumi'

const MANUAL_NO_MATCH_WARNING = '无法匹配，无法关联'

function withoutManualNoMatchWarning(warnings: string[] | undefined) {
  return (warnings ?? []).filter((warning) => warning !== MANUAL_NO_MATCH_WARNING)
}

export async function createMatch(): Promise<Map<string, BangumiAnime[]>> {
  const files = (await fileAPI.getAll()).filter((file) => file.scan_state !== 'missing')

  // 去重：同一目录只搜一次。文件名解析只产出草稿，最终以审核页为准。
  const pendingKeywords = new Map<
    string,
    {
      folderKey: string
      rootId: string
      parentPath: string
      folderName: string
      title: string
      season: number
      draft_mappings: Record<number, string[]>
      unmapped_file_ids: string[]
      warnings: string[]
    }
  >()

  for (const file of files) {
    const parsed = parseVideoFileName(file.name)
    const rootId = file.root_id ?? 'main'
    const parentPath = file.parent_path ?? ''
    const folderName = parentPath.split('/').filter(Boolean).at(-1) ?? parsed.title
    const title = parsed.title || folderName
    const folderKey = `${rootId}:${parentPath || '/'}`

    if (!title) continue

    const entry =
      pendingKeywords.get(folderKey) ??
      pendingKeywords
        .set(folderKey, {
          folderKey,
          rootId,
          parentPath,
          folderName,
          title,
          season: parsed.season,
          draft_mappings: {},
          unmapped_file_ids: [],
          warnings: [],
        })
        .get(folderKey)!

    if (parsed.episode) {
      ;(entry.draft_mappings[parsed.episode] ??= []).push(file.id)
    } else {
      entry.unmapped_file_ids.push(file.id)
      entry.warnings.push(`无法解析集数: ${file.name}`)
    }
  }

  // 并行搜索
  const matchCandidate = new Map<string, BangumiAnime[]>()

  await Promise.all(
    Array.from(pendingKeywords.entries()).map(async ([folderKey, info]) => {
      const existing = await matchAPI.getByFolderKey(folderKey)

      // 已完成或处理中，跳过
      if (existing) {
        if (existing.status !== 'idle') return
        await matchAPI.update(folderKey, {
          search_keyword: `${info.title}${info.season === 1 ? '' : `第${info.season}季`}`,
          draft_mappings: info.draft_mappings,
          unmapped_file_ids: info.unmapped_file_ids,
          warnings: info.warnings,
        })
      } else {
        await matchAPI.add({
          folder_key: folderKey,
          root_id: info.rootId,
          parent_path: info.parentPath,
          folder_name: info.folderName,
          keyword: `${info.title}${info.season === 1 ? '' : `第${info.season}季`}`,
          search_keyword: `${info.title}${info.season === 1 ? '' : `第${info.season}季`}`,
          name: info.title,
          season: info.season,
          draft_mappings: info.draft_mappings,
          unmapped_file_ids: info.unmapped_file_ids,
          warnings: info.warnings,
        })
      }

      try {
        const keyword = `${info.title}${info.season === 1 ? '' : `第${info.season}季`}`
        const results = await getSearchResults(keyword)
        if (results.length === 0) {
          await matchAPI.update(folderKey, {
            candidate_bangumi_ids: [],
            selected_anime_id: 0,
          })
          console.warn(`无搜索结果: ${keyword}`)
          return
        }

        const topResults = results.slice(0, 4)
        await matchAPI.update(folderKey, {
          candidate_bangumi_ids: topResults.map((item) => item.id),
        })
        matchCandidate.set(folderKey, topResults)
      } catch (error) {
        console.error(`搜索失败: ${info.title}`, error)
      }
    }),
  )

  return matchCandidate
}

export async function manualSearchMatch(matchKey: string, keyword: string): Promise<BangumiAnime[]> {
  const searchKeyword = keyword.trim()
  if (!searchKeyword) throw new Error('请输入动画名称')

  const existing = await matchAPI.getByFolderKey(matchKey)
  if (!existing) throw new Error('匹配记录不存在')
  if (existing.status === 'mapping' || existing.status === 'completed') {
    throw new Error('当前条目正在关联或已完成，无法重新匹配')
  }

  const cleanWarnings = withoutManualNoMatchWarning(existing.warnings)
  const topResults = (await getSearchResults(searchKeyword)).slice(0, 4)

  await matchAPI.update(matchKey, {
    status: 'idle',
    search_keyword: searchKeyword,
    selected_anime_id: 0,
    candidate_bangumi_ids: topResults.map((item) => item.id),
    warnings: topResults.length > 0 ? cleanWarnings : [...cleanWarnings, MANUAL_NO_MATCH_WARNING],
  })

  return topResults
}

export async function selectMatch(matchKey: string, bangumi_id: number) {
  const existing = await matchAPI.getByFolderKey(matchKey)
  if (!existing || existing?.status !== 'idle') return
  await matchAPI.update(matchKey, {
    status: 'selected',
    selected_anime_id: bangumi_id,
  })
}

export async function claimMatchForImport(matchKey: string, bangumi_id: number) {
  return matchAPI.claimForImport(matchKey, bangumi_id)
}

export async function mappingMatch(matchKey: string, draft_mappings: Record<number, string[]>) {
  const existing = await matchAPI.getByFolderKey(matchKey)
  if (!existing || !existing.selected_anime_id) return
  await matchAPI.update(matchKey, {
    status: 'mapping',
    draft_mappings: draft_mappings,
  })
}

export async function completeMatch(matchKey: string) {
  const existing = await matchAPI.getByFolderKey(matchKey)
  if (!existing) return
  await matchAPI.update(matchKey, {
    status: 'completed',
  })
}
