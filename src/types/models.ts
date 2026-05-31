export type Movement = "up" | "down" | "same" | "new" | "returning" | "out";

export interface Person {
  id: string;
  name: string;
  note: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonTag {
  id: string;
  personId: string;
  tagId: string;
  createdAt: string;
}

export interface Leaderboard {
  id: string;
  title: string;
  note: string;
  boardDate: string | null;
  legacyDigitalDate: number | null;
  filterTagIds: string[];
  maxEntries: number | null;
  templateLeaderboardId: string | null;
  previousLeaderboardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  id: string;
  leaderboardId: string;
  personId: string;
  personNameSnapshot: string;
  tagSnapshots: string[];
  rank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
  movement: Movement;
  scoreSnapshot: number | null;
  previousScoreSnapshot: number | null;
  includedInRanking: boolean;
  noteSnapshot: string;
  createdAt: string;
}

export interface AppSettings {
  id: "app";
  scoreMin: number;
  defaultSort: "name" | "createdAt" | "updatedAt";
  schemaVersion: number;
  updatedAt: string;
}
