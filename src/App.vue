<script setup lang="ts">
import { Award, Download, Home, Settings, Tags, Users } from "lucide-vue-next";
import { watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";

import PwaStatus from "@/components/PwaStatus.vue";
import WorkspaceTabs from "@/components/WorkspaceTabs.vue";
import {
  getLeaderboard,
  leaderboardDisplayTitle
} from "@/repositories/leaderboardsRepository";
import { getPerson } from "@/repositories/peopleRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";

const navItems = [
  { to: "/", label: "首页", icon: Home },
  { to: "/people", label: "人员", icon: Users },
  { to: "/tags", label: "标签", icon: Tags },
  { to: "/leaderboards", label: "榜单", icon: Award },
  { to: "/exports", label: "导出", icon: Download },
  { to: "/settings", label: "设置", icon: Settings }
];

const route = useRoute();
const workspaceTabs = useWorkspaceTabsStore();
let syncVersion = 0;

watch(
  () => route.fullPath,
  () => {
    void syncWorkspaceTabFromRoute();
  },
  { immediate: true }
);

async function syncWorkspaceTabFromRoute(): Promise<void> {
  const currentVersion = ++syncVersion;
  const entityId = routeParamId();

  if (route.name === "person-detail" && entityId) {
    workspaceTabs.openPersonTab(entityId, undefined, route.fullPath);
    const person = await getPerson(entityId);
    if (currentVersion === syncVersion && person) {
      workspaceTabs.updateTabTitle("person", entityId, person.name);
    }
    return;
  }

  if (route.name === "leaderboard-detail" && entityId) {
    workspaceTabs.openLeaderboardTab(entityId, undefined, route.fullPath);
    const leaderboard = await getLeaderboard(entityId);
    if (currentVersion === syncVersion && leaderboard) {
      workspaceTabs.updateTabTitle("leaderboard", entityId, leaderboardDisplayTitle(leaderboard));
    }
    return;
  }

  workspaceTabs.clearActiveTab();
}

function routeParamId(): string | null {
  const id = route.params.id;
  if (Array.isArray(id)) {
    return id[0] ?? null;
  }
  return typeof id === "string" ? id : null;
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="brand">
        <div class="brand-mark">F2</div>
        <div>
          <p class="brand-title">FMS2</p>
          <p class="brand-subtitle">离线榜单</p>
        </div>
      </div>

      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="main-panel">
      <WorkspaceTabs />
      <RouterView />
    </main>

    <PwaStatus />
  </div>
</template>
