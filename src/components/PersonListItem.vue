<script setup lang="ts">
import { RouterLink } from "vue-router";

import type { PersonOverallMetric } from "@/repositories/leaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Person, Tag } from "@/types/models";
import { formatScore } from "@/utils/movement";

const props = defineProps<{
  person: Person;
  metric?: PersonOverallMetric;
  tags?: Tag[];
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
      <span v-if="tags?.length" class="inline-tags">
        <span v-for="tag in tags" :key="tag.id" class="mini-tag">
          <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
          {{ tag.name }}
        </span>
      </span>
    </span>
    <span>{{ formatScore(metric?.totalScore ?? 0) }}</span>
    <span>{{ formatScore(metric?.weightedScore ?? 0) }}</span>
    <span>{{ metric?.overallRank ?? "-" }}</span>
    <span>{{ metric?.peakTierRank ?? "-" }}</span>
    <span>{{ formatScore(metric?.highestScore ?? 0) }}</span>
    <span class="list-meta">{{ person.note || "暂无备注" }}</span>
  </RouterLink>
</template>
