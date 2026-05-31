import { db } from "@/db";
import type { Leaderboard, LeaderboardEntry, Movement, Person } from "@/types/models";
import { digitalDateToIsoDate, nowIso } from "@/utils/dates";
import { makeId } from "@/utils/ids";

interface ParsedLegacyEntry {
  name: string;
  score: number;
  sourceRank: number;
}

interface ParsedLegacyLeaderboard {
  digitalDate: number;
  boardDate: string | null;
  title: string;
  entries: ParsedLegacyEntry[];
  zeroScoreEntries: ParsedLegacyEntry[];
}

interface ParsedLegacyWorkbook {
  people: string[];
  leaderboards: ParsedLegacyLeaderboard[];
  errors: string[];
}

export interface LegacyFmsPreview {
  peopleCount: number;
  leaderboardCount: number;
  entryCount: number;
  zeroScoreEntryCount: number;
  errors: string[];
  dates: Array<{
    digitalDate: number;
    boardDate: string | null;
    title: string;
    entryCount: number;
    zeroScoreEntryCount: number;
  }>;
}

export interface LegacyFmsImportResult {
  peopleCount: number;
  leaderboardCount: number;
  entryCount: number;
  outEntryCount: number;
}

export async function previewLegacyFmsWorkbook(file: File): Promise<LegacyFmsPreview> {
  const parsed = await parseLegacyFmsWorkbook(file);

  return {
    peopleCount: parsed.people.length,
    leaderboardCount: parsed.leaderboards.length,
    entryCount: parsed.leaderboards.reduce((sum, item) => sum + item.entries.length, 0),
    zeroScoreEntryCount: parsed.leaderboards.reduce(
      (sum, item) => sum + item.zeroScoreEntries.length,
      0
    ),
    errors: parsed.errors,
    dates: parsed.leaderboards.map((item) => ({
      digitalDate: item.digitalDate,
      boardDate: item.boardDate,
      title: item.title,
      entryCount: item.entries.length,
      zeroScoreEntryCount: item.zeroScoreEntries.length
    }))
  };
}

export async function importLegacyFmsWorkbook(file: File): Promise<LegacyFmsImportResult> {
  const parsed = await parseLegacyFmsWorkbook(file);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.join("\n"));
  }

  const timestamp = nowIso();
  const people = parsed.people.map<Person>((name) => ({
    id: makeId("person"),
    name,
    note: "",
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  const personByName = new Map(people.map((person) => [person.name, person]));
  const leaderboards: Leaderboard[] = [];
  const entries: LeaderboardEntry[] = [];

  let previousLeaderboard: Leaderboard | null = null;
  let previousIncludedEntries = new Map<string, LeaderboardEntry>();
  const appearedBefore = new Set<string>();

  for (const [index, parsedLeaderboard] of parsed.leaderboards.entries()) {
    const leaderboardCreatedAt = importedLeaderboardCreatedAt(parsedLeaderboard.boardDate, index);
    const leaderboard: Leaderboard = {
      id: makeId("leaderboard"),
      title: parsedLeaderboard.title,
      note: "",
      boardDate: parsedLeaderboard.boardDate,
      legacyDigitalDate: parsedLeaderboard.digitalDate,
      filterTagIds: [],
      maxEntries: null,
      templateLeaderboardId: previousLeaderboard?.id ?? null,
      previousLeaderboardId: previousLeaderboard?.id ?? null,
      createdAt: leaderboardCreatedAt,
      updatedAt: timestamp
    };

    const currentIncludedEntries = new Map<string, LeaderboardEntry>();
    const currentIncludedPersonIds = new Set<string>();
    const zeroScoreByPersonId = new Map<string, number>();

    for (const zeroEntry of parsedLeaderboard.zeroScoreEntries) {
      const person = personByName.get(zeroEntry.name);
      if (person) {
        zeroScoreByPersonId.set(person.id, zeroEntry.score);
      }
    }

    for (const legacyEntry of parsedLeaderboard.entries) {
      const person = personByName.get(legacyEntry.name);
      if (!person) {
        continue;
      }

      const previousEntry = previousIncludedEntries.get(person.id);
      const previousRank = previousEntry?.rank ?? null;
      const rankDelta = previousRank === null ? null : previousRank - legacyEntry.sourceRank;
      const movement = resolveImportedMovement({
        previousRank,
        rankDelta,
        appearedBefore: appearedBefore.has(person.id)
      });
      const entry: LeaderboardEntry = {
        id: makeId("leaderboard_entry"),
        leaderboardId: leaderboard.id,
        personId: person.id,
        personNameSnapshot: person.name,
        tagSnapshots: [],
        rank: legacyEntry.sourceRank,
        previousRank,
        rankDelta,
        movement,
        scoreSnapshot: legacyEntry.score,
        previousScoreSnapshot: previousEntry?.scoreSnapshot ?? null,
        includedInRanking: true,
        noteSnapshot: person.note,
        createdAt: leaderboard.createdAt
      };

      currentIncludedEntries.set(person.id, entry);
      currentIncludedPersonIds.add(person.id);
      entries.push(entry);
    }

    for (const previousEntry of previousIncludedEntries.values()) {
      if (currentIncludedPersonIds.has(previousEntry.personId)) {
        continue;
      }

      const person = people.find((item) => item.id === previousEntry.personId);
      const outEntry: LeaderboardEntry = {
        id: makeId("leaderboard_entry"),
        leaderboardId: leaderboard.id,
        personId: previousEntry.personId,
        personNameSnapshot: person?.name ?? previousEntry.personNameSnapshot,
        tagSnapshots: [],
        rank: null,
        previousRank: previousEntry.rank,
        rankDelta: null,
        movement: "out",
        scoreSnapshot: zeroScoreByPersonId.get(previousEntry.personId) ?? null,
        previousScoreSnapshot: previousEntry.scoreSnapshot,
        includedInRanking: false,
        noteSnapshot: person?.note ?? previousEntry.noteSnapshot,
        createdAt: leaderboard.createdAt
      };

      entries.push(outEntry);
    }

    leaderboards.push(leaderboard);
    previousLeaderboard = leaderboard;
    previousIncludedEntries = currentIncludedEntries;
    for (const personId of currentIncludedPersonIds) {
      appearedBefore.add(personId);
    }
  }

  await db.transaction(
    "rw",
    [db.people, db.tags, db.person_tags, db.leaderboards, db.leaderboard_entries],
    async () => {
      await Promise.all([
        db.person_tags.clear(),
        db.leaderboard_entries.clear(),
        db.leaderboards.clear(),
        db.tags.clear(),
        db.people.clear()
      ]);
      if (people.length > 0) {
        await db.people.bulkAdd(people);
      }
      if (leaderboards.length > 0) {
        await db.leaderboards.bulkAdd(leaderboards);
      }
      if (entries.length > 0) {
        await db.leaderboard_entries.bulkAdd(entries);
      }
    }
  );

  return {
    peopleCount: people.length,
    leaderboardCount: leaderboards.length,
    entryCount: entries.filter((entry) => entry.includedInRanking).length,
    outEntryCount: entries.filter((entry) => entry.movement === "out").length
  };
}

async function parseLegacyFmsWorkbook(file: File): Promise<ParsedLegacyWorkbook> {
  const { read, utils } = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const people = new Set<string>();
  const leaderboards: ParsedLegacyLeaderboard[] = [];
  const errors: string[] = [];

  for (let column = range.s.c; column <= range.e.c; column += 3) {
    const dateCell = sheet[utils.encode_cell({ r: 0, c: column })];
    const digitalDate = toDigitalDate(dateCell?.v);

    if (digitalDate === null) {
      continue;
    }

    const entriesByName = new Map<string, ParsedLegacyEntry>();
    const zeroEntriesByName = new Map<string, ParsedLegacyEntry>();
    let title = "";

    for (let row = 1; row <= range.e.r; row += 1) {
      const nameCell = sheet[utils.encode_cell({ r: row, c: column })];
      const scoreCell = sheet[utils.encode_cell({ r: row, c: column + 1 })];
      const name = String(nameCell?.v ?? "").trim();

      if (!name) {
        continue;
      }

      if (isBlankCellValue(scoreCell?.v)) {
        title = name;
        continue;
      }

      const score = Number(scoreCell?.v);
      if (!Number.isFinite(score)) {
        errors.push(`日期 ${digitalDate} 第 ${row + 1} 行「${name}」的分数不是数字。`);
        continue;
      }

      if (score < 0) {
        errors.push(`日期 ${digitalDate} 第 ${row + 1} 行「${name}」的分数小于 0。`);
        continue;
      }

      people.add(name);
      const entry = {
        name,
        score,
        sourceRank: row
      };

      if (score > 0) {
        entriesByName.set(name, entry);
        zeroEntriesByName.delete(name);
      } else {
        entriesByName.delete(name);
        zeroEntriesByName.set(name, entry);
      }
    }

    leaderboards.push({
      digitalDate,
      boardDate: digitalDateToIsoDate(digitalDate),
      title,
      entries: [...entriesByName.values()].sort((left, right) => left.sourceRank - right.sourceRank),
      zeroScoreEntries: [...zeroEntriesByName.values()]
    });
  }

  leaderboards.sort((left, right) => left.digitalDate - right.digitalDate);

  return {
    people: [...people].sort((left, right) => left.localeCompare(right, "zh-CN")),
    leaderboards,
    errors
  };
}

function toDigitalDate(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue)) {
    return null;
  }

  const text = String(numericValue);
  return /^\d{8}$/.test(text) ? numericValue : null;
}

function isBlankCellValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function importedLeaderboardCreatedAt(boardDate: string | null, fallbackOffset: number): string {
  if (boardDate) {
    return `${boardDate}T00:00:00.000Z`;
  }

  return new Date(Date.now() + fallbackOffset).toISOString();
}

function resolveImportedMovement(input: {
  previousRank: number | null;
  rankDelta: number | null;
  appearedBefore: boolean;
}): Movement {
  if (input.previousRank === null) {
    return input.appearedBefore ? "returning" : "new";
  }

  if (input.rankDelta === null || input.rankDelta === 0) {
    return "same";
  }

  return input.rankDelta > 0 ? "up" : "down";
}
