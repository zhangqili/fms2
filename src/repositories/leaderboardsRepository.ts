import { db } from "@/db";
import type { Leaderboard, LeaderboardEntry } from "@/types/models";

export interface PersonLeaderboardHistoryItem {
  leaderboard: Leaderboard;
  entry: LeaderboardEntry;
}

export interface PersonLeaderboardStats {
  appearanceCount: number;
  totalScore: number;
  firstAppearanceDate: string | null;
  peakRank: number | null;
  peakRankScore: number | null;
  highestScore: number | null;
}

export interface LeaderboardSummary {
  includedCount: number;
  outCount: number;
}

export async function listLeaderboards(): Promise<Leaderboard[]> {
  const leaderboards = await db.leaderboards.orderBy("createdAt").reverse().toArray();
  return leaderboards;
}

export async function getLeaderboard(id: string): Promise<Leaderboard | undefined> {
  return db.leaderboards.get(id);
}

export async function getLatestLeaderboard(): Promise<Leaderboard | undefined> {
  return db.leaderboards.orderBy("createdAt").last();
}

export async function listLeaderboardEntries(leaderboardId: string): Promise<LeaderboardEntry[]> {
  const entries = await db.leaderboard_entries.where("leaderboardId").equals(leaderboardId).toArray();
  return sortLeaderboardEntries(entries);
}

export async function listPersonLeaderboardHistory(
  personId: string
): Promise<PersonLeaderboardHistoryItem[]> {
  const entries = await db.leaderboard_entries.where("personId").equals(personId).toArray();
  const leaderboards = await db.leaderboards.bulkGet(entries.map((entry) => entry.leaderboardId));
  const leaderboardById = new Map(
    leaderboards
      .filter((leaderboard): leaderboard is Leaderboard => Boolean(leaderboard))
      .map((leaderboard) => [leaderboard.id, leaderboard])
  );

  return entries
    .map((entry) => {
      const leaderboard = leaderboardById.get(entry.leaderboardId);
      return leaderboard ? { entry, leaderboard } : null;
    })
    .filter((item): item is PersonLeaderboardHistoryItem => item !== null)
    .sort((left, right) => sortByLeaderboardDateDesc(left.leaderboard, right.leaderboard));
}

export async function getPersonLeaderboardStats(personId: string): Promise<PersonLeaderboardStats> {
  const history = await listPersonLeaderboardHistory(personId);
  const includedHistory = history.filter((item) => item.entry.includedInRanking);
  const totalScore = includedHistory.reduce((sum, item) => sum + (item.entry.scoreSnapshot ?? 0), 0);
  const firstAppearance = [...includedHistory].sort((left, right) =>
    sortByLeaderboardDateAsc(left.leaderboard, right.leaderboard)
  )[0];
  const rankedEntries = includedHistory.filter((item) => item.entry.rank !== null);
  const peakRankEntry = [...rankedEntries].sort((left, right) => {
    const rankDelta = (left.entry.rank ?? 0) - (right.entry.rank ?? 0);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return (right.entry.scoreSnapshot ?? 0) - (left.entry.scoreSnapshot ?? 0);
  })[0];
  const scores = includedHistory
    .map((item) => item.entry.scoreSnapshot)
    .filter((score): score is number => score !== null);

  return {
    appearanceCount: includedHistory.length,
    totalScore,
    firstAppearanceDate: firstAppearance
      ? leaderboardDisplayDateSource(firstAppearance.leaderboard)
      : null,
    peakRank: peakRankEntry?.entry.rank ?? null,
    peakRankScore: peakRankEntry?.entry.scoreSnapshot ?? null,
    highestScore: scores.length > 0 ? Math.max(...scores) : null
  };
}

export function summarizeLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardSummary {
  return {
    includedCount: entries.filter((entry) => entry.includedInRanking).length,
    outCount: entries.filter((entry) => entry.movement === "out").length
  };
}

export function leaderboardDisplayTitle(leaderboard: Leaderboard): string {
  return leaderboard.title || "未命名榜单";
}

export function leaderboardDisplayDateSource(leaderboard: Leaderboard): string | null {
  return leaderboard.boardDate ?? leaderboard.createdAt ?? null;
}

function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return entries.sort((left, right) => {
    if (left.includedInRanking !== right.includedInRanking) {
      return left.includedInRanking ? -1 : 1;
    }

    const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftPreviousRank = left.previousRank ?? Number.POSITIVE_INFINITY;
    const rightPreviousRank = right.previousRank ?? Number.POSITIVE_INFINITY;
    if (leftPreviousRank !== rightPreviousRank) {
      return leftPreviousRank - rightPreviousRank;
    }

    return left.personNameSnapshot.localeCompare(right.personNameSnapshot, "zh-CN");
  });
}

function sortByLeaderboardDateDesc(left: Leaderboard, right: Leaderboard): number {
  return leaderboardTime(right) - leaderboardTime(left);
}

function sortByLeaderboardDateAsc(left: Leaderboard, right: Leaderboard): number {
  return leaderboardTime(left) - leaderboardTime(right);
}

function leaderboardTime(leaderboard: Leaderboard): number {
  const source = leaderboardDisplayDateSource(leaderboard);
  const time = source ? Date.parse(source) : 0;
  return Number.isFinite(time) ? time : 0;
}
