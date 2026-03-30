export interface BangumiAnime {
  id: number;
  date: string;
  platform: string;
  image: string;
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