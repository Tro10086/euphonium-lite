export interface BangumiAnime {
  id: number;
  date: string;
  platform: string;
  images: Record<'small' | 'grid' | 'large' | 'medium' | 'common', string>;
  summary: string;
  name: string;
  name_cn: string;
  eps: number;
  meta_tags: string[];
  rating: {
    score: number;
  };
  infobox: {
    key: string;
    value: string;
  };
}

export interface BangumiEpisode {
  id: number;
  subjectId: number;
  ep: number;
  name: string;
  name_cn: string;
  airdate: string;
  duration_seconds: number;
  desc: string;
}