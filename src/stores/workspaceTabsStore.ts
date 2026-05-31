import { defineStore } from "pinia";
import { computed, ref } from "vue";

export type WorkspaceTabKind = "person" | "leaderboard";

export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  entityId: string;
  title: string;
  routePath: string;
  openedAt: string;
  updatedAt: string;
}

interface OpenTabInput {
  kind: WorkspaceTabKind;
  entityId: string;
  title?: string;
  routePath?: string;
}

export const useWorkspaceTabsStore = defineStore("workspace-tabs", () => {
  const tabs = ref<WorkspaceTab[]>([]);
  const activeTabId = ref<string | null>(null);

  const activeTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null
  );

  function openPersonTab(personId: string, title?: string, routePath?: string): string {
    return openTab({ kind: "person", entityId: personId, title, routePath });
  }

  function openLeaderboardTab(
    leaderboardId: string,
    title?: string,
    routePath?: string
  ): string {
    return openTab({ kind: "leaderboard", entityId: leaderboardId, title, routePath });
  }

  function openTab(input: OpenTabInput): string {
    const id = tabId(input.kind, input.entityId);
    const now = new Date().toISOString();
    const existing = tabs.value.find((tab) => tab.id === id);

    if (existing) {
      existing.routePath = input.routePath ?? existing.routePath;
      existing.updatedAt = now;
      if (input.title?.trim()) {
        existing.title = input.title.trim();
      }
      activeTabId.value = existing.id;
      return existing.id;
    }

    tabs.value.push({
      id,
      kind: input.kind,
      entityId: input.entityId,
      title: input.title?.trim() || fallbackTitle(input.kind),
      routePath: input.routePath ?? defaultRoutePath(input.kind, input.entityId),
      openedAt: now,
      updatedAt: now
    });
    activeTabId.value = id;
    return id;
  }

  function activateTab(tabIdToActivate: string): WorkspaceTab | null {
    const tab = tabs.value.find((item) => item.id === tabIdToActivate) ?? null;
    activeTabId.value = tab?.id ?? null;
    return tab;
  }

  function updateTabTitle(kind: WorkspaceTabKind, entityId: string, title: string): void {
    const tab = tabs.value.find((item) => item.id === tabId(kind, entityId));
    const nextTitle = title.trim();
    if (tab && nextTitle) {
      tab.title = nextTitle;
      tab.updatedAt = new Date().toISOString();
    }
  }

  function closeTab(tabIdToClose: string): WorkspaceTab | null {
    const index = tabs.value.findIndex((tab) => tab.id === tabIdToClose);
    if (index === -1) {
      return activeTab.value;
    }

    const wasActive = activeTabId.value === tabIdToClose;
    tabs.value.splice(index, 1);

    if (!wasActive) {
      return activeTab.value;
    }

    const nextTab = tabs.value[index] ?? tabs.value[index - 1] ?? null;
    activeTabId.value = nextTab?.id ?? null;
    return nextTab;
  }

  function removeEntityTab(kind: WorkspaceTabKind, entityId: string): WorkspaceTab | null {
    return closeTab(tabId(kind, entityId));
  }

  function clearActiveTab(): void {
    activeTabId.value = null;
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    openPersonTab,
    openLeaderboardTab,
    activateTab,
    updateTabTitle,
    closeTab,
    removeEntityTab,
    clearActiveTab
  };
});

export function tabId(kind: WorkspaceTabKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

function fallbackTitle(kind: WorkspaceTabKind): string {
  return kind === "person" ? "人员详情" : "榜单详情";
}

function defaultRoutePath(kind: WorkspaceTabKind, entityId: string): string {
  return kind === "person" ? `/people/${entityId}` : `/leaderboards/${entityId}`;
}
