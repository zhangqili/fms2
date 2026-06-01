<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  getPersonLeaderboardStats,
  leaderboardDisplayDate,
  leaderboardDisplayDateSource,
  leaderboardDisplayOptionalTitle,
  listPersonLeaderboardHistory,
  type PersonLeaderboardHistoryItem,
  type PersonLeaderboardStats
} from "@/repositories/leaderboardsRepository";
import { getPerson } from "@/repositories/peopleRepository";
import { usePeopleStore } from "@/stores/peopleStore";
import { useTagsStore } from "@/stores/tagsStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Person } from "@/types/models";
import { displayDate } from "@/utils/dates";
import { formatScore, movementText } from "@/utils/movement";

const props = defineProps<{
  id: string;
}>();

const router = useRouter();
const peopleStore = usePeopleStore();
const tagsStore = useTagsStore();
const workspaceTabs = useWorkspaceTabsStore();
const person = ref<Person | null>(null);
const history = ref<PersonLeaderboardHistoryItem[]>([]);
const stats = ref<PersonLeaderboardStats | null>(null);
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

function openLeaderboardTab(item: PersonLeaderboardHistoryItem): void {
  workspaceTabs.openLeaderboardTab(
    item.leaderboard.id,
    leaderboardDisplayDate(item.leaderboard)
  );
}

async function loadPersonDetail(personId: string): Promise<void> {
  const currentVersion = ++loadVersion;
  person.value = null;
  history.value = [];
  stats.value = null;
  isEditing.value = false;

  const [loadedPerson, tagIds] = await Promise.all([
    getPerson(personId),
    peopleStore.loadTagIdsForPerson(personId),
    tagsStore.loadTags()
  ]);
  const [nextHistory, nextStats] = loadedPerson
    ? await Promise.all([
        listPersonLeaderboardHistory(loadedPerson.id),
        getPersonLeaderboardStats(loadedPerson.id)
      ])
    : [[], null];

  if (currentVersion !== loadVersion) {
    return;
  }

  person.value = loadedPerson ?? null;
  if (loadedPerson) {
    fillForm(loadedPerson, tagIds);
    history.value = nextHistory;
    stats.value = nextStats;
    workspaceTabs.updateTabTitle("person", loadedPerson.id, loadedPerson.name);
  }
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
            <dd>{{ displayDate(stats?.firstAppearanceDate ?? null) }}</dd>
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
          </dl>
        </section>
      </aside>
    </div>
  </section>
</template>
