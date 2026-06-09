<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  getPersonLeaderboardStats,
  leaderboardDisplayDate,
  leaderboardDisplayDateSource,
  leaderboardDisplayOptionalTitle,
  listLeaderboardsByDateAsc,
  listPersonOverallRankHistory,
  listPersonLeaderboardHistory,
  type PersonLeaderboardHistoryItem,
  type PersonLeaderboardStats,
  type PersonOverallRankHistoryItem
} from "@/repositories/leaderboardsRepository";
import { getPerson } from "@/repositories/peopleRepository";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Leaderboard, Person } from "@/types/models";
import { displayDate } from "@/utils/dates";
import { formatScore, movementText } from "@/utils/movement";

const props = defineProps<{
  id: string;
}>();

interface TopNStats {
  count: number;
  maxConsecutive: number;
  lastLeaderboard: Leaderboard | null;
}

interface PersonTrendPoint {
  leaderboardId: string;
  dateLabel: string;
  score: number | null;
  rank: number | null;
  overallRank: number | null;
}

type PersonTrendMode = "score-rank" | "overall-rank";

const PersonTrendChart = defineAsyncComponent(() => import("@/components/PersonTrendChart.vue"));
const router = useRouter();
const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const workspaceTabs = useWorkspaceTabsStore();
const person = ref<Person | null>(null);
const history = ref<PersonLeaderboardHistoryItem[]>([]);
const allLeaderboards = ref<Leaderboard[]>([]);
const overallRankHistory = ref<PersonOverallRankHistoryItem[]>([]);
const stats = ref<PersonLeaderboardStats | null>(null);
const topNLimit = ref<number | string>(3);
const trendMode = ref<PersonTrendMode>("score-rank");
const selectedTagIds = ref<string[]>([]);
const isEditing = ref(false);
const form = reactive({
  name: "",
  note: "",
  archived: false
});
let loadVersion = 0;

const canSave = computed(() => form.name.trim().length > 0);
const selectedTags = computed(() =>
  tagsStore.tags.filter((tag) => selectedTagIds.value.includes(tag.id))
);
const normalizedTopNLimit = computed(() => {
  const text = String(topNLimit.value).trim();
  if (!text) {
    return 3;
  }

  const value = Number(text);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 3;
});
const effectiveHistory = computed(() => history.value.filter(isEffectiveHistoryItem));
const firstAppearanceItem = computed(() =>
  [...effectiveHistory.value].sort((left, right) =>
    compareLeaderboardsByDateAsc(left.leaderboard, right.leaderboard)
  )[0] ?? null
);
const effectiveHistoryByLeaderboardId = computed(
  () => new Map(effectiveHistory.value.map((item) => [item.leaderboard.id, item]))
);
const leaderboardOrderById = computed(
  () => new Map(allLeaderboards.value.map((leaderboard, index) => [leaderboard.id, index]))
);
const overallRankByLeaderboardId = computed(
  () => new Map(overallRankHistory.value.map((item) => [item.leaderboardId, item.overallRank]))
);
const topNStats = computed<TopNStats>(() => {
  const limit = normalizedTopNLimit.value;
  let count = 0;
  let currentConsecutive = 0;
  let maxConsecutive = 0;
  let lastLeaderboard: Leaderboard | null = null;

  for (const leaderboard of allLeaderboards.value) {
    const item = effectiveHistoryByLeaderboardId.value.get(leaderboard.id);
    const isTopN = item?.entry.rank !== null && (item?.entry.rank ?? Number.POSITIVE_INFINITY) <= limit;

    if (!isTopN) {
      currentConsecutive = 0;
      continue;
    }

    count += 1;
    currentConsecutive += 1;
    maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    lastLeaderboard = leaderboard;
  }

  return {
    count,
    maxConsecutive,
    lastLeaderboard
  };
});
const trendPoints = computed<PersonTrendPoint[]>(() =>
  allLeaderboards.value.map((leaderboard) => {
    const item = effectiveHistoryByLeaderboardId.value.get(leaderboard.id);

    return {
      leaderboardId: leaderboard.id,
      dateLabel: displayDate(leaderboardDisplayDateSource(leaderboard)),
      score: item?.entry.scoreSnapshot ?? null,
      rank: item?.entry.rank ?? null,
      overallRank: overallRankByLeaderboardId.value.get(leaderboard.id) ?? null
    };
  })
);

function fillForm(nextPerson: Person, tagIds: string[]): void {
  form.name = nextPerson.name;
  form.note = nextPerson.note;
  form.archived = nextPerson.archived;
  selectedTagIds.value = tagIds;
}

function toggleTag(tagId: string): void {
  if (!isEditing.value) {
    return;
  }

  selectedTagIds.value = selectedTagIds.value.includes(tagId)
    ? selectedTagIds.value.filter((id) => id !== tagId)
    : [...selectedTagIds.value, tagId];
}

function startEdit(): void {
  if (!person.value) {
    return;
  }

  isEditing.value = true;
}

function cancelEdit(): void {
  if (!person.value) {
    return;
  }

  fillForm(person.value, peopleStore.tagIdsByPersonId[person.value.id] ?? selectedTagIds.value);
  isEditing.value = false;
}

async function save(): Promise<void> {
  if (!person.value || !isEditing.value || !canSave.value) {
    return;
  }

  await peopleStore.savePerson(person.value.id, {
    name: form.name,
    note: form.note,
    archived: form.archived,
    tagIds: selectedTagIds.value
  });
  const updated = await getPerson(person.value.id);
  if (updated) {
    person.value = updated;
    fillForm(updated, selectedTagIds.value);
    workspaceTabs.updateTabTitle("person", updated.id, updated.name);
    isEditing.value = false;
  }
}

async function remove(): Promise<void> {
  if (!person.value || !isEditing.value) {
    return;
  }

  const confirmed = window.confirm("删除人员会移除其标签绑定，但不会改写历史榜单快照。确定删除吗？");
  if (!confirmed) {
    return;
  }

  await peopleStore.removePerson(person.value.id);
  workspaceTabs.removeEntityTab("person", person.value.id);
  await router.push("/people");
}

function openLeaderboard(leaderboard: Leaderboard): void {
  workspaceTabs.openLeaderboardTab(
    leaderboard.id,
    leaderboardDisplayDate(leaderboard),
    `/leaderboards/${leaderboard.id}`
  );
}

function openLeaderboardTab(item: PersonLeaderboardHistoryItem): void {
  openLeaderboard(item.leaderboard);
}

async function openTrendLeaderboard(leaderboardId: string): Promise<void> {
  const leaderboard = allLeaderboards.value.find((item) => item.id === leaderboardId);
  if (!leaderboard) {
    return;
  }

  openLeaderboard(leaderboard);
  await router.push(`/leaderboards/${leaderboard.id}`);
}

async function loadPersonDetail(personId: string): Promise<void> {
  const currentVersion = ++loadVersion;
  person.value = null;
  history.value = [];
  allLeaderboards.value = [];
  overallRankHistory.value = [];
  stats.value = null;
  isEditing.value = false;

  const [loadedPerson, tagIds] = await Promise.all([
    getPerson(personId),
    peopleStore.loadTagIdsForPerson(personId),
    tagsStore.loadTags()
  ]);
  let nextHistory: PersonLeaderboardHistoryItem[] = [];
  let nextStats: PersonLeaderboardStats | null = null;
  let nextLeaderboards: Leaderboard[] = [];
  let nextOverallRankHistory: PersonOverallRankHistoryItem[] = [];

  if (loadedPerson) {
    [nextHistory, nextStats, nextLeaderboards, nextOverallRankHistory] = await Promise.all([
      listPersonLeaderboardHistory(loadedPerson.id),
      getPersonLeaderboardStats(loadedPerson.id),
      listLeaderboardsByDateAsc(),
      listPersonOverallRankHistory(loadedPerson.id)
    ]);
  }

  if (currentVersion !== loadVersion) {
    return;
  }

  person.value = loadedPerson ?? null;
  if (loadedPerson) {
    fillForm(loadedPerson, tagIds);
    history.value = nextHistory;
    allLeaderboards.value = nextLeaderboards;
    overallRankHistory.value = nextOverallRankHistory;
    stats.value = nextStats;
    workspaceTabs.updateTabTitle("person", loadedPerson.id, loadedPerson.name);
  }
}

function isEffectiveHistoryItem(item: PersonLeaderboardHistoryItem): boolean {
  return item.entry.includedInRanking && item.entry.rank !== null && (item.entry.scoreSnapshot ?? 0) > 0;
}

function compareLeaderboardsByDateAsc(left: Leaderboard, right: Leaderboard): number {
  const leftOrder = leaderboardOrderById.value.get(left.id) ?? Number.POSITIVE_INFINITY;
  const rightOrder = leaderboardOrderById.value.get(right.id) ?? Number.POSITIVE_INFINITY;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const timeDelta = leaderboardTime(left) - leaderboardTime(right);
  return timeDelta !== 0 ? timeDelta : left.createdAt.localeCompare(right.createdAt);
}

function leaderboardTime(leaderboard: Leaderboard): number {
  const source = leaderboardDisplayDateSource(leaderboard);
  const time = source ? Date.parse(source) : 0;
  return Number.isFinite(time) ? time : 0;
}

watch(
  () => props.id,
  (personId) => {
    void loadPersonDetail(personId);
  },
  { immediate: true }
);
</script>

<template>
  <section class="page detail-page">
    <PageHeader :title="person?.name ?? '人员详情'" />

    <section v-if="!person" class="panel">
      <p class="empty">未找到该人员。</p>
    </section>

    <div v-else class="detail-layout">
      <main class="detail-main">
        <section class="panel">
          <div class="section-title">
            <h2>趋势</h2>
            <div class="chart-mode-toggle" role="tablist" aria-label="趋势图类型">
              <button
                class="chart-mode-button"
                :class="{ selected: trendMode === 'score-rank' }"
                type="button"
                role="tab"
                :aria-selected="trendMode === 'score-rank'"
                @click="trendMode = 'score-rank'"
              >
                分数/排名
              </button>
              <button
                class="chart-mode-button"
                :class="{ selected: trendMode === 'overall-rank' }"
                type="button"
                role="tab"
                :aria-selected="trendMode === 'overall-rank'"
                @click="trendMode = 'overall-rank'"
              >
                总榜排名
              </button>
            </div>
          </div>
          <PersonTrendChart :mode="trendMode" :points="trendPoints" @select="openTrendLeaderboard" />
        </section>

        <section class="panel">
          <div class="section-title">
            <h2>历史榜单</h2>
          </div>
          <p v-if="history.length === 0" class="empty">暂无历史榜单记录。</p>
          <div v-else class="table-panel history-table">
            <div class="table-row table-head">
              <span>日期</span>
              <span>榜单</span>
              <span>分数</span>
              <span>排名</span>
              <span>变化</span>
            </div>
            <RouterLink
              v-for="item in history"
              :key="item.entry.id"
              class="table-row"
              :to="`/leaderboards/${item.leaderboard.id}`"
              @click="openLeaderboardTab(item)"
            >
              <span>{{ displayDate(leaderboardDisplayDateSource(item.leaderboard)) }}</span>
              <span class="table-link">
                {{ leaderboardDisplayOptionalTitle(item.leaderboard) }}
              </span>
              <span>{{ formatScore(item.entry.scoreSnapshot) }}</span>
              <span>{{ item.entry.rank ?? "出榜" }}</span>
              <span>{{ movementText(item.entry) }}</span>
            </RouterLink>
          </div>
        </section>
      </main>

      <aside class="detail-side">
        <section class="panel">
          <div class="section-title">
            <h2>资料</h2>
            <button v-if="!isEditing" class="button" type="button" @click="startEdit">编辑</button>
          </div>

          <div v-if="!isEditing" class="profile-readonly">
            <dl class="detail-list">
              <dt>姓名</dt>
              <dd>{{ person.name }}</dd>
              <dt>备注</dt>
              <dd>{{ person.note || "-" }}</dd>
              <dt>状态</dt>
              <dd>{{ person.archived ? "已归档" : "正常" }}</dd>
              <dt>标签</dt>
              <dd>
                <span v-if="selectedTags.length === 0">-</span>
                <span v-else class="inline-tags readonly-tags">
                  <span v-for="tag in selectedTags" :key="tag.id" class="mini-tag">
                    <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
                    {{ tag.name }}
                  </span>
                </span>
              </dd>
            </dl>
          </div>

          <form v-else class="form-grid" @submit.prevent="save">
            <label>
              <span>姓名</span>
              <input v-model="form.name" class="field" />
            </label>
            <label>
              <span>备注</span>
              <textarea v-model="form.note" class="field text-field" />
            </label>
            <label class="check-row">
              <input v-model="form.archived" type="checkbox" />
              已归档
            </label>

            <div>
              <span class="field-label">标签</span>
              <div class="tag-picker">
                <button
                  v-for="tag in tagsStore.tags"
                  :key="tag.id"
                  class="tag-chip"
                  :class="{ selected: selectedTagIds.includes(tag.id) }"
                  type="button"
                  @click="toggleTag(tag.id)"
                >
                  <span class="tag-dot" :style="{ backgroundColor: tag.color }" />
                  {{ tag.name }}
                </button>
              </div>
            </div>

            <div class="actions-row">
              <button class="button primary" type="submit" :disabled="!canSave">保存</button>
              <button class="button" type="button" @click="cancelEdit">取消</button>
              <button class="button danger" type="button" @click="remove">删除</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h2>统计</h2>
          </div>
          <dl class="detail-list">
            <dt>上榜次数</dt>
            <dd>{{ stats?.appearanceCount ?? 0 }}</dd>
            <dt>总分</dt>
            <dd>{{ formatScore(stats?.totalScore ?? 0) }}</dd>
            <dt>加权点数</dt>
            <dd>{{ formatScore(stats?.weightedScore ?? 0) }}</dd>
            <dt>首次上榜日期</dt>
            <dd>
              <RouterLink
                v-if="firstAppearanceItem"
                class="table-link"
                :to="`/leaderboards/${firstAppearanceItem.leaderboard.id}`"
                @click="openLeaderboard(firstAppearanceItem.leaderboard)"
              >
                {{ displayDate(leaderboardDisplayDateSource(firstAppearanceItem.leaderboard)) }}
              </RouterLink>
              <span v-else>-</span>
            </dd>
            <dt>最高排名</dt>
            <dd>{{ stats?.peakRank ?? "-" }}</dd>
            <dt>最高排名对应分数</dt>
            <dd>{{ formatScore(stats?.peakRankScore ?? null) }}</dd>
            <dt>最高分</dt>
            <dd>{{ formatScore(stats?.highestScore ?? null) }}</dd>
            <dt>加权排名</dt>
            <dd>{{ stats?.weightedRank ?? "-" }}</dd>
            <dt>峰值排名</dt>
            <dd>{{ stats?.peakTierRank ?? "-" }}</dd>
            <dt>总榜排名</dt>
            <dd>{{ stats?.overallRank ?? "-" }}</dd>
            <dt>前 N 名</dt>
            <dd>
              <input
                v-model="topNLimit"
                class="field top-n-field"
                type="number"
                min="1"
                step="1"
                inputmode="numeric"
                aria-label="前 N 名数量"
              />
            </dd>
            <dt>前 {{ normalizedTopNLimit }} 名次数</dt>
            <dd>{{ topNStats.count }}</dd>
            <dt>最大连续前 {{ normalizedTopNLimit }} 名数量</dt>
            <dd>{{ topNStats.maxConsecutive }}</dd>
            <dt>上次位于前 {{ normalizedTopNLimit }} 名日期</dt>
            <dd>
              <RouterLink
                v-if="topNStats.lastLeaderboard"
                class="table-link"
                :to="`/leaderboards/${topNStats.lastLeaderboard.id}`"
                @click="openLeaderboard(topNStats.lastLeaderboard)"
              >
                {{ displayDate(leaderboardDisplayDateSource(topNStats.lastLeaderboard)) }}
              </RouterLink>
              <span v-else>-</span>
            </dd>
          </dl>
        </section>
      </aside>
    </div>
  </section>
</template>
