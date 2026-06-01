<script setup lang="ts">
import { computed, onMounted } from "vue";
import { RouterLink } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  leaderboardDisplayDate,
  leaderboardDisplayOptionalTitle
} from "@/repositories/leaderboardsRepository";
import { useLeaderboardsStore } from "@/stores/leaderboardsStore";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Leaderboard } from "@/types/models";

const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const leaderboardsStore = useLeaderboardsStore();
const workspaceTabs = useWorkspaceTabsStore();

const recentLeaderboards = computed(() => leaderboardsStore.leaderboards.slice(0, 3));

function openLeaderboardTab(leaderboard: Leaderboard): void {
  workspaceTabs.openLeaderboardTab(leaderboard.id, leaderboardDisplayDate(leaderboard));
}

onMounted(async () => {
  await Promise.all([
    peopleStore.loadPeople({ includeArchived: false, query: "", tagIds: [], sort: "name" }),
    tagsStore.loadTags(),
    leaderboardsStore.loadLeaderboards()
  ]);
});
</script>

<template>
  <section class="page">
    <PageHeader title="FMS2" description="离线优先的亲友榜单管理工具">
      <RouterLink class="button primary" to="/leaderboards/new">新建榜单</RouterLink>
    </PageHeader>

    <div class="stats-grid">
      <div class="stat">
        <span>人员</span>
        <strong>{{ peopleStore.people.length }}</strong>
      </div>
      <div class="stat">
        <span>标签</span>
        <strong>{{ tagsStore.tags.length }}</strong>
      </div>
      <div class="stat">
        <span>榜单</span>
        <strong>{{ leaderboardsStore.leaderboards.length }}</strong>
      </div>
    </div>

    <section class="panel">
      <div class="section-title">
        <h2>最近榜单</h2>
        <RouterLink to="/leaderboards">查看全部</RouterLink>
      </div>
      <p v-if="recentLeaderboards.length === 0" class="empty">还没有榜单。</p>
      <RouterLink
        v-for="leaderboard in recentLeaderboards"
        :key="leaderboard.id"
        class="list-row leaderboard-list-row"
        :to="`/leaderboards/${leaderboard.id}`"
        @click="openLeaderboardTab(leaderboard)"
      >
        <span class="list-title leaderboard-list-date">{{ leaderboardDisplayDate(leaderboard) }}</span>
        <span class="list-meta leaderboard-list-title">{{ leaderboardDisplayOptionalTitle(leaderboard) }}</span>
      </RouterLink>
    </section>
  </section>
</template>
