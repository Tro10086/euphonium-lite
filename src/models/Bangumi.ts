export interface BAnime {
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

export interface BEpisode {
  id: number;
  subjectId: number;
  ep: number;
  name: string;
  nameCn: string;
  airdate: string;
  duration_seconds: string;
  desc: string;
}