<script setup lang="ts">
import { RouterLink } from "vue-router";

import type { PersonOverallMetric } from "@/repositories/leaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Person } from "@/types/models";
import { formatScore } from "@/utils/movement";

const props = defineProps<{
  person: Person;
  metric?: PersonOverallMetric;
  tagNames?: string[];
}>();

const workspaceTabs = useWorkspaceTabsStore();

function openPersonTab(): void {
  workspaceTabs.openPersonTab(props.person.id, props.person.name);
}
</script>

<template>
  <RouterLink class="person-table-row" :to="`/people/${person.id}`" @click="openPersonTab">
    <span>
      <span class="list-title">{{ person.name }}</span>
      <span v-if="person.archived" class="status-pill">已归档</span>
      <span v-if="tagNames?.length" class="inline-tags">
        <span v-for="tagName in tagNames" :key="tagName" class="mini-tag">{{ tagName }}</span>
      </span>
    </span>
    <span>{{ formatScore(metric?.totalScore ?? 0) }}</span>
    <span>{{ formatScore(metric?.weightedScore ?? 0) }}</span>
    <span class="list-meta">{{ person.note || "暂无备注" }}</span>
  </RouterLink>
</template>
