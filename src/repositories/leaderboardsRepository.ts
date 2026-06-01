import { db } from "@/db";
import type { Leaderboard, LeaderboardEntry, Person } from "@/types/models";

export interface PersonLeaderboardHistoryItem {
  leaderboard: Leaderboard;
  entry: LeaderboardEntry;
}

export interface PersonLeaderboardStats {
  appearanceCount: number;
  totalScore: number;
  weightedScore: number;
  firstAppearanceDate: string | null;
  peakRank: number | null;
  peakRankScore: number | null;
  highestScore: number | null;
  scoreRank: number | null;
  weightedRank: number | null;
  peakTierRank: number | null;
  overallRank: number | null;
}

export interface PersonOverallMetric {
  personId: string;
  totalScore: number;
  highestScore: number;
  peakRank: number | null;
  weightedScore: number;
  scoreRank: number | null;
  weightedRank: number | null;
  peakTierRank: number | null;
  overallRank: number | null;
  effectiveEntryCount: number;
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
  const [history, overallMetrics] = await Promise.all([
    listPersonLeaderboardHistory(personId),
    listPersonOverallMetrics()
  ]);
  const effectiveHistory = history.filter((item) => isEffectiveScoredEntry(item.entry));
  const totalScore = effectiveHistory.reduce((sum, item) => sum + (item.entry.scoreSnapshot ?? 0), 0);
  const firstAppearance = [...effectiveHistory].sort((left, right) =>
    sortByLeaderboardDateAsc(left.leaderboard, right.leaderboard)
  )[0];
  const peakRankEntry = [...effectiveHistory].sort((left, right) => {
    const rankDelta = (left.entry.rank ?? 0) - (right.entry.rank ?? 0);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return (right.entry.scoreSnapshot ?? 0) - (left.entry.scoreSnapshot ?? 0);
  })[0];
  const scores = effectiveHistory
    .map((item) => item.entry.scoreSnapshot)
    .filter((score): score is number => score !== null);
  const overallMetric = overallMetrics.find((metric) => metric.personId === personId);

  return {
    appearanceCount: effectiveHistory.length,
    totalScore,
    weightedScore: overallMetric?.weightedScore ?? 0,
    firstAppearanceDate: firstAppearance
      ? leaderboardDisplayDateSource(firstAppearance.leaderboard)
      : null,
    peakRank: peakRankEntry?.entry.rank ?? null,
    peakRankScore: peakRankEntry?.entry.scoreSnapshot ?? null,
    highestScore: scores.length > 0 ? Math.max(...scores) : null,
    scoreRank: overallMetric?.scoreRank ?? null,
    weightedRank: overallMetric?.weightedRank ?? null,
    peakTierRank: overallMetric?.peakTierRank ?? null,
    overallRank: overallMetric?.overallRank ?? null
  };
}

export async function listPersonOverallMetrics(): Promise<PersonOverallMetric[]> {
  const [people, entries] = await Promise.all([
    db.people.toArray(),
    db.leaderboard_entries.toArray()
  ]);

  return calculatePersonOverallMetrics(people, entries);
}

export function calculatePersonOverallMetrics(
  people: Person[],
  entries: LeaderboardEntry[]
): PersonOverallMetric[] {
  const accumulatorByPersonId = new Map<string, PersonMetricAccumulator>();

  for (const person of people) {
    accumulatorByPersonId.set(person.id, {
      personId: person.id,
      personName: person.name,
      totalScore: 0,
      highestScore: 0,
      peakRank: null,
      weightedScore: 0,
      scoreRank: null,
      weightedRank: null,
      peakTierRank: null,
      overallRank: null,
      effectiveEntryCount: 0,
      effectiveEntries: []
    });
  }

  for (const entry of entries) {
    if (!isEffectiveScoredEntry(entry)) {
      continue;
    }

    const accumulator = accumulatorByPersonId.get(entry.personId);
    if (!accumulator) {
      continue;
    }

    const score = entry.scoreSnapshot ?? 0;
    accumulator.totalScore += score;
    accumulator.highestScore = Math.max(accumulator.highestScore, score);
    accumulator.peakRank =
      accumulator.peakRank === null ? entry.rank : Math.min(accumulator.peakRank, entry.rank ?? 0);
    accumulator.effectiveEntryCount += 1;
    accumulator.effectiveEntries.push(entry);
  }

  const metrics = [...accumulatorByPersonId.values()];
  const effectiveMetrics = metrics.filter((metric) => metric.effectiveEntryCount > 0);

  for (const metric of metrics) {
    metric.weightedScore = metric.totalScore * metric.highestScore;
  }

  assignPeakTierRanks(effectiveMetrics);
  assignWeightedRanks(effectiveMetrics);
  assignScoreRanks(effectiveMetrics);
  assignOverallRanks(effectiveMetrics);

  return metrics.map(({ effectiveEntries: _effectiveEntries, personName: _personName, ...metric }) => metric);
}

export function summarizeLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardSummary {
  return {
    includedCount: entries.filter((entry) => entry.includedInRanking).length,
    outCount: entries.filter((entry) => entry.movement === "out").length
  };
}

interface PersonMetricAccumulator extends PersonOverallMetric {
  personName: string;
  effectiveEntries: LeaderboardEntry[];
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

function assignPeakTierRanks(metrics: PersonMetricAccumulator[]): void {
  const rankThresholds = [10, 20, 30, 40, 50, 60, 70];
  const sorted = [...metrics].sort((left, right) => {
    for (const threshold of rankThresholds) {
      const leftCount = countEntriesAtOrAboveRank(left.effectiveEntries, threshold);
      const rightCount = countEntriesAtOrAboveRank(right.effectiveEntries, threshold);
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }
    }

    return sortMetricByName(left, right);
  });

  sorted.forEach((metric, index) => {
    metric.peakTierRank = index + 1;
  });
}

function assignWeightedRanks(metrics: PersonMetricAccumulator[]): void {
  const sorted = [...metrics].sort((left, right) => {
    const weightedScoreDelta = right.weightedScore - left.weightedScore;
    if (weightedScoreDelta !== 0) {
      return weightedScoreDelta;
    }

    const peakRankDelta = (left.peakTierRank ?? Number.POSITIVE_INFINITY) -
      (right.peakTierRank ?? Number.POSITIVE_INFINITY);
    if (peakRankDelta !== 0) {
      return peakRankDelta;
    }

    return sortMetricByName(left, right);
  });

  sorted.forEach((metric, index) => {
    metric.weightedRank = index + 1;
  });
}

function assignScoreRanks(metrics: PersonMetricAccumulator[]): void {
  const sorted = [...metrics].sort((left, right) => {
    const scoreDelta = right.totalScore - left.totalScore;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const weightedRankDelta = (left.weightedRank ?? Number.POSITIVE_INFINITY) -
      (right.weightedRank ?? Number.POSITIVE_INFINITY);
    if (weightedRankDelta !== 0) {
      return weightedRankDelta;
    }

    return sortMetricByName(left, right);
  });

  sorted.forEach((metric, index) => {
    metric.scoreRank = index + 1;
  });
}

function assignOverallRanks(metrics: PersonMetricAccumulator[]): void {
  const sorted = [...metrics].sort((left, right) => {
    const leftAverageScore =
      (left.peakTierRank ?? Number.POSITIVE_INFINITY) +
      (left.weightedRank ?? Number.POSITIVE_INFINITY);
    const rightAverageScore =
      (right.peakTierRank ?? Number.POSITIVE_INFINITY) +
      (right.weightedRank ?? Number.POSITIVE_INFINITY);

    if (leftAverageScore !== rightAverageScore) {
      return leftAverageScore - rightAverageScore;
    }

    const weightedRankDelta = (left.weightedRank ?? Number.POSITIVE_INFINITY) -
      (right.weightedRank ?? Number.POSITIVE_INFINITY);
    if (weightedRankDelta !== 0) {
      return weightedRankDelta;
    }

    return sortMetricByName(left, right);
  });

  sorted.forEach((metric, index) => {
    metric.overallRank = index + 1;
  });
}

function countEntriesAtOrAboveRank(entries: LeaderboardEntry[], threshold: number): number {
  return entries.filter((entry) => entry.rank !== null && entry.rank > 0 && entry.rank <= threshold).length;
}

function isEffectiveScoredEntry(entry: LeaderboardEntry): boolean {
  return entry.includedInRanking && entry.rank !== null && (entry.scoreSnapshot ?? 0) > 0;
}

function sortMetricByName(left: PersonMetricAccumulator, right: PersonMetricAccumulator): number {
  const nameComparison = left.personName.localeCompare(right.personName, "zh-CN");
  return nameComparison !== 0 ? nameComparison : left.personId.localeCompare(right.personId);
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
