<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";

import LeaderboardPreview from "@/components/LeaderboardPreview.vue";
import PageHeader from "@/components/PageHeader.vue";
import ScoreInput from "@/components/ScoreInput.vue";
import { usePeopleStore } from "@/stores/peopleStore";
import { rankDraftItems } from "@/utils/ranking";

const peopleStore = usePeopleStore();
const scores = reactive<Record<string, number>>({});

const previewItems = computed(() =>
  rankDraftItems(
    peopleStore.people.map((person) => ({
      person,
      score: scores[person.id] ?? 0,
      appearedBefore: false
    }))
  )
);

onMounted(async () => {
  await peopleStore.loadPeople({ includeArchived: false, query: "", tagIds: [], sort: "name" });
  for (const person of peopleStore.people) {
    scores[person.id] = scores[person.id] ?? 0;
  }
});
</script>

<template>
  <section class="page">
    <PageHeader title="新建榜单" description="后续会默认以上一期榜单为模板，当前先保留草稿编辑骨架。" />

    <section class="panel">
      <div class="section-title">
        <h2>分数草稿</h2>
        <button class="button primary" type="button" disabled>保存榜单</button>
      </div>

      <p v-if="peopleStore.people.length === 0" class="empty">先添加人员，再创建榜单。</p>
      <div v-for="person in peopleStore.people" :key="person.id" class="score-row">
        <span>{{ person.name }}</span>
        <ScoreInput v-model="scores[person.id]" :min="0" />
      </div>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>排名预览</h2>
      </div>
      <LeaderboardPreview :items="previewItems" />
    </section>
  </section>
</template>
