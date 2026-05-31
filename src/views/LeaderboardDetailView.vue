<script setup lang="ts">
import { onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import { getLeaderboard, listLeaderboardEntries } from "@/repositories/leaderboardsRepository";
import type { Leaderboard, LeaderboardEntry } from "@/types/models";

const props = defineProps<{
  id: string;
}>();

const leaderboard = ref<Leaderboard | null>(null);
const entries = ref<LeaderboardEntry[]>([]);

onMounted(async () => {
  leaderboard.value = (await getLeaderboard(props.id)) ?? null;
  entries.value = await listLeaderboardEntries(props.id);
});
</script>

<template>
  <section class="page">
    <PageHeader
      :title="leaderboard?.title || '未命名榜单'"
      description="详情页会展示名次、分数快照、上升下降、初次进榜、回榜和出榜。"
    />

    <section class="panel">
      <p v-if="entries.length === 0" class="empty">该榜单还没有条目。</p>
      <div v-else class="table-panel">
        <div class="table-row table-head">
          <span>名次</span>
          <span>姓名</span>
          <span>分数</span>
          <span>变化</span>
        </div>
        <div v-for="entry in entries" :key="entry.id" class="table-row">
          <span>{{ entry.rank ?? "出榜" }}</span>
          <span>{{ entry.personNameSnapshot }}</span>
          <span>{{ entry.scoreSnapshot ?? "-" }}</span>
          <span>{{ entry.movement }}</span>
        </div>
      </div>
    </section>
  </section>
</template>
