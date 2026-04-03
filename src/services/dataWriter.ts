import { db } from '@/db/db';
import type { BangumiAnime, BangumiEpisode } from '@/models/Bangumi';
import type { MatchCandidate } from '@/models/Match';
import { getEpisodes } from './bangumi';

const generateId = (): string => crypto.randomUUID()

export async function saveMatchedVideos(candidates: MatchCandidate[]) {
  const animeUploaded = new Map<number, BangumiEpisode[]>();
  for (const cand of candidates) {
    if (!cand.animes[0]) throw new Error("未提供匹配的动画信息");
    const b_anime: BangumiAnime = cand.animes[0]
    let animeId = '';
    if (!animeUploaded.has(b_anime.id)) {
      let anime = await db.anime.where('bangumi_id').equals(b_anime.id).first();
      if (!anime) {
        anime = {
          id: generateId(),
          name_cn: b_anime.name_cn,
          name: b_anime.name,
          bangumi_id: b_anime.id,
          cover: b_anime.image,
          summary: b_anime.summary,
          bangumi_score: b_anime.rating.score,
          rating: 0,
          status: 'planned',
          tags: b_anime.meta_tags,
          total_episodes: b_anime.eps,
          date: b_anime.date,
          created_at: new Date(),
          updated_at: new Date(),
          overall_notes: '',
        };
        await db.anime.add(anime);
      }
      animeId = anime.id;
      animeUploaded.set(b_anime.id, await getEpisodes(b_anime.id, b_anime.eps));
    }
    const episodes_existed = await db.episodes.where('anime_id').equals(animeId).toArray();
    const epMap_existed = new Map(episodes_existed.map(ep => [ep.ep, ep]));
    const episodes_anime = animeUploaded.get(b_anime.id);
    if (!episodes_anime || episodes_anime.length === 0) throw new Error("未查询到匹配的剧集信息");
    const epMap = new Map(episodes_anime.map(ep => [ep.ep, ep]));
    for (const [epNumStr, files] of Object.entries(cand.videoFiles)) {
      const episodeNumber = parseInt(epNumStr, 10);
      const videoFile = files[0];
      if (!videoFile) throw new Error("未提供匹配的剧集文件");

      const existing = epMap_existed.get(episodeNumber);
      if (existing) {
        await db.episodes.update(existing.id, {
          file_id: videoFile.id,
          last_file_path: videoFile.path,
          last_matched_at: new Date()
        });
      } else {
        const ep = epMap.get(episodeNumber);
        if (!ep) throw new Error("未查询到匹配的剧集信息");
        await db.episodes.add({
          id: generateId(),
          anime_id: animeId,
          file_id: videoFile.id,
          ep: episodeNumber,
          name: ep.name,
          name_cn: ep.name_cn,
          airdate: ep.airdate,
          duration_seconds: ep.duration_seconds,
          desc: ep.desc,
          watched: false,
          rating: 0,
          notes: '',
        });
      }
    }
  }
}