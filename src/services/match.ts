import { parseVideoFileName } from '@/utils/fileNameParser'
import { getSearchResults } from './bangumi'
import { isExtraDirectoryName } from './fileSystem'
import { animeAPI, fileAPI, matchAPI } from './storage'
import type { BangumiAnime } from '@/models/Bangumi'
import type { VideoFile } from '@/models/File'
import type { MatchRecord } from '@/models/Match'

const MANUAL_NO_MATCH_WARNING = '无法匹配，无法关联'

function withoutManualNoMatchWarning(warnings: string[] | undefined) {
  return (warnings ?? []).filter((warning) => warning !== MANUAL_NO_MATCH_WARNING)
}

function pathSegments(path: string) {
  return path.split('/').filter(Boolean)
}

function parentDirectoryPath(path: string) {
  const segments = pathSegments(path)
  segments.pop()
  return segments.join('/')
}

function lastPathSegment(path: string) {
  return pathSegments(path).at(-1) ?? ''
}

function parentPathForMatch(file: VideoFile, isExtra: boolean) {
  if (!isExtra) return file.parent_path ?? ''

  const groupPath = file.extra_group_path ?? file.parent_path ?? ''
  const groupParent = parentDirectoryPath(groupPath)
  if (groupParent) return groupParent

  const groupName = lastPathSegment(groupPath)
  if (groupPath && file.parent_path === groupPath && !isExtraDirectoryName(groupName)) {
    return groupPath
  }

  return ''
}

function isHiddenAnime(
  anime:
    | {
        deleted_at?: Date | string | number | null
        purge_requested_at?: Date | string | number | null
      }
    | null
    | undefined,
) {
  return Boolean(anime?.deleted_at || anime?.purge_requested_at)
}

async function shouldReopenCompletedMatch(existing: MatchRecord) {
  if (existing.status !== 'completed') return false

  if (existing.selected_local_anime_id) {
    const anime = await animeAPI.getById(existing.selected_local_anime_id)
    return !anime || isHiddenAnime(anime)
  }

  if (existing.selected_anime_id) {
    const anime = await animeAPI.getByBangumiId(existing.selected_anime_id)
    return !anime || isHiddenAnime(anime)
  }

  return true
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
      hasEpisodeTitle: boolean
      draft_mappings: Record<number, string[]>
      unmapped_file_ids: string[]
      extra_file_ids: string[]
      warnings: string[]
    }
  >()

  for (const file of files) {
    const parsed = parseVideoFileName(file.name)
    const rootId = file.root_id ?? 'main'
    const isExtra = file.media_kind === 'extra'
    const parentPath = parentPathForMatch(file, isExtra)
    const folderName = lastPathSegment(parentPath) || parsed.title || file.extra_label || file.name
    const hasEpisodeTitle = !isExtra && Boolean(parsed.title)
    const title = hasEpisodeTitle ? parsed.title : folderName
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
          hasEpisodeTitle,
          draft_mappings: {},
          unmapped_file_ids: [],
          extra_file_ids: [],
          warnings: [],
        })
        .get(folderKey)!

    if (hasEpisodeTitle && !entry.hasEpisodeTitle) {
      entry.title = parsed.title
      entry.season = parsed.season
      entry.hasEpisodeTitle = true
    }

    if (isExtra) {
      entry.extra_file_ids.push(file.id)
      continue
    }

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
        const reopenCompletedMatch = await shouldReopenCompletedMatch(existing)
        if (existing.status !== 'idle' && !reopenCompletedMatch) return
        await matchAPI.update(folderKey, {
          status: 'idle',
          name: info.title,
          season: info.season,
          folder_name: info.folderName,
          selected_anime_id: existing.selected_anime_id,
          search_keyword: `${info.title}${info.season === 1 ? '' : `第${info.season}季`}`,
          draft_mappings: info.draft_mappings,
          unmapped_file_ids: info.unmapped_file_ids,
          extra_file_ids: info.extra_file_ids,
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
          extra_file_ids: info.extra_file_ids,
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

export async function manualSearchMatch(
  matchKey: string,
  keyword: string,
): Promise<BangumiAnime[]> {
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

export async function claimMatchForImport(matchKey: string, bangumi_id: number) {
  return matchAPI.claimForImport(matchKey, bangumi_id)
}
