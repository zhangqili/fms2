<script setup lang="ts">
import { Award, User, X } from "lucide-vue-next";
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useWorkspaceTabsStore, type WorkspaceTab } from "@/stores/workspaceTabsStore";

const route = useRoute();
const router = useRouter();
const workspaceTabs = useWorkspaceTabsStore();

const hasTabs = computed(() => workspaceTabs.tabs.length > 0);

function activate(tab: WorkspaceTab): void {
  workspaceTabs.activateTab(tab.id);
  if (route.fullPath !== tab.routePath) {
    void router.push(tab.routePath);
  }
}

function close(tab: WorkspaceTab): void {
  const wasActive = workspaceTabs.activeTabId === tab.id;
  const nextTab = workspaceTabs.closeTab(tab.id);

  if (!wasActive) {
    return;
  }

  if (nextTab) {
    void router.push(nextTab.routePath);
    return;
  }

  void router.push(tab.kind === "person" ? "/people" : "/leaderboards");
}
</script>

<template>
  <nav v-if="hasTabs" class="workspace-tabs" aria-label="已打开详情页">
    <div
      v-for="tab in workspaceTabs.tabs"
      :key="tab.id"
      class="workspace-tab"
      :class="{ active: workspaceTabs.activeTabId === tab.id }"
    >
      <button class="workspace-tab-main" type="button" @click="activate(tab)">
        <component :is="tab.kind === 'person' ? User : Award" :size="16" aria-hidden="true" />
        <span class="workspace-tab-label">{{ tab.title }}</span>
      </button>
      <button
        class="workspace-tab-close"
        type="button"
        :aria-label="`关闭 ${tab.title}`"
        @click="close(tab)"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>
