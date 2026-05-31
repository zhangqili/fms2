<script setup lang="ts">
import { RouterLink } from "vue-router";

import type { Person } from "@/types/models";

defineProps<{
  person: Person;
  tagNames?: string[];
}>();
</script>

<template>
  <RouterLink class="list-row" :to="`/people/${person.id}`">
    <span>
      <span class="list-title">{{ person.name }}</span>
      <span v-if="person.archived" class="status-pill">已归档</span>
      <span v-if="tagNames?.length" class="inline-tags">
        <span v-for="tagName in tagNames" :key="tagName" class="mini-tag">{{ tagName }}</span>
      </span>
    </span>
    <span class="list-meta">{{ person.note || "暂无备注" }}</span>
  </RouterLink>
</template>
