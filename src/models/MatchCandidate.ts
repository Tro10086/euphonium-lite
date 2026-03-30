import type { Anime } from "@/db/models";
import type { Episode } from "./Episode";

export interface MatchCandidate {
    anime: Anime;
    episodes: Episode[];
}