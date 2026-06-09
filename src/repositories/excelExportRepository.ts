import { db } from "@/db";
import {
  calculatePersonOverallMetrics,
  leaderboardDisplayTitle,
  type PersonOverallMetric
} from "@/repositories/leaderboardsRepository";
import type { Leaderboard, LeaderboardEntry, Person, PersonTag, Tag } from "@/types/models";
import type { WorkBook } from "xlsx";

type CellValue = string | number | null;
type XlsxModule = typeof import("xlsx") & {
  default?: {
    CFB?: XlsxCfb;
  };
};

type FmsWorkbook = WorkBook & {
  __fms2LegacyTagColors?: string[];
};

interface XlsxCfb {
  read(data: Uint8Array, options: { type: "array" }): XlsxCfbContainer;
  write(container: XlsxCfbContainer, options: { fileType: "zip"; type: "array" }): ArrayBuffer | Uint8Array | string;
}

interface XlsxCfbContainer {
  FullPaths: string[];
  FileIndex: XlsxCfbFile[];
}

interface XlsxCfbFile {
  content?: Uint8Array;
  size?: number;
}

export interface OverallWorkbookOptions {
  leaderboardIds: string[];
  personIds: string[];
}

export async function exportOverallWorkbook(options: OverallWorkbookOptions): Promise<WorkBook> {
  const { utils } = await import("xlsx");
  const [people, leaderboards, entries] = await Promise.all([
    db.people.toArray(),
    db.leaderboards.toArray(),
    db.leaderboard_entries.toArray()
  ]);

  const personIdSet = new Set(options.personIds);
  const leaderboardIdSet = new Set(options.leaderboardIds);
  const selectedPeople = people.filter((person) => personIdSet.has(person.id));
  const selectedLeaderboards = sortLeaderboardsForExport(
    leaderboards.filter((leaderboard) => leaderboardIdSet.has(leaderboard.id))
  );
  const selectedEntries = entries.filter(
    (entry) => personIdSet.has(entry.personId) && leaderboardIdSet.has(entry.leaderboardId)
  );
  const metrics = calculatePersonOverallMetrics(selectedPeople, selectedEntries);
  const metricByPersonId = new Map(metrics.map((metric) => [metric.personId, metric]));
  const effectiveEntryByKey = buildEffectiveEntryMap(selectedEntries);
  const sortedPeople = sortPeopleForOverallExport(selectedPeople, metricByPersonId);

  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(buildOverallRows(sortedPeople, selectedLeaderboards, metricByPersonId, effectiveEntryByKey)),
    "总榜"
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(buildRankStatsRows(sortedPeople, selectedLeaderboards, effectiveEntryByKey)),
    "位次统计"
  );
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet(buildOverallRankTrendRows(sortedPeople, selectedLeaderboards, selectedEntries)),
    "总榜排名走势"
  );

  return workbook;
}

export async function exportLegacyWorkbook(): Promise<WorkBook> {
  const { utils } = await import("xlsx");
  const [leaderboards, entries, tags, people, personTags] = await Promise.all([
    db.leaderboards.toArray(),
    db.leaderboard_entries.toArray(),
    db.tags.toArray(),
    db.people.toArray(),
    db.person_tags.toArray()
  ]);
  const sortedLeaderboards = sortLeaderboardsForExport(leaderboards);
  const entriesByLeaderboardId = new Map<string, LeaderboardEntry[]>();

  for (const entry of entries) {
    if (!isEffectiveScoredEntry(entry)) {
      continue;
    }

    const list = entriesByLeaderboardId.get(entry.leaderboardId) ?? [];
    list.push(entry);
    entriesByLeaderboardId.set(entry.leaderboardId, list);
  }

  for (const list of entriesByLeaderboardId.values()) {
    list.sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
  }

  const maxEntryCount = Math.max(
    0,
    ...sortedLeaderboards.map((leaderboard) => entriesByLeaderboardId.get(leaderboard.id)?.length ?? 0)
  );
  const rows: CellValue[][] = Array.from({ length: maxEntryCount + 2 }, () => []);

  for (const [index, leaderboard] of sortedLeaderboards.entries()) {
    const column = index * 3;
    const boardEntries = entriesByLeaderboardId.get(leaderboard.id) ?? [];
    rows[0][column] = leaderboardDigitalDate(leaderboard);

    for (const [entryIndex, entry] of boardEntries.entries()) {
      rows[entryIndex + 1][column] = entry.personNameSnapshot;
      rows[entryIndex + 1][column + 1] = entry.scoreSnapshot ?? 0;
    }

    rows[boardEntries.length + 1][column] = leaderboardDisplayTitle(leaderboard);
  }

  const workbook = utils.book_new() as FmsWorkbook;
  const tagSheetData = buildLegacyTagRows(tags, people, personTags);
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows.length > 0 ? rows : [[]]), "Sheet1");
  const tagSheet = utils.aoa_to_sheet(tagSheetData.rows.length > 0 ? tagSheetData.rows : [[]]);
  tagSheet["!cols"] = [
    { wch: 4 },
    { wch: 16 },
    ...Array.from({ length: tagSheetData.maxPersonCount }, () => ({ wch: 12 }))
  ];
  tagSheetData.colors.forEach((color, index) => {
    const colorCell = tagSheet[utils.encode_cell({ r: index, c: 0 })] as { s?: unknown } | undefined;
    if (colorCell) {
      colorCell.s = {
        fill: {
          fgColor: { rgb: normalizeWorkbookColor(color) },
          patternType: "solid"
        }
      };
    }
  });
  utils.book_append_sheet(workbook, tagSheet, "标签");
  workbook.__fms2LegacyTagColors = tagSheetData.colors;
  return workbook;
}

export async function downloadWorkbook(workbook: WorkBook, filename: string): Promise<void> {
  const xlsxModule = await import("xlsx") as XlsxModule;
  const workbookData = xlsxModule.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const frozenWorkbookData = freezeWorkbookFirstRowAndColumn(
    workbookData,
    xlsxModule,
    (workbook as FmsWorkbook).__fms2LegacyTagColors ?? []
  );
  const blob = new Blob([copyToArrayBuffer(frozenWorkbookData)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function overallExportFilename(): string {
  return `fms2-overall-ranking-${todayStamp()}.xlsx`;
}

export function legacyExportFilename(): string {
  return `fms2-legacy-export-${todayStamp()}.xlsx`;
}

export function leaderboardDigitalDate(leaderboard: Leaderboard): number {
  if (leaderboard.legacyDigitalDate !== null) {
    return leaderboard.legacyDigitalDate;
  }

  const source = leaderboard.boardDate ?? leaderboard.createdAt.slice(0, 10);
  const text = source.slice(0, 10).replaceAll("-", "");
  return /^\d{8}$/.test(text) ? Number(text) : 0;
}

function buildOverallRows(
  people: Person[],
  leaderboards: Leaderboard[],
  metricByPersonId: Map<string, PersonOverallMetric>,
  effectiveEntryByKey: Map<string, LeaderboardEntry>
): CellValue[][] {
  const rows: CellValue[][] = [
    [
      "姓名",
      ...leaderboards.map((leaderboard) => leaderboardDigitalDate(leaderboard)),
      "上榜次数",
      "总点数",
      "加权总点数",
      "加权排名",
      "峰值排名",
      "总榜排名",
      "单周最高排名",
      "单周最高点数"
    ]
  ];

  for (const person of people) {
    const metric = metricByPersonId.get(person.id);
    rows.push([
      person.name,
      ...leaderboards.map((leaderboard) => {
        const entry = effectiveEntryByKey.get(entryKey(leaderboard.id, person.id));
        return entry?.scoreSnapshot ?? 0;
      }),
      metric?.effectiveEntryCount ?? 0,
      metric?.totalScore ?? 0,
      metric?.weightedScore ?? 0,
      metric?.weightedRank ?? "",
      metric?.peakTierRank ?? "",
      metric?.overallRank ?? "",
      metric?.peakRank ?? "",
      metric?.highestScore ?? 0
    ]);
  }

  return rows;
}

function buildRankStatsRows(
  people: Person[],
  leaderboards: Leaderboard[],
  effectiveEntryByKey: Map<string, LeaderboardEntry>
): CellValue[][] {
  const rankHeaders = Array.from({ length: 60 }, (_, index) => String(index + 1));
  const rows: CellValue[][] = [["姓名", ...rankHeaders, "0"]];

  for (const person of people) {
    const rankCounts = Array.from({ length: 60 }, () => 0);
    let missingCount = 0;

    for (const leaderboard of leaderboards) {
      const entry = effectiveEntryByKey.get(entryKey(leaderboard.id, person.id));
      if (!entry) {
        missingCount += 1;
        continue;
      }

      const rank = entry.rank ?? 0;
      if (rank >= 1 && rank <= 60) {
        rankCounts[rank - 1] += 1;
      } else {
        missingCount += 1;
      }
    }

    rows.push([person.name, ...rankCounts, missingCount]);
  }

  return rows;
}

function buildOverallRankTrendRows(
  people: Person[],
  leaderboards: Leaderboard[],
  entries: LeaderboardEntry[]
): CellValue[][] {
  const entriesByLeaderboardId = new Map<string, LeaderboardEntry[]>();
  const accumulatedEntries: LeaderboardEntry[] = [];
  const overallRankByKey = new Map<string, number | null>();

  for (const entry of entries) {
    const groupedEntries = entriesByLeaderboardId.get(entry.leaderboardId) ?? [];
    groupedEntries.push(entry);
    entriesByLeaderboardId.set(entry.leaderboardId, groupedEntries);
  }

  for (const leaderboard of leaderboards) {
    accumulatedEntries.push(...(entriesByLeaderboardId.get(leaderboard.id) ?? []));
    const metricByPersonId = new Map(
      calculatePersonOverallMetrics(people, accumulatedEntries).map((metric) => [metric.personId, metric])
    );

    for (const person of people) {
      overallRankByKey.set(
        entryKey(leaderboard.id, person.id),
        metricByPersonId.get(person.id)?.overallRank ?? null
      );
    }
  }

  return [
    ["姓名", ...leaderboards.map((leaderboard) => leaderboardDigitalDate(leaderboard))],
    ...people.map((person) => [
      person.name,
      ...leaderboards.map((leaderboard) => overallRankByKey.get(entryKey(leaderboard.id, person.id)) ?? null)
    ])
  ];
}

function buildLegacyTagRows(
  tags: Tag[],
  people: Person[],
  personTags: PersonTag[]
): { rows: CellValue[][]; colors: string[]; maxPersonCount: number } {
  const rows: CellValue[][] = [];
  const colors: string[] = [];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const relationsByTagId = new Map<string, PersonTag[]>();
  let maxPersonCount = 0;

  for (const relation of personTags) {
    const relations = relationsByTagId.get(relation.tagId) ?? [];
    relations.push(relation);
    relationsByTagId.set(relation.tagId, relations);
  }

  for (const tag of sortTagsForExport(tags)) {
    const boundPeople = (relationsByTagId.get(tag.id) ?? [])
      .map((relation) => peopleById.get(relation.personId))
      .filter((person): person is Person => Boolean(person))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    const color = normalizeTagColor(tag.color);
    rows.push([color, tag.name, ...boundPeople.map((person) => person.name)]);
    colors.push(color);
    maxPersonCount = Math.max(maxPersonCount, boundPeople.length);
  }

  return { rows, colors, maxPersonCount };
}

function buildEffectiveEntryMap(entries: LeaderboardEntry[]): Map<string, LeaderboardEntry> {
  const entryByKey = new Map<string, LeaderboardEntry>();

  for (const entry of entries) {
    if (!isEffectiveScoredEntry(entry)) {
      continue;
    }

    const key = entryKey(entry.leaderboardId, entry.personId);
    const existing = entryByKey.get(key);
    if (!existing || (entry.rank ?? Number.POSITIVE_INFINITY) < (existing.rank ?? Number.POSITIVE_INFINITY)) {
      entryByKey.set(key, entry);
    }
  }

  return entryByKey;
}

function sortPeopleForOverallExport(
  people: Person[],
  metricByPersonId: Map<string, PersonOverallMetric>
): Person[] {
  return [...people].sort((left, right) => {
    const leftMetric = metricByPersonId.get(left.id);
    const rightMetric = metricByPersonId.get(right.id);
    const leftOverallRank = leftMetric?.overallRank ?? Number.POSITIVE_INFINITY;
    const rightOverallRank = rightMetric?.overallRank ?? Number.POSITIVE_INFINITY;

    if (leftOverallRank !== rightOverallRank) {
      return leftOverallRank - rightOverallRank;
    }

    const leftWeightedRank = leftMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
    const rightWeightedRank = rightMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
    if (leftWeightedRank !== rightWeightedRank) {
      return leftWeightedRank - rightWeightedRank;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function sortLeaderboardsForExport(leaderboards: Leaderboard[]): Leaderboard[] {
  return [...leaderboards].sort((left, right) => {
    const leftDate = leaderboardDigitalDate(left);
    const rightDate = leaderboardDigitalDate(right);
    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function sortTagsForExport(tags: Tag[]): Tag[] {
  return [...tags].sort((left, right) => {
    const sortOrderDelta = left.sortOrder - right.sortOrder;
    if (sortOrderDelta !== 0) {
      return sortOrderDelta;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function isEffectiveScoredEntry(entry: LeaderboardEntry): boolean {
  return entry.includedInRanking && entry.rank !== null && (entry.scoreSnapshot ?? 0) > 0;
}

function entryKey(leaderboardId: string, personId: string): string {
  return `${leaderboardId}:${personId}`;
}

function freezeWorkbookFirstRowAndColumn(
  data: ArrayBuffer,
  xlsxModule: XlsxModule,
  legacyTagColors: string[] = []
): Uint8Array {
  const CFB = (xlsxModule.default?.CFB ?? xlsxModule.CFB) as XlsxCfb | undefined;
  if (!CFB) {
    throw new Error("当前 xlsx 运行时不支持写入冻结窗格。");
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const container: XlsxCfbContainer = CFB.read(new Uint8Array(data), { type: "array" });
  const legacyTagStyleIndexes = legacyTagColors.length > 0
    ? applyLegacyTagFillStyles(container, decoder, encoder, legacyTagColors)
    : [];

  container.FullPaths.forEach((path, index) => {
    if (!path.startsWith("Root Entry/xl/worksheets/") || !path.endsWith(".xml")) {
      return;
    }

    const file = container.FileIndex[index];
    if (!file.content) {
      return;
    }

    const xml = decoder.decode(toUint8Array(file.content));
    const frozenXml = applyFrozenPaneXml(xml);
    const nextXml = path.endsWith("/sheet2.xml") && legacyTagStyleIndexes.length > 0
      ? applyLegacyTagSheetFillXml(frozenXml, legacyTagStyleIndexes)
      : frozenXml;
    file.content = encoder.encode(nextXml);
    file.size = file.content.length;
  });

  return toUint8Array(CFB.write(container, { fileType: "zip", type: "array" }));
}

function applyLegacyTagFillStyles(
  container: XlsxCfbContainer,
  decoder: TextDecoder,
  encoder: TextEncoder,
  colors: string[]
): number[] {
  const stylesIndex = container.FullPaths.findIndex((path) => path.endsWith("/xl/styles.xml"));
  const stylesFile = stylesIndex >= 0 ? container.FileIndex[stylesIndex] : undefined;
  if (!stylesFile?.content) {
    return [];
  }

  const xml = decoder.decode(toUint8Array(stylesFile.content));
  const fontCount = Number(xml.match(/<fonts count="(\d+)"/)?.[1] ?? 0);
  const fillCount = Number(xml.match(/<fills count="(\d+)"/)?.[1] ?? 0);
  const cellXfsCount = Number(xml.match(/<cellXfs count="(\d+)"/)?.[1] ?? 0);

  if (!Number.isFinite(fontCount) || !Number.isFinite(fillCount) || !Number.isFinite(cellXfsCount)) {
    return [];
  }

  const normalizedColors = colors.map(normalizeWorkbookColor);
  const fonts = normalizedColors
    .map((color) => `<font><sz val="12"/><color rgb="FF${color}"/><name val="Calibri"/></font>`)
    .join("");
  const fills = normalizedColors
    .map((color) =>
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`
    )
    .join("");
  const xfs = normalizedColors
    .map((_color, index) =>
      `<xf numFmtId="0" fontId="${fontCount + index}" fillId="${fillCount + index}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`
    )
    .join("");

  const nextXml = xml
    .replace(/<fonts count="\d+"/, `<fonts count="${fontCount + normalizedColors.length}"`)
    .replace("</fonts>", `${fonts}</fonts>`)
    .replace(/<fills count="\d+"/, `<fills count="${fillCount + normalizedColors.length}"`)
    .replace("</fills>", `${fills}</fills>`)
    .replace(/<cellXfs count="\d+"/, `<cellXfs count="${cellXfsCount + normalizedColors.length}"`)
    .replace("</cellXfs>", `${xfs}</cellXfs>`);

  stylesFile.content = encoder.encode(nextXml);
  stylesFile.size = stylesFile.content.length;

  return normalizedColors.map((_color, index) => cellXfsCount + index);
}

function applyLegacyTagSheetFillXml(xml: string, styleIndexes: number[]): string {
  return styleIndexes.reduce((nextXml, styleIndex, index) => {
    const cellRef = `A${index + 1}`;
    const escapedCellRef = cellRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const styledCellPattern = new RegExp(`(<c\\b(?=[^>]*\\br="${escapedCellRef}")[^>]*?)\\s+s="\\d+"([^>]*>)`);
    const unstyledCellPattern = new RegExp(`(<c\\b(?=[^>]*\\br="${escapedCellRef}")[^>]*?)(>)`);
    const styledXml = nextXml.replace(styledCellPattern, `$1 s="${styleIndex}"$2`);

    return styledXml === nextXml
      ? nextXml.replace(unstyledCellPattern, `$1 s="${styleIndex}"$2`)
      : styledXml;
  }, xml);
}

function applyFrozenPaneXml(xml: string): string {
  const frozenSheetViews =
    '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="topRight" activeCell="B1" sqref="B1"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews>';

  if (/<sheetViews[\s\S]*?<\/sheetViews>/.test(xml)) {
    return xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, frozenSheetViews);
  }

  return xml.replace(/(<dimension[^>]*\/>)/, `$1${frozenSheetViews}`);
}

function toUint8Array(data: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof data === "string") {
    const bytes = new Uint8Array(data.length);
    for (let index = 0; index < data.length; index += 1) {
      bytes[index] = data.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function copyToArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

function normalizeTagColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#5b2a86";
}

function normalizeWorkbookColor(value: string): string {
  return normalizeTagColor(value).replace("#", "").toUpperCase();
}

function todayStamp(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
