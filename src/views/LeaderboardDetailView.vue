<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  getLeaderboard,
  leaderboardDisplayDate,
  leaderboardDisplayDateSource,
  listLeaderboardEntries,
  summarizeLeaderboardEntries
} from "@/repositories/leaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Leaderboard, LeaderboardEntry } from "@/types/models";
import { displayDate } from "@/utils/dates";
import { formatScore, movementText } from "@/utils/movement";

const props = defineProps<{
  id: string;
}>();

const workspaceTabs = useWorkspaceTabsStore();
const leaderboard = ref<Leaderboard | null>(null);
const entries = ref<LeaderboardEntry[]>([]);
let loadVersion = 0;

const includedEntries = computed(() => entries.value.filter((entry) => entry.includedInRanking));
const outEntries = computed(() => entries.value.filter((entry) => entry.movement === "out"));
const summary = computed(() => summarizeLeaderboardEntries(entries.value));

async function loadLeaderboardDetail(leaderboardId: string): Promise<void> {
  const currentVersion = ++loadVersion;
  leaderboard.value = null;
  entries.value = [];

  const [nextLeaderboard, nextEntries] = await Promise.all([
    getLeaderboard(leaderboardId),
    listLeaderboardEntries(leaderboardId)
  ]);

  if (currentVersion !== loadVersion) {
    return;
  }

  leaderboard.value = nextLeaderboard ?? null;
  entries.value = nextEntries;
  if (nextLeaderboard) {
    workspaceTabs.updateTabTitle(
      "leaderboard",
      nextLeaderboard.id,
      leaderboardDisplayDate(nextLeaderboard)
    );
  }
}

function openPersonTab(entry: LeaderboardEntry): void {
  workspaceTabs.openPersonTab(entry.personId, entry.personNameSnapshot);
}

watch(
  () => props.id,
  (leaderboardId) => {
    void loadLeaderboardDetail(leaderboardId);
  },
  { immediate: true }
);
</script>

<template>
  <section class="page detail-page">
    <PageHeader
      :title="leaderboard?.title || '未命名榜单'"
      description="详情页会展示名次、分数快照、上升下降、初次进榜、回榜和出榜。"
    />

    <div class="detail-layout">
      <main class="detail-main">
        <section class="panel">
          <div class="section-title">
            <h2>本期数据</h2>
          </div>
          <p v-if="includedEntries.length === 0" class="empty">该榜单还没有在榜条目。</p>
          <div v-else class="table-panel">
            <div class="table-row table-head">
              <span>名次</span>
              <span>姓名</span>
              <span>分数</span>
              <span>变化</span>
            </div>
            <RouterLink
              v-for="entry in includedEntries"
              :key="entry.id"
              class="table-row"
              :to="`/people/${entry.personId}`"
              @click="openPersonTab(entry)"
            >
              <span>{{ entry.rank ?? "-" }}</span>
              <span class="table-link">
                {{ entry.personNameSnapshot }}
              </span>
              <span>{{ formatScore(entry.scoreSnapshot) }}</span>
              <span>{{ movementText(entry) }}</span>
            </RouterLink>
          </div>
        </section>
      </main>

      <aside class="detail-side">
        <section class="panel">
          <div class="section-title">
            <h2>榜单信息</h2>
          </div>
          <dl class="detail-list">
            <dt>日期</dt>
            <dd>{{ displayDate(leaderboard ? leaderboardDisplayDateSource(leaderboard) : null) }}</dd>
            <dt>标题</dt>
            <dd>{{ leaderboard?.title || "未命名榜单" }}</dd>
            <dt>人数</dt>
            <dd>{{ summary.includedCount }}</dd>
            <dt>出榜人数</dt>
            <dd>{{ summary.outCount }}</dd>
            <dt>旧 FMS 数字日期</dt>
            <dd>{{ leaderboard?.legacyDigitalDate ?? "-" }}</dd>
          </dl>
        </section>

        <section class="panel">
          <div class="section-title">
            <h2>出榜记录</h2>
          </div>
          <p v-if="outEntries.length === 0" class="empty">本期没有出榜记录。</p>
          <div v-else class="table-panel out-table">
            <div class="table-row table-head">
              <span>姓名</span>
              <span>上期排名</span>
              <span>上期分数</span>
              <span>状态</span>
            </div>
            <RouterLink
              v-for="entry in outEntries"
              :key="entry.id"
              class="table-row"
              :to="`/people/${entry.personId}`"
              @click="openPersonTab(entry)"
            >
              <span class="table-link">
                {{ entry.personNameSnapshot }}
              </span>
              <span>{{ entry.previousRank ?? "-" }}</span>
              <span>{{ formatScore(entry.previousScoreSnapshot) }}</span>
              <span>{{ movementText(entry) }}</span>
            </RouterLink>
          </div>
        </section>
      </aside>
    </div>
  </section>
</template>
