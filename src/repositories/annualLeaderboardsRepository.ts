import { db } from "@/db";
import {
  calculatePersonOverallMetrics,
  leaderboardDisplayDateSource
} from "@/repositories/leaderboardsRepository";
import type {
  AnnualLeaderboardSettings,
  Leaderboard,
  LeaderboardEntry,
  Person
} from "@/types/models";
import { nowIso } from "@/utils/dates";
import {
  normalizeAnnualRepresentativeIds,
  validateAnnualRepresentativeIds
} from "@/utils/annualLeaderboards";

export interface AnnualLeaderboardRow {
  personId: string;
  personName: string;
  annualRank: number;
  weeklyAverageScore: number;
  annualPeakScore: number;
  weeklyPeakRank: number;
}

export interface AnnualLeaderboardData {
  year: number;
  rows: AnnualLeaderboardRow[];
  representativePersonIds: string[];
}

export async function listAnnualYears(): Promise<number[]> {
  const leaderboards = await db.leaderboards.toArray();
  const years = leaderboards
    .map(leaderboardYear)
    .filter((year): year is number => year !== null);
  return [...new Set(years)].sort((left, right) => right - left);
}

export async function getAnnualLeaderboard(year: number): Promise<AnnualLeaderboardData> {
  assertValidYear(year);
  return db.transaction(
    "r",
    [db.people, db.leaderboards, db.leaderboard_entries, db.annual_leaderboard_settings],
    async () => {
      const [people, leaderboards, entries, settings] = await Promise.all([
        db.people.toArray(),
        db.leaderboards.toArray(),
        db.leaderboard_entries.toArray(),
        db.annual_leaderboard_settings.get(year)
      ]);
      const rows = calculateAnnualLeaderboard(year, people, leaderboards, entries);
      const eligiblePersonIds = new Set(rows.map((row) => row.personId));

      return {
        year,
        rows,
        representativePersonIds: normalizeAnnualRepresentativeIds(
          settings?.representativePersonIds ?? [], eligiblePersonIds
        )
      };
    }
  );
}

export async function saveAnnualRepresentatives(
  year: number,
  personIds: string[]
): Promise<AnnualLeaderboardSettings> {
  assertValidYear(year);
  const representativePersonIds = validateAnnualRepresentativeIds(personIds);
  return db.transaction(
    "rw",
    [db.people, db.leaderboards, db.leaderboard_entries, db.annual_leaderboard_settings],
    async () => {
      const [people, leaderboards, entries] = await Promise.all([
        db.people.toArray(),
        db.leaderboards.toArray(),
        db.leaderboard_entries.toArray()
      ]);
      const rows = calculateAnnualLeaderboard(year, people, leaderboards, entries);
      const eligiblePersonIds = new Set(rows.map((row) => row.personId));
      if (representativePersonIds.some((personId) => !eligiblePersonIds.has(personId))) {
        throw new Error("代表人物只能选择该年榜中的人员，请重新加载年榜后再设置。");
      }

      const settings: AnnualLeaderboardSettings = {
        year,
        representativePersonIds,
        updatedAt: nowIso()
      };
      await db.annual_leaderboard_settings.put(settings);
      return settings;
    }
  );
}

export function calculateAnnualLeaderboard(
  year: number,
  people: Person[],
  leaderboards: Leaderboard[],
  entries: LeaderboardEntry[]
): AnnualLeaderboardRow[] {
  assertValidYear(year);
  const leaderboardIds = new Set(
    leaderboards.filter((leaderboard) => leaderboardYear(leaderboard) === year)
      .map((leaderboard) => leaderboard.id)
  );
  const annualEntries = entries.filter((entry) => leaderboardIds.has(entry.leaderboardId));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return calculatePersonOverallMetrics(people, annualEntries)
    .flatMap((metric) => {
      const person = peopleById.get(metric.personId);
      if (!person || metric.effectiveEntryCount === 0 || metric.overallRank === null || metric.peakRank === null) {
        return [];
      }
      return [{
        personId: person.id,
        personName: person.name,
        annualRank: metric.overallRank,
        weeklyAverageScore: metric.totalScore / metric.effectiveEntryCount,
        annualPeakScore: metric.highestScore,
        weeklyPeakRank: metric.peakRank
      }];
    })
    .sort((left, right) => left.annualRank - right.annualRank);
}

function leaderboardYear(leaderboard: Leaderboard): number | null {
  const source = leaderboardDisplayDateSource(leaderboard);
  if (!source) {
    return null;
  }
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  // Date-only board dates belong to their written year; timestamps follow the display timezone.
  const year = /^\d{4}-\d{2}-\d{2}$/.test(source) ? Number(source.slice(0, 4)) : date.getFullYear();
  return year >= 1 && year <= 9999 ? year : null;
}

function assertValidYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("请选择有效年份。");
  }
}
