import { db } from '@/db/db'
import { getAnime, getEpisodes } from './bangumi'
import { animeAPI, episodeAPI, fileAPI, matchAPI } from './storage'
import type { Episode } from '@/models/Anime'
import type { VideoFile } from '@/models/File'

export async function saveMatchResult(keyword: string) {
  // Phase 1: 准备阶段（事务外）
  const match = await matchAPI.getByKeyword(keyword)
  if (!match || match.status !== 'completed') return

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
        cover: bangumiAnime.image,
        summary: bangumiAnime.summary,
        bangumi_score: bangumiAnime.rating.score,
        tags: bangumiAnime.meta_tags,
        total_episodes: bangumiAnime.eps,
        date: bangumiAnime.date,
      }
    : null

  // 预加载所有相关数据
  const existingEps = animeId ? await episodeAPI.getByAnimeId(animeId) : []
  const epMapExisting = new Map(existingEps.map((ep) => [ep.ep, ep]))
  const epMapBangumi = new Map(bangumiEps.map((ep) => [ep.ep, ep]))

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
  for (const [epNumStr, fileIds] of Object.entries(mappings)) {
    const epNum = Number(epNumStr)
    const existingEp = epMapExisting.get(epNum)

    if (existingEp) {
      // 已存在，只更新 file_ids
      epsToUpdate.push({ id: existingEp.id, file_ids: fileIds })
      epIdMapping.set(epNum, existingEp.id)
    } else {
      const bangumiEp = epMapBangumi.get(epNum)
      if (!bangumiEp) {
        console.warn(`EP ${epNum} not found in bangumi`)
        continue
      }
      // 标记需要创建，但 id 需要等数据库生成
      epsToCreate.push({
        anime_id: animeId!, // 下面会先创建 anime
        file_ids: fileIds,
        ep: epNum,
        name: bangumiEp.name,
        name_cn: bangumiEp.name_cn,
        airdate: bangumiEp.airdate,
        duration_seconds: bangumiEp.duration_seconds,
        desc: bangumiEp.desc,
      })
    }
  }

  // Phase 3: 提交阶段（纯事务，只包含写入）
  await db.transaction('rw', [db.anime, db.episodes, db.files], async () => {
    // 1. 创建 anime（如果需要）
    if (animeToCreate && !animeId) {
      animeId = await animeAPI.add(animeToCreate)
      // 回填 anime_id 到待创建的 episodes
      epsToCreate.forEach((ep) => (ep.anime_id = animeId!))
    }

    if (!animeId) throw new Error('animeId is required')

    // 2. 批量创建 episodes 并获取 ids
    if (epsToCreate.length > 0) {
      const newEps = await episodeAPI.bulkAdd(epsToCreate)
      newEps.forEach((ep) => epIdMapping.set(ep.ep, ep.id))
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
          filesToUpdate.push({ ...file, ep_id: epId })
        }
      }
    }

    await fileAPI.update(filesToUpdate)
  })
}
