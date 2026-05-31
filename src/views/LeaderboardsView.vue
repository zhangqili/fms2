<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import { leaderboardDisplayTitle } from "@/repositories/leaderboardsRepository";
import { useLeaderboardsStore } from "@/stores/leaderboardsStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Leaderboard } from "@/types/models";

const leaderboardsStore = useLeaderboardsStore();
const workspaceTabs = useWorkspaceTabsStore();

function openLeaderboardTab(leaderboard: Leaderboard): void {
  workspaceTabs.openLeaderboardTab(leaderboard.id, leaderboardDisplayTitle(leaderboard));
}

onMounted(() => {
  void leaderboardsStore.loadLeaderboards();
});
</script>

<template>
  <section class="page">
    <PageHeader title="榜单" description="每次榜单保存自己的分数快照和变动状态。">
      <RouterLink class="button primary" to="/leaderboards/new">新建榜单</RouterLink>
    </PageHeader>

    <section class="panel">
      <p v-if="leaderboardsStore.leaderboards.length === 0" class="empty">还没有榜单。</p>
      <RouterLink
        v-for="leaderboard in leaderboardsStore.leaderboards"
        :key="leaderboard.id"
        class="list-row"
        :to="`/leaderboards/${leaderboard.id}`"
        @click="openLeaderboardTab(leaderboard)"
      >
        <span class="list-title">{{ leaderboard.title || "未命名榜单" }}</span>
        <span class="list-meta">{{ leaderboard.boardDate || leaderboard.createdAt.slice(0, 10) }}</span>
      </RouterLink>
    </section>
  </section>
</template>
