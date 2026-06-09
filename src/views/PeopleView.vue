<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import PeopleFilterGroupEditor from "@/components/PeopleFilterGroupEditor.vue";
import PersonListItem from "@/components/PersonListItem.vue";
import {
  listPersonOverallMetrics,
  type PersonOverallMetric
} from "@/repositories/leaderboardsRepository";
import {
  usePeopleStore,
  type PeopleArchiveFilter,
  type PeopleFilterCondition,
  type PeopleFilterGroup,
  type PeopleFilterNode,
  type PeopleMetricRangeKey,
  type PeopleSortDirection,
  type PeopleSortKey
} from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Person, Tag } from "@/types/models";

interface SortOption {
  value: PeopleSortKey;
  label: string;
}

interface SortDirectionOption {
  value: PeopleSortDirection;
  label: string;
}

const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const workspaceTabs = useWorkspaceTabsStore();
const newName = ref("");
const newNote = ref("");
const newPersonTagIds = ref<string[]>([]);
const overallMetrics = ref<PersonOverallMetric[]>([]);
const isAddPersonOpen = ref(false);
const isFilterPanelOpen = ref(false);

const sortOptions: SortOption[] = [
  { value: "overallRank", label: "总榜排名" },
  { value: "totalScore", label: "总点数" },
  { value: "weightedScore", label: "加权点数" },
  { value: "peakTierRank", label: "峰值排名" },
  { value: "highestScore", label: "峰值点数" },
  { value: "appearanceCount", label: "上榜次数" },
  { value: "name", label: "姓名" },
  { value: "createdAt", label: "创建时间" },
  { value: "updatedAt", label: "更新时间" }
];

const sortDirectionOptions: SortDirectionOption[] = [
  { value: "asc", label: "正序" },
  { value: "desc", label: "倒序" }
];

const overallMetricByPersonId = computed(
  () => new Map(overallMetrics.value.map((metric) => [metric.personId, metric]))
);

const totalPeopleCount = computed(() => peopleStore.people.length);
const activeFilterNodeCount = computed(() => countActiveFilterNodes(peopleStore.filterState.rootGroup));
const filteredPeople = computed(() =>
  peopleStore.people
    .filter(matchesPersonFilters)
    .sort(sortPeople)
);

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
  await Promise.all([loadPeopleForFilters(), loadOverallMetrics()]);
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

function toggleQuickTag(tagId: string): void {
  const quickTagIds = peopleStore.filterState.quickTagIds;
  peopleStore.filterState.quickTagIds = quickTagIds.includes(tagId)
    ? quickTagIds.filter((id) => id !== tagId)
    : [...quickTagIds, tagId];
}

function resetFilters(): void {
  peopleStore.resetPeopleFilters();
}

function openFilteredPeopleTabs(): void {
  for (const person of filteredPeople.value) {
    workspaceTabs.openPersonTab(person.id, person.name, `/people/${person.id}`);
  }
}

async function loadPeopleForFilters(): Promise<void> {
  await peopleStore.loadPeople({
    includeArchived: true,
    query: "",
    tagIds: [],
    sort: "name"
  });
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

function matchesPersonFilters(person: Person): boolean {
  return matchesQuickFilters(person) && matchesFilterGroup(person, peopleStore.filterState.rootGroup);
}

function matchesQuickFilters(person: Person): boolean {
  const query = peopleStore.filterState.quickQuery.trim().toLowerCase();
  if (query && !`${person.name} ${person.note}`.toLowerCase().includes(query)) {
    return false;
  }

  const quickTagIds = peopleStore.filterState.quickTagIds;
  if (quickTagIds.length === 0) {
    return true;
  }

  const personTagIds = new Set(peopleStore.tagIdsByPersonId[person.id] ?? []);
  return quickTagIds.every((tagId) => personTagIds.has(tagId));
}

function matchesFilterGroup(person: Person, group: PeopleFilterGroup): boolean {
  const activeItems = group.items.filter(isFilterNodeActive);
  if (activeItems.length === 0) {
    return true;
  }

  return group.operator === "and"
    ? activeItems.every((item) => matchesFilterNode(person, item))
    : activeItems.some((item) => matchesFilterNode(person, item));
}

function matchesFilterNode(person: Person, item: PeopleFilterNode): boolean {
  return item.kind === "group"
    ? matchesFilterGroup(person, item)
    : matchesCondition(person, item);
}

function matchesCondition(person: Person, condition: PeopleFilterCondition): boolean {
  if (condition.type === "query") {
    return matchesQueryCondition(person, condition);
  }

  if (condition.type === "archive") {
    return matchesArchiveCondition(person, condition.archiveMode);
  }

  if (condition.type === "hasTag" || condition.type === "notHasTag") {
    return matchesTagCondition(person, condition);
  }

  return matchesMetricCondition(person, condition);
}

function matchesQueryCondition(person: Person, condition: PeopleFilterCondition): boolean {
  const query = condition.query.trim().toLowerCase();
  if (!query) {
    return true;
  }

  return `${person.name} ${person.note}`.toLowerCase().includes(query);
}

function matchesArchiveCondition(person: Person, archiveMode: PeopleArchiveFilter): boolean {
  if (archiveMode === "all") {
    return true;
  }

  return archiveMode === "archived" ? person.archived : !person.archived;
}

function matchesTagCondition(person: Person, condition: PeopleFilterCondition): boolean {
  const personTagIds = new Set(peopleStore.tagIdsByPersonId[person.id] ?? []);
  const hasTag = personTagIds.has(condition.tagId);
  return condition.type === "hasTag" ? hasTag : !hasTag;
}

function matchesMetricCondition(person: Person, condition: PeopleFilterCondition): boolean {
  const value = metricRangeValue(person.id, condition.metricKey);
  if (value === null) {
    return false;
  }

  const min = parseRangeValue(condition.min);
  const max = parseRangeValue(condition.max);

  if (condition.metricOperator === "gte") {
    return min !== null && value >= min;
  }

  if (condition.metricOperator === "lte") {
    return max !== null && value <= max;
  }

  if (min === null && max === null) {
    return false;
  }

  if (min !== null && value < min) {
    return false;
  }

  return max === null || value <= max;
}

function isConditionActive(condition: PeopleFilterCondition): boolean {
  if (condition.type === "query") {
    return condition.query.trim().length > 0;
  }

  if (condition.type === "archive") {
    return condition.archiveMode !== "all";
  }

  if (condition.type === "hasTag" || condition.type === "notHasTag") {
    return condition.tagId.trim().length > 0;
  }

  if (condition.metricOperator === "gte") {
    return parseRangeValue(condition.min) !== null;
  }

  if (condition.metricOperator === "lte") {
    return parseRangeValue(condition.max) !== null;
  }

  return parseRangeValue(condition.min) !== null || parseRangeValue(condition.max) !== null;
}

function isFilterNodeActive(item: PeopleFilterNode): boolean {
  return item.kind === "group"
    ? item.items.some(isFilterNodeActive)
    : isConditionActive(item);
}

function countActiveFilterNodes(item: PeopleFilterNode): number {
  if (item.kind === "condition") {
    return isConditionActive(item) ? 1 : 0;
  }

  return item.items.reduce((sum, child) => sum + countActiveFilterNodes(child), 0);
}

function metricRangeValue(personId: string, key: PeopleMetricRangeKey): number | null {
  const metric = metricForPerson(personId);

  if (key === "appearanceCount") {
    return metric?.effectiveEntryCount ?? 0;
  }

  if (key === "totalScore") {
    return metric?.totalScore ?? 0;
  }

  if (key === "weightedScore") {
    return metric?.weightedScore ?? 0;
  }

  if (key === "highestScore") {
    return metric?.highestScore ?? 0;
  }

  if (key === "overallRank") {
    return metric?.overallRank ?? null;
  }

  return metric?.peakTierRank ?? null;
}

function sortPeople(left: Person, right: Person): number {
  const sortKey = peopleStore.filterState.sortKey;
  const directionMultiplier = peopleStore.filterState.sortDirection === "asc" ? 1 : -1;

  if (sortKey === "name") {
    return directionMultiplier * sortPeopleByName(left, right);
  }

  if (sortKey === "createdAt" || sortKey === "updatedAt") {
    return directionMultiplier * sortPeopleByDate(left, right, sortKey) || sortPeopleByName(left, right);
  }

  const leftMetric = metricForPerson(left.id);
  const rightMetric = metricForPerson(right.id);
  const leftHasMetric = (leftMetric?.effectiveEntryCount ?? 0) > 0;
  const rightHasMetric = (rightMetric?.effectiveEntryCount ?? 0) > 0;

  if (leftHasMetric !== rightHasMetric) {
    return leftHasMetric ? -1 : 1;
  }

  const delta = compareMetricSortValue(left.id, right.id, sortKey);
  if (delta !== 0) {
    return directionMultiplier * delta;
  }

  return compareByOverallRank(left, right) || sortPeopleByName(left, right);
}

function compareMetricSortValue(leftPersonId: string, rightPersonId: string, sortKey: PeopleSortKey): number {
  const leftValue = metricRangeValue(leftPersonId, sortKey as PeopleMetricRangeKey);
  const rightValue = metricRangeValue(rightPersonId, sortKey as PeopleMetricRangeKey);
  const leftSortValue = leftValue ?? Number.POSITIVE_INFINITY;
  const rightSortValue = rightValue ?? Number.POSITIVE_INFINITY;

  return leftSortValue === rightSortValue ? 0 : leftSortValue - rightSortValue;
}

function compareByOverallRank(left: Person, right: Person): number {
  const leftMetric = metricForPerson(left.id);
  const rightMetric = metricForPerson(right.id);
  const leftOverallRank = leftMetric?.overallRank ?? Number.POSITIVE_INFINITY;
  const rightOverallRank = rightMetric?.overallRank ?? Number.POSITIVE_INFINITY;

  if (leftOverallRank !== rightOverallRank) {
    return leftOverallRank - rightOverallRank;
  }

  const leftWeightedRank = leftMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
  const rightWeightedRank = rightMetric?.weightedRank ?? Number.POSITIVE_INFINITY;
  return leftWeightedRank - rightWeightedRank;
}

function sortPeopleByName(left: Person, right: Person): number {
  return left.name.localeCompare(right.name, "zh-CN");
}

function sortPeopleByDate(left: Person, right: Person, key: "createdAt" | "updatedAt"): number {
  return left[key].localeCompare(right[key]);
}

function parseRangeValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggleAddPersonPanel(): void {
  isAddPersonOpen.value = !isAddPersonOpen.value;
}

function toggleFilterPanel(): void {
  isFilterPanelOpen.value = !isFilterPanelOpen.value;
}

onMounted(async () => {
  await Promise.all([tagsStore.loadTags(), loadPeopleForFilters(), loadOverallMetrics()]);
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
      <input
        v-model="peopleStore.filterState.quickQuery"
        class="field people-search-field"
        placeholder="快速搜索姓名或备注"
      />
      <button
        class="button"
        :class="{ primary: isFilterPanelOpen }"
        type="button"
        @click="toggleFilterPanel"
      >
        {{ isFilterPanelOpen ? "收起筛选" : `筛选${activeFilterNodeCount ? ` (${activeFilterNodeCount})` : ""}` }}
      </button>
    </div>

    <div v-if="tagsStore.tags.length" class="quick-tag-bar">
      <button
        v-for="tag in tagsStore.tags"
        :key="tag.id"
        class="tag-chip"
        :class="{ selected: peopleStore.filterState.quickTagIds.includes(tag.id) }"
        type="button"
        @click="toggleQuickTag(tag.id)"
      >
        <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
        {{ tag.name }}
      </button>
    </div>

    <section v-if="isFilterPanelOpen" class="panel people-filter-panel">
      <div class="section-title">
        <h2>筛选与排序</h2>
        <button class="button" type="button" @click="resetFilters">重置筛选</button>
      </div>

      <div class="people-filter-grid">
        <label class="field-label">
          <span>排序</span>
          <select v-model="peopleStore.filterState.sortKey" class="field">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="field-label">
          <span>方向</span>
          <select v-model="peopleStore.filterState.sortDirection" class="field">
            <option v-for="option in sortDirectionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="people-filter-block">
        <div class="section-title compact-title">
          <h2>条件树</h2>
          <span class="list-meta">有效 {{ activeFilterNodeCount }}</span>
        </div>
        <PeopleFilterGroupEditor
          v-model="peopleStore.filterState.rootGroup"
          :tags="tagsStore.tags"
          is-root
        />
      </div>
    </section>

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
      <div class="section-title compact-title">
        <h2>人员列表</h2>
        <div class="actions-row">
          <span class="list-meta">显示 {{ filteredPeople.length }} / {{ totalPeopleCount }} 人</span>
          <button
            class="button"
            type="button"
            :disabled="filteredPeople.length === 0"
            @click="openFilteredPeopleTabs"
          >
            添加当前列表到标签页
          </button>
        </div>
      </div>
      <p v-if="peopleStore.loading" class="empty">正在加载人员...</p>
      <p v-else-if="totalPeopleCount === 0" class="empty">还没有人员。</p>
      <p v-else-if="filteredPeople.length === 0" class="empty">没有符合条件的人员。</p>
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
