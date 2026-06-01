<script setup lang="ts">
import type { RankedDraftItem } from "@/utils/ranking";
import { formatScore, movementText } from "@/utils/movement";

defineProps<{
  items: RankedDraftItem[];
}>();
</script>

<template>
  <p v-if="items.length === 0" class="empty">暂无在榜人员。</p>
  <div v-else class="table-panel">
    <div class="table-row table-head">
      <span>名次</span>
      <span>姓名</span>
      <span>分数</span>
      <span>变化</span>
    </div>
    <div v-for="item in items" :key="item.person.id" class="table-row">
      <span>{{ item.rank }}</span>
      <span>{{ item.person.name }}</span>
      <span>{{ formatScore(item.score) }}</span>
      <span>{{ movementText(item) }}</span>
    </div>
  </div>
</template>
