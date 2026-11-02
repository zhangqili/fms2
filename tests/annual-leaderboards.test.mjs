import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import { createPinia } from "pinia";

let vite;
let calculateAnnualLeaderboard;
let calculatePersonOverallMetrics;
let useWorkspaceTabsStore;
let workspaceTabFallbackPath;
let parseAnnualLeaderboardYear;

before(async () => {
  const setupTimeout = setTimeout(() => {
    throw new Error("Timed out loading annual leaderboard modules.");
  }, 10_000);
  try {
    vite = await createServer({
      configFile: false,
      appType: "custom",
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
      server: { middlewareMode: true, ws: false, watch: null }
    });
    ({ calculateAnnualLeaderboard } = await vite.ssrLoadModule(
      "/src/repositories/annualLeaderboardsRepository.ts"
    ));
    ({ calculatePersonOverallMetrics } = await vite.ssrLoadModule(
      "/src/repositories/leaderboardsRepository.ts"
    ));
    ({ useWorkspaceTabsStore, workspaceTabFallbackPath } = await vite.ssrLoadModule(
      "/src/stores/workspaceTabsStore.ts"
    ));
    ({ parseAnnualLeaderboardYear } = await vite.ssrLoadModule("/src/utils/annualLeaderboards.ts"));
  } finally {
    clearTimeout(setupTimeout);
  }
});

function person(id, name = id, archived = false) {
  return { id, name, archived, note: "", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" };
}

function board(id, boardDate, createdAt = "2026-01-01T12:00:00Z") {
  return { id, boardDate, createdAt };
}

let entryId = 0;
function entry(leaderboardId, personId, scoreSnapshot, rank, includedInRanking = true) {
  return { id: `entry-${++entryId}`, leaderboardId, personId, scoreSnapshot, rank, includedInRanking };
}

test("annual average counts only effective appearances; peak is the best weekly rank", () => {
  const boards = [
    board("w1", "2024-01-01"), board("w2", "2024-01-08"),
    board("w3", "2024-01-15"), board("w4", "2024-01-22"),
    board("w5", "2024-01-29"), board("w6", "2024-02-05")
  ];
  const rows = calculateAnnualLeaderboard(2024, [person("a"), person("b"), person("inactive")], boards, [
    entry("w1", "a", 10, 5), entry("w2", "a", 20, 2),
    entry("w3", "a", null, null, false), entry("w4", "a", 0, 1),
    entry("w5", "a", 99, null), entry("w6", "a", 100, 1, false),
    entry("w1", "b", 40, 1), entry("w2", "inactive", 0, 2)
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((row) => row.personId === "a"), {
    personId: "a", personName: "a", annualRank: 2,
    weeklyAverageScore: 15, annualPeakScore: 20, weeklyPeakRank: 2
  });
  assert.equal(rows.find((row) => row.personId === "b").weeklyAverageScore, 40);
  assert.equal(rows.find((row) => row.personId === "b").annualPeakScore, 40);
});

test("year boundaries use board dates before creation dates, with creation-date fallback", () => {
  const people = [person("a")];
  const boards = [
    board("dec", "2023-12-31"), board("jan", "2024-01-01"),
    board("fallback", null, "2024-07-01T12:00:00Z"),
    board("next", "2025-01-01"), board("invalid", "invalid-date")
  ];
  const entries = [
    entry("dec", "a", 900, 1), entry("jan", "a", 12, 4),
    entry("fallback", "a", 24, 2), entry("next", "a", 800, 1),
    entry("invalid", "a", 700, 1), entry("missing-board", "a", 600, 1)
  ];
  assert.equal(calculateAnnualLeaderboard(2023, people, boards, entries)[0].weeklyAverageScore, 900);
  assert.equal(calculateAnnualLeaderboard(2024, people, boards, entries)[0].weeklyAverageScore, 18);
  assert.equal(calculateAnnualLeaderboard(2024, people, boards, entries)[0].annualPeakScore, 24);
  assert.equal(calculateAnnualLeaderboard(2025, people, boards, entries)[0].weeklyAverageScore, 800);
  assert.deepEqual(calculateAnnualLeaderboard(2022, people, boards, entries), []);
});

test("annual ranks match the existing overall algorithm, rather than average-score order", () => {
  const people = [person("steady"), person("single"), person("archived", "Archived", true)];
  const boards = [board("one", "2024-01-01"), board("two", "2024-01-02")];
  const entries = [
    entry("one", "steady", 30, 1), entry("two", "steady", 30, 1),
    entry("one", "single", 40, 2), entry("two", "archived", 10, 3)
  ];
  const rows = calculateAnnualLeaderboard(2024, people, boards, entries);
  const expectedOrder = calculatePersonOverallMetrics(people, entries)
    .filter((metric) => metric.effectiveEntryCount > 0)
    .sort((left, right) => left.overallRank - right.overallRank)
    .map((metric) => metric.personId);
  assert.deepEqual(rows.map((row) => row.personId), expectedOrder);
  assert.deepEqual(rows.map((row) => row.personId), ["steady", "single", "archived"]);
  assert.deepEqual(rows.map((row) => row.annualRank), [1, 2, 3]);
  assert.ok(rows[0].weeklyAverageScore < rows[1].weeklyAverageScore);
});

test("tied weekly scores and ranks still produce distinct annual ranks with deterministic ties", () => {
  const people = [person("b", "Beta"), person("a", "Alpha"), person("duplicate", "Alpha")];
  const boards = [board("w1", "2024-01-01")];
  const entries = people.map((item) => entry("w1", item.id, 15, 1));
  const rows = calculateAnnualLeaderboard(2024, people, boards, entries);
  assert.deepEqual(rows.map((row) => row.personId), ["a", "duplicate", "b"]);
  assert.deepEqual(rows.map((row) => row.annualRank), [1, 2, 3]);
  assert.ok(rows.every((row) => row.weeklyPeakRank === 1 && row.weeklyAverageScore === 15));
});

test("multiple boards in the same natural week each count as an appearance", () => {
  const rows = calculateAnnualLeaderboard(2024, [person("a")], [
    board("one", "2024-01-01"), board("two", "2024-01-02"), board("three", "2024-01-03")
  ], [entry("one", "a", 1, 1), entry("two", "a", 2, 1), entry("three", "a", 2, 1)]);
  assert.equal(rows[0].weeklyAverageScore, 5 / 3);
});

test("empty years and people without effective entries have no annual rows", () => {
  const boards = [board("w1", "2024-01-01")];
  assert.deepEqual(calculateAnnualLeaderboard(2024, [], boards, [entry("w1", "deleted-person", 10, 1)]), []);
  assert.deepEqual(calculateAnnualLeaderboard(2024, [person("a")], boards, [
    entry("w1", "a", 0, 1), entry("w1", "a", null, null, false)
  ]), []);
});

test("invalid year inputs are rejected", () => {
  for (const year of [0, 10000, 2024.5, NaN, Infinity]) {
    assert.throws(() => calculateAnnualLeaderboard(year, [], [], []), /请选择有效年份/);
  }
});

test("annual tabs are independent per year and opening the same year only activates it", () => {
  const store = useWorkspaceTabsStore(createPinia());
  const first = store.openAnnualLeaderboardTab(2025);
  const second = store.openAnnualLeaderboardTab(2024);
  assert.notEqual(first, second);
  assert.deepEqual(store.tabs.map(({ title, routePath, kind }) => ({ title, routePath, kind })), [
    { title: "2025 年榜", routePath: "/annual-leaderboards/2025", kind: "annual-leaderboard" },
    { title: "2024 年榜", routePath: "/annual-leaderboards/2024", kind: "annual-leaderboard" }
  ]);
  assert.equal(store.openAnnualLeaderboardTab(2025), first);
  assert.equal(store.tabs.length, 2);
  assert.equal(store.activeTabId, first);
});

test("annual tabs coexist with person and weekly tabs and use the existing neighbor-close order", () => {
  const store = useWorkspaceTabsStore(createPinia());
  const personTab = store.openPersonTab("2025", "Person");
  const annualTab = store.openAnnualLeaderboardTab(2025);
  const weeklyTab = store.openLeaderboardTab("2025", "Weekly");
  assert.equal(new Set([personTab, annualTab, weeklyTab]).size, 3);
  store.activateTab(annualTab);
  assert.equal(store.closeTab(annualTab).id, weeklyTab);
  assert.equal(store.activeTabId, weeklyTab);
  assert.equal(store.closeTab(personTab).id, weeklyTab);
  assert.equal(store.activeTabId, weeklyTab);
  assert.equal(store.closeTab(weeklyTab), null);
  assert.equal(store.activeTabId, null);
});

test("closing the last annual tab returns home rather than reopening the latest annual board", () => {
  const store = useWorkspaceTabsStore(createPinia());
  const id = store.openAnnualLeaderboardTab(2025);
  assert.equal(store.closeTab(id), null);
  assert.equal(store.tabs.length, 0);
  assert.equal(workspaceTabFallbackPath("annual-leaderboard"), "/");
  assert.equal(workspaceTabFallbackPath("person"), "/people");
  assert.equal(workspaceTabFallbackPath("leaderboard"), "/leaderboards");
});

test("year route parameters reject invalid values and invalid tabs leave state unchanged", () => {
  assert.equal(parseAnnualLeaderboardYear("2025"), 2025);
  assert.equal(parseAnnualLeaderboardYear("1"), 1);
  for (const value of [undefined, "", "0", "10000", "2025.5", "bad-year", ["2025"]]) {
    assert.equal(parseAnnualLeaderboardYear(value), null);
  }
  const store = useWorkspaceTabsStore(createPinia());
  assert.throws(() => store.openAnnualLeaderboardTab(0), /请选择有效年份/);
  assert.equal(store.tabs.length, 0);
  assert.equal(store.activeTabId, null);
});

after(() => vite?.close());
