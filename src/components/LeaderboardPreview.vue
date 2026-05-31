<script setup lang="ts">
import type { RankedDraftItem } from "@/utils/ranking";

defineProps<{
  items: RankedDraftItem[];
}>();
</script>

<template>
  <div class="table-panel">
    <div class="table-row table-head">
      <span>名次</span>
      <span>姓名</span>
      <span>分数</span>
      <span>变化</span>
    </div>
    <div v-for="item in items" :key="item.person.id" class="table-row">
      <span>{{ item.rank }}</span>
      <span>{{ item.person.name }}</span>
      <span>{{ item.score }}</span>
      <span>{{ item.movement }}</span>
    </div>
  </div>
</template>
