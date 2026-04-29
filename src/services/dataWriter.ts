import { db } from '@/db/db'
import { getAnime, getEpisodes } from './bangumi'
import { animeAPI, episodeAPI, fileAPI, matchAPI } from './storage'
import type { Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'

function uniqueTags(tags: string[] | undefined): string[] {
  return Array.from(
    new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
  )
}

export async function saveMatchResult(keyword: string) {
  // Phase 1: 准备阶段（事务外）
  const match = await matchAPI.getByFolderKey(keyword)
  if (!match || match.status !== 'mapping') return

  const bangumi_id = match.selected_anime_id
  const [localAnime, bangumiAnime, bangumiEps] = await Promise.all([
    animeAPI.getByBangumiId(bangumi_id),
    getAnime(bangumi_id),
    getEpisodes(bangumi_id),
  ])

  // Phase 2: 计算变更（事务外）
  let animeId = localAnime?.id
  const animeToCreate = !animeId
    ? {
        name_cn: bangumiAnime.name_cn,
        name: bangumiAnime.name,
        bangumi_id: bangumiAnime.id,
        cover: bangumiAnime.images?.large ?? bangumiAnime.images?.common ?? '',
        summary: bangumiAnime.summary,
        bangumi_score: bangumiAnime.rating?.score ?? 0,
        tags: uniqueTags(bangumiAnime.meta_tags),
        total_episodes: bangumiAnime.eps,
        date: bangumiAnime.date,
        air_year: Number.parseInt((bangumiAnime.date ?? '').slice(0, 4), 10) || undefined,
        aliases: [bangumiAnime.name, bangumiAnime.name_cn].filter(Boolean),
        source: 'bangumi' as const,
      }
    : null

  // 预加载所有相关数据
  const existingEps = animeId ? await episodeAPI.getByAnimeId(animeId) : []
  const epMapExistingByBangumi = new Map(
    existingEps
      .filter((ep) => ep.bangumi_episode_id)
      .map((ep) => [ep.bangumi_episode_id!, ep]),
  )
  const epMapExistingByNumber = new Map(existingEps.map((ep) => [ep.sort ?? ep.ep, ep]))
  const bangumiMainEps = bangumiEps.filter((ep) => ep.type === 0)
  const epMapBangumiBySort = new Map(bangumiMainEps.map((ep) => [Number(ep.sort), ep]))
  const epMapBangumiByEp = new Map(bangumiMainEps.map((ep) => [Number(ep.ep), ep]))

  // 收集所有 fileIds 批量查询
  const allFileIds = Object.values(match.draft_mappings).flat()
  const existingFiles = await fileAPI.getByIds(allFileIds)
  const fileMap = new Map(existingFiles.map((f) => [f.id, f]))

  // 计算需要的数据变更
  const epsToCreate: Omit<Episode, 'id' | 'rating' | 'watched' | 'created_at' | 'updated_at'>[] = []
  const epsToUpdate: { id: string; file_ids: string[] }[] = []
  const filesToUpdate: VideoFile[] = []
  const epIdMapping = new Map<number, string>()

  const mappings = match.draft_mappings ?? {}
  const fileIdsByBangumiEpisodeId = new Map<number, string[]>()
  const fallbackMappings = new Map<number, string[]>()

  for (const [epNumStr, fileIds] of Object.entries(mappings)) {
    const epNum = Number(epNumStr)
    const bangumiEp = epMapBangumiBySort.get(epNum) ?? epMapBangumiByEp.get(epNum)

    if (bangumiEp) {
      fileIdsByBangumiEpisodeId.set(bangumiEp.id, fileIds)
    } else {
      fallbackMappings.set(epNum, fileIds)
    }
  }

  for (const bangumiEp of bangumiMainEps) {
    const fileIds = fileIdsByBangumiEpisodeId.get(bangumiEp.id) ?? []
    const existingEp = bangumiEp?.id
      ? epMapExistingByBangumi.get(bangumiEp.id)
      : epMapExistingByNumber.get(Number(bangumiEp.sort ?? bangumiEp.ep))

    if (existingEp) {
      if (fileIds.length > 0) {
        epsToUpdate.push({ id: existingEp.id, file_ids: fileIds })
      }
      epIdMapping.set(Number(bangumiEp.sort ?? bangumiEp.ep), existingEp.id)
      epIdMapping.set(Number(bangumiEp.ep ?? bangumiEp.sort), existingEp.id)
    } else {
      // 标记需要创建，但 id 需要等数据库生成
      epsToCreate.push({
        anime_id: animeId!, // 下面会先创建 anime
        file_ids: fileIds,
        bangumi_episode_id: bangumiEp.id,
        ep: Number(bangumiEp.ep ?? bangumiEp.sort ?? 0),
        sort: Number(bangumiEp.sort ?? bangumiEp.ep ?? 0),
        type: bangumiEp.type,
        name: bangumiEp.name,
        name_cn: bangumiEp.name_cn,
        airdate: bangumiEp.airdate,
        duration_seconds: bangumiEp.duration_seconds,
        desc: bangumiEp.desc,
      })
    }
  }

  for (const [epNum, fileIds] of fallbackMappings) {
    const existingEp = epMapExistingByNumber.get(epNum)

    if (existingEp) {
      epsToUpdate.push({ id: existingEp.id, file_ids: fileIds })
      epIdMapping.set(epNum, existingEp.id)
      continue
    }

    epsToCreate.push({
      anime_id: animeId!,
      file_ids: fileIds,
      ep: epNum,
      sort: epNum,
      type: 0,
      name: `Episode ${epNum}`,
      name_cn: `第 ${epNum} 集`,
    })
  }

  // Phase 3: 提交阶段（纯事务，只包含写入）
  await db.transaction('rw', [db.anime, db.episodes, db.files], async () => {
    if (!animeId) {
      const latestLocalAnime = await db.anime.where('bangumi_id').equals(bangumi_id).first()
      if (latestLocalAnime) animeId = latestLocalAnime.id
    }

    // 1. 创建 anime（如果需要）
    if (animeToCreate && !animeId) {
      animeId = await animeAPI.add(animeToCreate)
    }

    if (!animeId) throw new Error('animeId is required')
    epsToCreate.forEach((ep) => (ep.anime_id = animeId!))

    const currentEps = await db.episodes.where('anime_id').equals(animeId).toArray()
    const currentEpByBangumi = new Map(
      currentEps
        .filter((ep) => ep.bangumi_episode_id)
        .map((ep) => [ep.bangumi_episode_id!, ep]),
    )
    const currentEpByNumber = new Map(currentEps.map((ep) => [ep.sort ?? ep.ep, ep]))
    const finalEpsToCreate = epsToCreate.filter((ep) => {
      const currentEp = ep.bangumi_episode_id
        ? currentEpByBangumi.get(ep.bangumi_episode_id)
        : currentEpByNumber.get(ep.sort ?? ep.ep)

      if (!currentEp) return true

      epIdMapping.set(ep.ep, currentEp.id)
      if (ep.sort) epIdMapping.set(ep.sort, currentEp.id)
      if (ep.file_ids?.length) epsToUpdate.push({ id: currentEp.id, file_ids: ep.file_ids })
      return false
    })

    // 2. 批量创建 episodes 并获取 ids
    if (finalEpsToCreate.length > 0) {
      const newEps = await episodeAPI.bulkAdd(finalEpsToCreate)
      newEps.forEach((ep) => {
        epIdMapping.set(ep.ep, ep.id)
        if (ep.sort) epIdMapping.set(ep.sort, ep.id)
      })
    }

    // 3. 批量更新已有 episodes
    await Promise.all(epsToUpdate.map(({ id, file_ids }) => db.episodes.update(id, { file_ids })))

    // 4. 批量更新 files（收集所有变更）
    for (const [epNumStr, fileIds] of Object.entries(match.draft_mappings)) {
      const epNum = Number(epNumStr)
      const epId = epIdMapping.get(epNum)
      if (!epId) continue

      for (const fileId of fileIds) {
        const file = fileMap.get(fileId)
        if (file && file.ep_id !== epId) {
          filesToUpdate.push({ ...file, ep_id: epId, anime_id: animeId, scan_state: 'active' })
        }
      }
    }

    await fileAPI.update(filesToUpdate)
  })

  if (animeId) {
    await matchAPI.update(keyword, {
      status: 'completed',
      selected_local_anime_id: animeId,
    })
  }
}
