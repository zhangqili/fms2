import { db } from "@/db";
import type { Leaderboard, LeaderboardEntry } from "@/types/models";

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
