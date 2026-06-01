<script setup lang="ts">
import { Award, ChevronLeft, ChevronRight, User, X } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useWorkspaceTabsStore, type WorkspaceTab } from "@/stores/workspaceTabsStore";

const route = useRoute();
const router = useRouter();
const workspaceTabs = useWorkspaceTabsStore();
const tabsTrack = ref<HTMLElement | null>(null);
const wheelSwitchThreshold = 50;
let wheelDeltaBuffer = 0;
let lastWheelAt = 0;

const hasTabs = computed(() => workspaceTabs.tabs.length > 0);

watch(
  () => [workspaceTabs.activeTabId, workspaceTabs.tabs.length],
  () => {
    void nextTick(scrollActiveTabIntoView);
  },
  { flush: "post" }
);

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

function closeByMiddleClick(event: MouseEvent, tab: WorkspaceTab): void {
  if (event.button !== 1) {
    return;
  }

  event.preventDefault();
  close(tab);
}

function scrollTabs(direction: "left" | "right"): void {
  tabsTrack.value?.scrollBy({
    left: direction === "left" ? -260 : 260,
    behavior: "smooth"
  });
}

function switchTabByWheel(event: WheelEvent): void {
  if (workspaceTabs.tabs.length < 2) {
    return;
  }

  const delta = normalizedWheelDelta(event);
  if (delta === 0) {
    return;
  }

  event.preventDefault();

  const now = performance.now();
  if (now - lastWheelAt > 400) {
    wheelDeltaBuffer = 0;
  }
  lastWheelAt = now;
  wheelDeltaBuffer += delta;

  if (Math.abs(wheelDeltaBuffer) < wheelSwitchThreshold) {
    return;
  }

  activateRelativeTab(wheelDeltaBuffer > 0 ? 1 : -1);
  wheelDeltaBuffer = 0;
}

function normalizedWheelDelta(event: WheelEvent): number {
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * 100;
  }
  return delta;
}

function activateRelativeTab(direction: 1 | -1): void {
  const tabs = workspaceTabs.tabs;
  const activeIndex = tabs.findIndex((tab) => tab.id === workspaceTabs.activeTabId);
  const baseIndex = activeIndex === -1 ? 0 : activeIndex;
  const nextIndex = (baseIndex + direction + tabs.length) % tabs.length;
  activate(tabs[nextIndex]);
}

function scrollActiveTabIntoView(): void {
  const activeTab = tabsTrack.value?.querySelector<HTMLElement>(".workspace-tab.active");
  activeTab?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "smooth"
  });
}
</script>

<template>
  <nav v-if="hasTabs" class="workspace-tabs" aria-label="已打开详情页" @wheel="switchTabByWheel">
    <button
      class="workspace-tabs-scroll"
      type="button"
      aria-label="向左滚动标签页"
      title="向左滚动标签页"
      @click="scrollTabs('left')"
    >
      <ChevronLeft :size="16" aria-hidden="true" />
    </button>
    <div ref="tabsTrack" class="workspace-tabs-track">
      <div
        v-for="tab in workspaceTabs.tabs"
        :key="tab.id"
        class="workspace-tab"
        :class="{ active: workspaceTabs.activeTabId === tab.id }"
        @auxclick="closeByMiddleClick($event, tab)"
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
    </div>
    <button
      class="workspace-tabs-scroll"
      type="button"
      aria-label="向右滚动标签页"
      title="向右滚动标签页"
      @click="scrollTabs('right')"
    >
      <ChevronRight :size="16" aria-hidden="true" />
    </button>
  </nav>
</template>
