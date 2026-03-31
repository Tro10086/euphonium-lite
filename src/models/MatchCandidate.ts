import type { VideoFile } from "@/db/models";
import type { BAnime } from "./Bangumi";

export interface MatchCandidate {
    animes: BAnime[];
    videoFiles: Record<number, VideoFile[]>;
}