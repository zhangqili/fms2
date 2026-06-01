<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import PersonListItem from "@/components/PersonListItem.vue";
import {
  listPersonOverallMetrics,
  type PersonOverallMetric
} from "@/repositories/leaderboardsRepository";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import type { Person, Tag } from "@/types/models";

const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const newName = ref("");
const newNote = ref("");
const query = ref("");
const newPersonTagIds = ref<string[]>([]);
const overallMetrics = ref<PersonOverallMetric[]>([]);
const isAddPersonOpen = ref(false);

const overallMetricByPersonId = computed(
  () => new Map(overallMetrics.value.map((metric) => [metric.personId, metric]))
);

const filteredPeople = computed(() => [...peopleStore.people].sort(sortPeopleByOverallRank));

async function addPerson(): Promise<void> {
  const name = newName.value.trim();
  if (!name) {
    return;
  }

  await peopleStore.addPerson({
    name,
    note: newNote.value,
    tagIds: newPersonTagIds.value
  });
  await loadOverallMetrics();
  newName.value = "";
  newNote.value = "";
  newPersonTagIds.value = [];
  isAddPersonOpen.value = false;
}

function toggleNewPersonTag(tagId: string): void {
  newPersonTagIds.value = newPersonTagIds.value.includes(tagId)
    ? newPersonTagIds.value.filter((id) => id !== tagId)
    : [...newPersonTagIds.value, tagId];
}

async function refreshPeople(): Promise<void> {
  peopleStore.setQuery(query.value);
  await Promise.all([peopleStore.loadPeople(), loadOverallMetrics()]);
}

async function toggleFilterTag(tagId: string): Promise<void> {
  peopleStore.toggleSelectedTag(tagId);
  await Promise.all([peopleStore.loadPeople(), loadOverallMetrics()]);
}

async function loadOverallMetrics(): Promise<void> {
  overallMetrics.value = await listPersonOverallMetrics();
}

function tagsForPerson(personId: string): Tag[] {
  const tagIds = new Set(peopleStore.tagIdsByPersonId[personId] ?? []);
  return tagsStore.tags.filter((tag) => tagIds.has(tag.id));
}

function metricForPerson(personId: string): PersonOverallMetric | undefined {
  return overallMetricByPersonId.value.get(personId);
}

function sortPeopleByOverallRank(left: Person, right: Person): number {
  const leftMetric = overallMetricByPersonId.value.get(left.id);
  const rightMetric = overallMetricByPersonId.value.get(right.id);
  const leftOverallRank = leftMetric?.overallRank ?? Number.POSITIVE_INFINITY;
  const rightOverallRank = rightMetric?.overallRank ?? Number.POSITIVE_INFINITY;

  if (leftOverallRank !== rightOverallRank) {
    return leftOverallRank - rightOverallRank;
  }

  const leftWeightedRank = leftMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
  const rightWeightedRank = rightMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
  if (leftWeightedRank !== rightWeightedRank) {
    return leftWeightedRank - rightWeightedRank;
  }

  return left.name.localeCompare(right.name, "zh-CN");
}

function toggleAddPersonPanel(): void {
  isAddPersonOpen.value = !isAddPersonOpen.value;
}

onMounted(async () => {
  await Promise.all([tagsStore.loadTags(), peopleStore.loadPeople(), loadOverallMetrics()]);
});
</script>

<template>
  <section class="page">
    <PageHeader title="人员">
      <button class="button primary" type="button" @click="toggleAddPersonPanel">
        {{ isAddPersonOpen ? "收起新增" : "新增人员" }}
      </button>
    </PageHeader>

    <div class="toolbar">
      <input v-model="query" class="field" placeholder="搜索姓名或备注" @input="refreshPeople" />
      <label class="check-row">
        <input
          v-model="peopleStore.includeArchived"
          type="checkbox"
          @change="refreshPeople"
        />
        显示归档
      </label>
    </div>

    <div v-if="tagsStore.tags.length" class="tag-picker">
      <button
        v-for="tag in tagsStore.tags"
        :key="tag.id"
        class="tag-chip"
        :class="{ selected: peopleStore.selectedTagIds.includes(tag.id) }"
        type="button"
        @click="toggleFilterTag(tag.id)"
      >
        <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
        {{ tag.name }}
      </button>
    </div>

    <section v-if="isAddPersonOpen" class="panel add-person-panel">
      <div class="section-title">
        <h2>新增人员</h2>
        <button class="button" type="button" @click="toggleAddPersonPanel">收起</button>
      </div>
      <form class="inline-form" @submit.prevent="addPerson">
        <input v-model="newName" class="field" placeholder="新人员姓名" />
        <input v-model="newNote" class="field" placeholder="备注" />
        <button class="button primary" type="submit">添加人员</button>
      </form>
      <div v-if="tagsStore.tags.length" class="add-person-tags">
        <div class="section-title compact-title">
          <h2>标签</h2>
          <span class="list-meta">已选 {{ newPersonTagIds.length }}</span>
        </div>
        <div class="tag-picker compact scrollable-tag-picker">
          <button
            v-for="tag in tagsStore.tags"
            :key="tag.id"
            class="tag-chip"
            :class="{ selected: newPersonTagIds.includes(tag.id) }"
            type="button"
            @click="toggleNewPersonTag(tag.id)"
          >
            <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
            {{ tag.name }}
          </button>
        </div>
      </div>
    </section>

    <section class="panel">
      <p v-if="filteredPeople.length === 0" class="empty">还没有人员。</p>
      <div v-else class="people-table">
        <div class="person-table-row table-head">
          <span>姓名</span>
          <span>总点数</span>
          <span>加权点数</span>
          <span>总榜排名</span>
          <span>峰值排名</span>
          <span>峰值点数</span>
          <span>备注</span>
        </div>
        <PersonListItem
          v-for="person in filteredPeople"
          :key="person.id"
          :person="person"
          :metric="metricForPerson(person.id)"
          :tags="tagsForPerson(person.id)"
        />
      </div>
    </section>
  </section>
</template>
