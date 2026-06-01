<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import {
  downloadWorkbook,
  exportOverallWorkbook,
  leaderboardDigitalDate,
  overallExportFilename
} from "@/repositories/excelExportRepository";
import {
  leaderboardDisplayTitle,
  listLeaderboards,
  listPersonOverallMetrics,
  type PersonOverallMetric
} from "@/repositories/leaderboardsRepository";
import { listPeople } from "@/repositories/peopleRepository";
import type { Leaderboard, Person } from "@/types/models";
import { formatScore } from "@/utils/movement";

const leaderboards = ref<Leaderboard[]>([]);
const people = ref<Person[]>([]);
const metrics = ref<PersonOverallMetric[]>([]);
const selectedLeaderboardIds = ref<string[]>([]);
const selectedPersonIds = ref<string[]>([]);
const leaderboardRangeStartId = ref("");
const leaderboardRangeEndId = ref("");
const personRangeStartId = ref("");
const personRangeEndId = ref("");
const loading = ref(false);
const exporting = ref(false);
const exportError = ref("");

const metricByPersonId = computed(() => new Map(metrics.value.map((metric) => [metric.personId, metric])));
const selectedCellCount = computed(
  () => selectedLeaderboardIds.value.length * selectedPersonIds.value.length
);
const canExport = computed(
  () => selectedLeaderboardIds.value.length > 0 && selectedPersonIds.value.length > 0 && !exporting.value
);

async function loadExportData(): Promise<void> {
  loading.value = true;
  exportError.value = "";
  try {
    const [nextLeaderboards, nextPeople, nextMetrics] = await Promise.all([
      listLeaderboards(),
      listPeople({ includeArchived: true }),
      listPersonOverallMetrics()
    ]);
    leaderboards.value = [...nextLeaderboards].sort((left, right) => {
      const dateDelta = leaderboardDigitalDate(left) - leaderboardDigitalDate(right);
      return dateDelta !== 0 ? dateDelta : left.createdAt.localeCompare(right.createdAt);
    });
    people.value = sortPeopleForExport(nextPeople, nextMetrics);
    metrics.value = nextMetrics;
    selectedLeaderboardIds.value = leaderboards.value.map((leaderboard) => leaderboard.id);
    selectedPersonIds.value = people.value.map((person) => person.id);
    leaderboardRangeStartId.value = leaderboards.value[0]?.id ?? "";
    leaderboardRangeEndId.value = leaderboards.value.at(-1)?.id ?? "";
    personRangeStartId.value = people.value[0]?.id ?? "";
    personRangeEndId.value = people.value.at(-1)?.id ?? "";
  } finally {
    loading.value = false;
  }
}

async function exportOverall(): Promise<void> {
  if (!canExport.value) {
    return;
  }

  exporting.value = true;
  exportError.value = "";
  try {
    const workbook = await exportOverallWorkbook({
      leaderboardIds: selectedLeaderboardIds.value,
      personIds: selectedPersonIds.value
    });
    await downloadWorkbook(workbook, overallExportFilename());
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : "导出失败。";
  } finally {
    exporting.value = false;
  }
}

function toggleAllLeaderboards(): void {
  selectedLeaderboardIds.value =
    selectedLeaderboardIds.value.length === leaderboards.value.length
      ? []
      : leaderboards.value.map((leaderboard) => leaderboard.id);
}

function toggleAllPeople(): void {
  selectedPersonIds.value =
    selectedPersonIds.value.length === people.value.length
      ? []
      : people.value.map((person) => person.id);
}

function selectLeaderboardRange(): void {
  selectedLeaderboardIds.value = idsInRange(
    leaderboards.value,
    leaderboardRangeStartId.value,
    leaderboardRangeEndId.value
  );
}

function selectPersonRange(): void {
  selectedPersonIds.value = idsInRange(people.value, personRangeStartId.value, personRangeEndId.value);
}

function metricForPerson(personId: string): PersonOverallMetric | undefined {
  return metricByPersonId.value.get(personId);
}

function sortPeopleForExport(nextPeople: Person[], nextMetrics: PersonOverallMetric[]): Person[] {
  const nextMetricByPersonId = new Map(nextMetrics.map((metric) => [metric.personId, metric]));
  return [...nextPeople].sort((left, right) => {
    const leftMetric = nextMetricByPersonId.get(left.id);
    const rightMetric = nextMetricByPersonId.get(right.id);
    const leftRank = leftMetric?.overallRank ?? Number.POSITIVE_INFINITY;
    const rightRank = rightMetric?.overallRank ?? Number.POSITIVE_INFINITY;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function idsInRange<T extends { id: string }>(items: T[], startId: string, endId: string): string[] {
  const startIndex = items.findIndex((item) => item.id === startId);
  const endIndex = items.findIndex((item) => item.id === endId);
  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const firstIndex = Math.min(startIndex, endIndex);
  const lastIndex = Math.max(startIndex, endIndex);
  return items.slice(firstIndex, lastIndex + 1).map((item) => item.id);
}

onMounted(() => {
  void loadExportData();
});
</script>

<template>
  <section class="page">
    <PageHeader title="导出" description="选择日期和人员范围，生成总榜 Excel。">
      <button class="button primary" type="button" :disabled="!canExport" @click="exportOverall">
        {{ exporting ? "导出中" : "导出总榜" }}
      </button>
    </PageHeader>

    <div class="export-layout">
      <section class="panel">
        <div class="section-title">
          <h2>日期范围</h2>
          <button class="button" type="button" :disabled="loading" @click="toggleAllLeaderboards">
            {{ selectedLeaderboardIds.length === leaderboards.length ? "取消全选" : "全选" }}
          </button>
        </div>
        <p v-if="leaderboards.length === 0" class="empty">还没有榜单。</p>
        <template v-else>
          <div class="range-picker">
            <label>
              <span>从</span>
              <select v-model="leaderboardRangeStartId" class="field">
                <option
                  v-for="leaderboard in leaderboards"
                  :key="leaderboard.id"
                  :value="leaderboard.id"
                >
                  {{ leaderboardDigitalDate(leaderboard) }} {{ leaderboardDisplayTitle(leaderboard) }}
                </option>
              </select>
            </label>
            <label>
              <span>到</span>
              <select v-model="leaderboardRangeEndId" class="field">
                <option
                  v-for="leaderboard in leaderboards"
                  :key="leaderboard.id"
                  :value="leaderboard.id"
                >
                  {{ leaderboardDigitalDate(leaderboard) }} {{ leaderboardDisplayTitle(leaderboard) }}
                </option>
              </select>
            </label>
            <button class="button" type="button" :disabled="loading" @click="selectLeaderboardRange">
              选择范围
            </button>
          </div>
          <div class="selection-list">
            <label
              v-for="leaderboard in leaderboards"
              :key="leaderboard.id"
              class="selection-row"
            >
              <input v-model="selectedLeaderboardIds" type="checkbox" :value="leaderboard.id" />
              <span>
                <span class="list-title">{{ leaderboardDigitalDate(leaderboard) }}</span>
                <span class="list-meta">{{ leaderboardDisplayTitle(leaderboard) }}</span>
              </span>
            </label>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="section-title">
          <h2>人员范围</h2>
          <button class="button" type="button" :disabled="loading" @click="toggleAllPeople">
            {{ selectedPersonIds.length === people.length ? "取消全选" : "全选" }}
          </button>
        </div>
        <p v-if="people.length === 0" class="empty">还没有人员。</p>
        <template v-else>
          <div class="range-picker">
            <label>
              <span>从</span>
              <select v-model="personRangeStartId" class="field">
                <option v-for="person in people" :key="person.id" :value="person.id">
                  {{ person.name }}
                </option>
              </select>
            </label>
            <label>
              <span>到</span>
              <select v-model="personRangeEndId" class="field">
                <option v-for="person in people" :key="person.id" :value="person.id">
                  {{ person.name }}
                </option>
              </select>
            </label>
            <button class="button" type="button" :disabled="loading" @click="selectPersonRange">
              选择范围
            </button>
          </div>
          <div class="selection-list">
            <label v-for="person in people" :key="person.id" class="selection-row">
              <input v-model="selectedPersonIds" type="checkbox" :value="person.id" />
              <span>
                <span class="list-title">{{ person.name }}</span>
                <span v-if="person.archived" class="status-pill">已归档</span>
                <span class="list-meta">
                  总 {{ formatScore(metricForPerson(person.id)?.totalScore ?? 0) }} / 加权
                  {{ formatScore(metricForPerson(person.id)?.weightedScore ?? 0) }}
                </span>
              </span>
            </label>
          </div>
        </template>
      </section>

      <section class="panel">
        <div class="section-title">
          <h2>统计</h2>
        </div>
        <dl class="detail-list">
          <dt>日期</dt>
          <dd>{{ selectedLeaderboardIds.length }} / {{ leaderboards.length }}</dd>
          <dt>人员</dt>
          <dd>{{ selectedPersonIds.length }} / {{ people.length }}</dd>
          <dt>总计</dt>
          <dd>{{ selectedCellCount }}</dd>
        </dl>
        <p v-if="exportError" class="error-list">{{ exportError }}</p>
      </section>
    </div>
  </section>
</template>
