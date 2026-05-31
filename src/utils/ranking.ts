import type { LeaderboardEntry, Movement, Person } from "@/types/models";

export interface RankingDraftItem {
  person: Person;
  score: number;
  previousEntry?: LeaderboardEntry;
  appearedBefore: boolean;
}

export interface RankedDraftItem {
  person: Person;
  score: number;
  rank: number;
  previousRank: number | null;
  rankDelta: number | null;
  movement: Movement;
}

export function rankDraftItems(items: RankingDraftItem[]): RankedDraftItem[] {
  const sorted = [...items].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const leftPreviousRank = left.previousEntry?.rank ?? Number.POSITIVE_INFINITY;
    const rightPreviousRank = right.previousEntry?.rank ?? Number.POSITIVE_INFINITY;
    if (leftPreviousRank !== rightPreviousRank) {
      return leftPreviousRank - rightPreviousRank;
    }

    return left.person.name.localeCompare(right.person.name, "zh-CN");
  });

  return sorted.map((item, index) => {
    const rank = index + 1;
    const previousRank = item.previousEntry?.rank ?? null;
    const rankDelta = previousRank === null ? null : previousRank - rank;

    return {
      person: item.person,
      score: item.score,
      rank,
      previousRank,
      rankDelta,
      movement: resolveMovement(previousRank, rankDelta, item.appearedBefore)
    };
  });
}

function resolveMovement(
  previousRank: number | null,
  rankDelta: number | null,
  appearedBefore: boolean
): Movement {
  if (previousRank === null) {
    return appearedBefore ? "returning" : "new";
  }

  if (rankDelta === null || rankDelta === 0) {
    return "same";
  }

  return rankDelta > 0 ? "up" : "down";
}
