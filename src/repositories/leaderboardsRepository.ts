import { db } from "@/db";
import type { Leaderboard, LeaderboardEntry, Person } from "@/types/models";
import { displayDate, nowIso } from "@/utils/dates";
import { makeId } from "@/utils/ids";
import { rankDraftItems } from "@/utils/ranking";

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

export interface CreateLeaderboardScoreInput {
  personId: string;
  score: number;
}

export interface CreateLeaderboardInput {
  title: string;
  note?: string;
  boardDate?: string | null;
  filterTagIds?: string[];
  maxEntries?: number | null;
  templateLeaderboardId?: string | null;
  previousLeaderboardId?: string | null;
  scores: CreateLeaderboardScoreInput[];
}

export interface LeaderboardCreationContext {
  previousLeaderboard: Leaderboard | null;
  previousEntries: LeaderboardEntry[];
  appearedPersonIds: string[];
}

export async function listLeaderboards(): Promise<Leaderboard[]> {
  const leaderboards = await db.leaderboards.orderBy("createdAt").reverse().toArray();
  return leaderboards;
}

export async function listLeaderboardsByDateAsc(): Promise<Leaderboard[]> {
  const leaderboards = await db.leaderboards.toArray();
  return sortLeaderboardsByDateAsc(leaderboards);
}

export async function getLeaderboard(id: string): Promise<Leaderboard | undefined> {
  return db.leaderboards.get(id);
}

export async function getLatestLeaderboard(): Promise<Leaderboard | undefined> {
  return db.leaderboards.orderBy("createdAt").last();
}

export async function getLeaderboardCreationContext(
  boardDate: string | null = null
): Promise<LeaderboardCreationContext> {
  const [leaderboards, allEntries] = await Promise.all([
    db.leaderboards.toArray(),
    db.leaderboard_entries.toArray()
  ]);
  const previousLeaderboard = findPreviousLeaderboardForDate(leaderboards, boardDate);
  const historicalLeaderboardIds = new Set(
    leaderboards
      .filter((leaderboard) => isLeaderboardBeforeDate(leaderboard, boardDate))
      .map((leaderboard) => leaderboard.id)
  );
  const previousEntries = previousLeaderboard
    ? sortLeaderboardEntries(
      allEntries.filter(
        (entry) => entry.leaderboardId === previousLeaderboard.id && entry.includedInRanking
      )
    )
    : [];
  const appearedPersonIds = [
    ...new Set(
      allEntries
        .filter((entry) => entry.includedInRanking && historicalLeaderboardIds.has(entry.leaderboardId))
        .map((entry) => entry.personId)
    )
  ];

  return {
    previousLeaderboard: previousLeaderboard ?? null,
    previousEntries,
    appearedPersonIds
  };
}

export async function createLeaderboard(input: CreateLeaderboardInput): Promise<Leaderboard> {
  const timestamp = nowIso();
  const boardDate = normalizedBoardDate(input.boardDate ?? null);
  const previousLeaderboardId = input.previousLeaderboardId ?? null;
  const [
    people,
    tags,
    personTags,
    leaderboards,
    previousEntries,
    historicalEntries
  ] = await Promise.all([
    db.people.toArray(),
    db.tags.toArray(),
    db.person_tags.toArray(),
    db.leaderboards.toArray(),
    previousLeaderboardId
      ? db.leaderboard_entries.where("leaderboardId").equals(previousLeaderboardId).toArray()
      : Promise.resolve([]),
    db.leaderboard_entries.toArray()
  ]);
  const personById = new Map(people.map((person) => [person.id, person]));
  const previousIncludedByPersonId = new Map(
    previousEntries
      .filter((entry) => entry.includedInRanking)
      .map((entry) => [entry.personId, entry])
  );
  const historicalLeaderboardIds = new Set(
    leaderboards
      .filter((leaderboard) => isLeaderboardBeforeDate(leaderboard, boardDate))
      .map((leaderboard) => leaderboard.id)
  );
  const appearedPersonIds = new Set(
    historicalEntries
      .filter((entry) => entry.includedInRanking && historicalLeaderboardIds.has(entry.leaderboardId))
      .map((entry) => entry.personId)
  );
  const tagNameById = new Map(tags.map((tag) => [tag.id, tag.name]));
  const tagNamesByPersonId = new Map<string, string[]>();

  for (const relation of personTags) {
    const tagName = tagNameById.get(relation.tagId);
    if (!tagName) {
      continue;
    }

    const tagNames = tagNamesByPersonId.get(relation.personId) ?? [];
    tagNames.push(tagName);
    tagNamesByPersonId.set(relation.personId, tagNames);
  }

  const scoreByPersonId = new Map<string, number>();
  for (const item of input.scores) {
    const score = Number(item.score);
    if (!Number.isFinite(score) || score < 0) {
      throw new Error("分数不能小于 0，也不能是空值。");
    }

    scoreByPersonId.set(item.personId, score);
  }

  const rankedItems = rankDraftItems(
    [...scoreByPersonId.entries()]
      .filter(([_personId, score]) => score > 0)
      .map(([personId, score]) => {
        const person = personById.get(personId);
        return person
          ? {
            person,
            score,
            previousEntry: previousIncludedByPersonId.get(personId),
            appearedBefore: appearedPersonIds.has(personId)
          }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  );
  const leaderboard: Leaderboard = {
    id: makeId("leaderboard"),
    title: input.title.trim(),
    note: input.note?.trim() ?? "",
    boardDate,
    legacyDigitalDate: boardDate ? isoDateToDigitalDate(boardDate) : null,
    filterTagIds: input.filterTagIds ?? [],
    maxEntries: input.maxEntries ?? null,
    templateLeaderboardId: input.templateLeaderboardId ?? previousLeaderboardId,
    previousLeaderboardId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  const entries: LeaderboardEntry[] = rankedItems.map((item) => {
    const previousEntry = previousIncludedByPersonId.get(item.person.id);
    return {
      id: makeId("leaderboard_entry"),
      leaderboardId: leaderboard.id,
      personId: item.person.id,
      personNameSnapshot: item.person.name,
      tagSnapshots: tagNamesByPersonId.get(item.person.id) ?? [],
      rank: item.rank,
      previousRank: item.previousRank,
      rankDelta: item.rankDelta,
      movement: item.movement,
      scoreSnapshot: item.score,
      previousScoreSnapshot: previousEntry?.scoreSnapshot ?? null,
      includedInRanking: true,
      noteSnapshot: item.person.note,
      createdAt: timestamp
    };
  });
  const currentPersonIds = new Set(rankedItems.map((item) => item.person.id));

  for (const previousEntry of previousIncludedByPersonId.values()) {
    if (currentPersonIds.has(previousEntry.personId)) {
      continue;
    }

    const person = personById.get(previousEntry.personId);
    entries.push({
      id: makeId("leaderboard_entry"),
      leaderboardId: leaderboard.id,
      personId: previousEntry.personId,
      personNameSnapshot: person?.name ?? previousEntry.personNameSnapshot,
      tagSnapshots: person ? tagNamesByPersonId.get(person.id) ?? [] : previousEntry.tagSnapshots,
      rank: null,
      previousRank: previousEntry.rank,
      rankDelta: null,
      movement: "out",
      scoreSnapshot: null,
      previousScoreSnapshot: previousEntry.scoreSnapshot,
      includedInRanking: false,
      noteSnapshot: person?.note ?? previousEntry.noteSnapshot,
      createdAt: timestamp
    });
  }

  await db.transaction("rw", db.leaderboards, db.leaderboard_entries, async () => {
    await db.leaderboards.add(leaderboard);
    if (entries.length > 0) {
      await db.leaderboard_entries.bulkAdd(entries);
    }
  });

  return leaderboard;
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

export function leaderboardDisplayOptionalTitle(leaderboard: Leaderboard): string {
  return leaderboard.title.trim();
}

export function leaderboardDisplayDate(leaderboard: Leaderboard): string {
  return displayDate(leaderboardDisplayDateSource(leaderboard));
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

  assignCompetitionRanks(
    sorted,
    (metric) => peakTierRankKey(metric, rankThresholds),
    (metric, rank) => {
      metric.peakTierRank = rank;
    }
  );
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

  assignCompetitionRanks(
    sorted,
    (metric) => numericRankKey(metric.weightedScore),
    (metric, rank) => {
      metric.weightedRank = rank;
    }
  );
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

  assignCompetitionRanks(
    sorted,
    (metric) => numericRankKey(metric.totalScore),
    (metric, rank) => {
      metric.scoreRank = rank;
    }
  );
}

function assignOverallRanks(metrics: PersonMetricAccumulator[]): void {
  const sorted = [...metrics].sort((left, right) => {
    const leftAverageScore = overallRankScore(left);
    const rightAverageScore = overallRankScore(right);

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

  assignCompetitionRanks(
    sorted,
    overallRankScore,
    (metric, rank) => {
      metric.overallRank = rank;
    }
  );
}

function assignCompetitionRanks<T>(
  sortedItems: T[],
  rankKey: (item: T) => string | number,
  setRank: (item: T, rank: number) => void
): void {
  let previousKey: string | number | null = null;
  let currentRank = 0;

  sortedItems.forEach((item, index) => {
    const key = rankKey(item);

    if (previousKey === null || key !== previousKey) {
      currentRank = index + 1;
    }

    previousKey = key;
    setRank(item, currentRank);
  });
}

function peakTierRankKey(metric: PersonMetricAccumulator, rankThresholds: number[]): string {
  return rankThresholds
    .map((threshold) => countEntriesAtOrAboveRank(metric.effectiveEntries, threshold))
    .join("|");
}

function numericRankKey(value: number): string {
  return Number.isFinite(value) ? value.toFixed(10) : String(value);
}

function overallRankScore(metric: PersonMetricAccumulator): number {
  return (
    (metric.peakTierRank ?? Number.POSITIVE_INFINITY) +
    (metric.weightedRank ?? Number.POSITIVE_INFINITY)
  );
}

function countEntriesAtOrAboveRank(entries: LeaderboardEntry[], threshold: number): number {
  return entries.filter((entry) => entry.rank !== null && entry.rank > 0 && entry.rank <= threshold).length;
}

function normalizedBoardDate(value: string | null): string | null {
  const text = value?.trim();
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isoDateToDigitalDate(value: string): number | null {
  const text = value.replaceAll("-", "");
  return /^\d{8}$/.test(text) ? Number(text) : null;
}

function findPreviousLeaderboardForDate(
  leaderboards: Leaderboard[],
  boardDate: string | null
): Leaderboard | null {
  const targetKey = boardDate ? isoDateToDigitalDate(boardDate) : null;
  const candidates = targetKey === null
    ? leaderboards
    : leaderboards.filter((leaderboard) => leaderboardDateKey(leaderboard) < targetKey);

  return [...candidates].sort((left, right) => {
    const dateDelta = leaderboardDateKey(right) - leaderboardDateKey(left);
    return dateDelta !== 0 ? dateDelta : right.createdAt.localeCompare(left.createdAt);
  })[0] ?? null;
}

function isLeaderboardBeforeDate(leaderboard: Leaderboard, boardDate: string | null): boolean {
  const targetKey = boardDate ? isoDateToDigitalDate(boardDate) : null;
  return targetKey === null ? true : leaderboardDateKey(leaderboard) < targetKey;
}

function leaderboardDateKey(leaderboard: Leaderboard): number {
  if (leaderboard.legacyDigitalDate !== null) {
    return leaderboard.legacyDigitalDate;
  }

  const source = leaderboard.boardDate ?? leaderboard.createdAt.slice(0, 10);
  const text = source.slice(0, 10).replaceAll("-", "");
  return /^\d{8}$/.test(text) ? Number(text) : 0;
}

function sortLeaderboardsByDateAsc(leaderboards: Leaderboard[]): Leaderboard[] {
  return [...leaderboards].sort((left, right) => {
    const dateDelta = leaderboardDateKey(left) - leaderboardDateKey(right);
    if (dateDelta !== 0) {
      return dateDelta;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
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
