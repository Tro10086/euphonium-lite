import { db } from '@/db/db';
import type { Anime, Episode, MatchCandidate } from '@/db/models';
import type { MatchCandidate } from './fileMatching';
import { fetchAnimeDetail } from './bangumi';

const generateId = (): string => crypto.randomUUID()

/**
 * 保存匹配结果
 * @param candidates 用户确认后的匹配项列表
 */
export async function saveMatchedVideos(candidates: MatchCandidate[]) {



  // 1. 按番剧分组（根据 selectedSuggestionId）
  const groups = new Map<number, MatchCandidate[]>();
  for (const cand of candidates) {
    if (cand.selectedSuggestionId) {
      const id = cand.selectedSuggestionId;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id)!.push(cand);
    }
  }

  // 2. 对每个番剧，先获取/创建 anime 记录，再批量创建 episodes
  for (const [bangumiId, fileList] of groups.entries()) {
    // 检查是否已存在相同 bangumi_id 的番剧
    let anime = await db.anime.where('bangumi_id').equals(bangumiId).first();
    if (!anime) {
      // 从 Bangumi 获取详情
      const detail = await fetchAnimeDetail(bangumiId);
      // 映射到 Anime 类型
      anime = {
        id: generateId(),
        title: detail.name_cn || detail.name,
        title_original: detail.name,
        bangumi_id: detail.id,
        cover: detail.images?.large,
        summary: detail.summary,
        rating: 0,
        status: 'watching',
        type: mapBangumiType(detail.type),
        tags: [],
        total_episodes: detail.eps,
        aired_season: detail.date?.slice(0,7),
        created_at: new Date(),
        updated_at: new Date(),
        overall_notes: '',
        isFromScan: true,
      };
      await db.anime.add(anime);
    }

    // 对该番剧下的每个文件，创建或更新 episode 记录
    for (const cand of fileList) {
      const episodeNumber = cand.parsed?.episode;
      if (!episodeNumber) continue; // 无集数则跳过
      // 查找是否已存在该番剧相同集数的剧集
      let episode = await db.episodes.where({ anime_id: anime.id, episode_number: episodeNumber }).first();
      if (!episode) {
        episode = {
          id: generateId(),
          anime_id: anime.id,
          episode_number: episodeNumber,
          title: `第 ${episodeNumber} 话`,
          watched: false,
          rating: 0,
          notes: '',
          filePath: cand.filePath, // 存储相对路径
        };
        await db.episodes.add(episode);
      } else {
        // 如果已有记录但未关联文件，可更新文件路径（假设一个剧集只有一个文件）
        if (!episode.filePath) {
          await db.episodes.update(episode.id, { filePath: cand.filePath });
        }
      }
    }
  }
}

function mapBangumiType(type: number): Anime['type'] {
  switch (type) {
    case 2: return 'TV';
    case 3: return 'Movie';
    default: return 'Other';
  }
}