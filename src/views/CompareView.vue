<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import {
  getPeopleCompareTrendData,
  leaderboardDisplayDateSource,
  type PeopleCompareTrendData
} from "@/repositories/leaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import { displayDate } from "@/utils/dates";

type CompareMode = "score" | "rank" | "overall-rank";

const PeopleCompareChart = defineAsyncComponent(() => import("@/components/PeopleCompareChart.vue"));
const workspaceTabs = useWorkspaceTabsStore();
const mode = ref<CompareMode>("score");
const compareData = ref<PeopleCompareTrendData | null>(null);
const loading = ref(false);
let loadVersion = 0;

const personTabs = computed(() =>
  workspaceTabs.tabs.filter((tab) => tab.kind === "person")
);
const comparedPersonIds = computed(() => personTabs.value.map((tab) => tab.entityId));
const chartSeries = computed(() => {
  const leaderboards = compareData.value?.leaderboards ?? [];

  return (compareData.value?.series ?? []).map((series) => ({
    personId: series.personId,
    personName: series.personName,
    points: series.points.map((point, index) => ({
      ...point,
      dateLabel: displayDate(leaderboards[index] ? leaderboardDisplayDateSource(leaderboards[index]) : null)
    }))
  }));
});

watch(
  comparedPersonIds,
  () => {
    void loadCompareData();
  },
  { immediate: true }
);

async function loadCompareData(): Promise<void> {
  const currentVersion = ++loadVersion;
  if (comparedPersonIds.value.length === 0) {
    compareData.value = null;
    return;
  }

  loading.value = true;
  try {
    const nextData = await getPeopleCompareTrendData(comparedPersonIds.value);
    if (currentVersion === loadVersion) {
      compareData.value = nextData;
    }
  } finally {
    if (currentVersion === loadVersion) {
      loading.value = false;
    }
  }
}
</script>

<template>
  <section class="page compare-page">
    <PageHeader title="比较" description="比较当前标签页栏中已打开人员的历史分数、单期排名和总榜排名走势。" />

    <section class="compare-layout">
      <main class="panel compare-chart-panel">
        <div class="section-title">
          <h2>趋势</h2>
          <div class="chart-mode-toggle" role="tablist" aria-label="比较指标">
            <button
              class="chart-mode-button"
              :class="{ selected: mode === 'score' }"
              type="button"
              role="tab"
              :aria-selected="mode === 'score'"
              @click="mode = 'score'"
            >
              分数
            </button>
            <button
              class="chart-mode-button"
              :class="{ selected: mode === 'rank' }"
              type="button"
              role="tab"
              :aria-selected="mode === 'rank'"
              @click="mode = 'rank'"
            >
              排名
            </button>
            <button
              class="chart-mode-button"
              :class="{ selected: mode === 'overall-rank' }"
              type="button"
              role="tab"
              :aria-selected="mode === 'overall-rank'"
              @click="mode = 'overall-rank'"
            >
              总榜排名
            </button>
          </div>
        </div>

        <p v-if="personTabs.length === 0" class="empty">请先打开要比较的人员详情标签页。</p>
        <p v-else-if="loading" class="empty">正在生成比较数据...</p>
        <PeopleCompareChart v-else :mode="mode" :series="chartSeries" />
      </main>
    </section>
  </section>
</template>
