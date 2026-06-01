<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import ScoreInput from "@/components/ScoreInput.vue";
import {
  getLeaderboardCreationContext,
  leaderboardDisplayTitle
} from "@/repositories/leaderboardsRepository";
import { useLeaderboardsStore } from "@/stores/leaderboardsStore";
import { usePeopleStore } from "@/stores/peopleStore";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import type { Leaderboard, LeaderboardEntry, Person } from "@/types/models";
import { displayDate } from "@/utils/dates";
import { formatScore, movementText } from "@/utils/movement";
import { rankDraftItems, type RankedDraftItem } from "@/utils/ranking";

interface DraftRow {
  person: Person;
  score: number;
  previousEntry?: LeaderboardEntry;
}

interface SavedDraftRow {
  personId: string;
  score: number;
  included?: boolean;
}

interface SavedLeaderboardDraft {
  version: 1;
  title: string;
  boardDate: string;
  note: string;
  rows: SavedDraftRow[];
  savedAt: string;
}

const DRAFT_STORAGE_KEY = "fms2:create-leaderboard-draft";

const router = useRouter();
const peopleStore = usePeopleStore();
const leaderboardsStore = useLeaderboardsStore();
const workspaceTabs = useWorkspaceTabsStore();

const title = ref("");
const boardDate = ref(todayInputValue());
const note = ref("");
const draftRows = ref<DraftRow[]>([]);
const previousLeaderboard = ref<Leaderboard | null>(null);
const previousEntries = ref<LeaderboardEntry[]>([]);
const appearedPersonIds = ref<Set<string>>(new Set());
const loading = ref(false);
const saving = ref(false);
const saveError = ref("");
const draftMessage = ref("");
const draftSavedAt = ref<string | null>(null);
const initialized = ref(false);
let contextLoadVersion = 0;

const previewItems = computed(() =>
  rankDraftItems(
    draftRows.value.map((row) => ({
      person: row.person,
      score: normalizedScore(row.score),
      previousEntry: row.previousEntry,
      appearedBefore: appearedPersonIds.value.has(row.person.id)
    }))
  )
);
const previewByPersonId = computed(
  () => new Map(previewItems.value.map((item) => [item.person.id, item]))
);
const includedPersonIds = computed(
  () => new Set(previewItems.value.map((item) => item.person.id))
);
const outPreviewEntries = computed(() =>
  previousEntries.value.filter((entry) => !includedPersonIds.value.has(entry.personId))
);
const sortedDraftRows = computed(() => {
  const previewRankByPersonId = new Map(previewItems.value.map((item) => [item.person.id, item.rank]));
  return [...draftRows.value].sort((left, right) => {
    const leftRank = previewRankByPersonId.get(left.person.id);
    const rightRank = previewRankByPersonId.get(right.person.id);
    if (leftRank !== undefined || rightRank !== undefined) {
      return (leftRank ?? Number.POSITIVE_INFINITY) - (rightRank ?? Number.POSITIVE_INFINITY);
    }

    const leftWasOut = left.previousEntry ? 0 : 1;
    const rightWasOut = right.previousEntry ? 0 : 1;
    if (leftWasOut !== rightWasOut) {
      return leftWasOut - rightWasOut;
    }

    const previousRankDelta =
      (left.previousEntry?.rank ?? Number.POSITIVE_INFINITY) -
      (right.previousEntry?.rank ?? Number.POSITIVE_INFINITY);
    if (previousRankDelta !== 0) {
      return previousRankDelta;
    }

    return left.person.name.localeCompare(right.person.name, "zh-CN");
  });
});
const includedCount = computed(() => previewItems.value.length);
const invalidScoreRow = computed(() =>
  draftRows.value.find(
    (row) => !Number.isFinite(Number(row.score)) || Number(row.score) < 0
  )
);
const canSave = computed(
  () => !loading.value && !saving.value && !invalidScoreRow.value &&
    (includedCount.value > 0 || outPreviewEntries.value.length > 0)
);
const canSaveDraft = computed(() => !loading.value && draftRows.value.length > 0);
const draftStatusText = computed(() => {
  if (draftMessage.value) {
    return draftMessage.value;
  }

  return draftSavedAt.value ? `草稿已保存：${formatSavedAt(draftSavedAt.value)}` : "暂无已保存草稿";
});

async function loadDraft(): Promise<void> {
  loading.value = true;
  saveError.value = "";
  draftMessage.value = "";
  try {
    const savedDraft = readSavedDraft();
    await peopleStore.loadPeople({ includeArchived: false, query: "", tagIds: [], sort: "name" });

    if (savedDraft) {
      title.value = savedDraft.title;
      boardDate.value = savedDraft.boardDate;
      note.value = savedDraft.note;
      draftSavedAt.value = savedDraft.savedAt;
    }

    await refreshReferenceContext({
      applyTemplate: !savedDraft,
      savedRows: savedDraft?.rows
    });
    initialized.value = true;
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "加载新建榜单草稿失败。";
  } finally {
    loading.value = false;
  }
}

async function refreshReferenceContext(options: {
  applyTemplate?: boolean;
  savedRows?: SavedDraftRow[];
} = {}): Promise<void> {
  const currentVersion = ++contextLoadVersion;
  const context = await getLeaderboardCreationContext(boardDate.value || null);

  if (currentVersion !== contextLoadVersion) {
    return;
  }

  previousLeaderboard.value = context.previousLeaderboard;
  previousEntries.value = context.previousEntries;
  appearedPersonIds.value = new Set(context.appearedPersonIds);
  mergeDraftRows(options);
}

async function saveLeaderboard(): Promise<void> {
  if (!canSave.value) {
    return;
  }

  saving.value = true;
  saveError.value = "";
  try {
    const leaderboard = await leaderboardsStore.addLeaderboard({
      title: title.value,
      note: note.value,
      boardDate: boardDate.value || null,
      templateLeaderboardId: previousLeaderboard.value?.id ?? null,
      previousLeaderboardId: previousLeaderboard.value?.id ?? null,
      scores: draftRows.value
        .filter((row) => normalizedScore(row.score) > 0)
        .map((row) => ({
          personId: row.person.id,
          score: normalizedScore(row.score)
        }))
    });

    removeSavedDraft();
    workspaceTabs.openLeaderboardTab(
      leaderboard.id,
      leaderboardDisplayTitle(leaderboard),
      `/leaderboards/${leaderboard.id}`
    );
    await router.push(`/leaderboards/${leaderboard.id}`);
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "保存榜单失败。";
  } finally {
    saving.value = false;
  }
}

function saveDraft(): void {
  const savedAt = new Date().toISOString();
  const draft: SavedLeaderboardDraft = {
    version: 1,
    title: title.value,
    boardDate: boardDate.value,
    note: note.value,
    rows: draftRows.value.map((row) => ({
      personId: row.person.id,
      score: normalizedScore(row.score)
    })),
    savedAt
  };

  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  draftSavedAt.value = savedAt;
  draftMessage.value = `草稿已保存：${formatSavedAt(savedAt)}`;
}

function clearSavedDraft(): void {
  removeSavedDraft();
  draftMessage.value = "草稿已清除";
}

function applyPreviousTemplate(): void {
  mergeDraftRows({ applyTemplate: true });
}

function clearScores(): void {
  draftRows.value = draftRows.value.map((row) => ({
    ...row,
    score: 0
  }));
}

function mergeDraftRows(options: {
  applyTemplate?: boolean;
  savedRows?: SavedDraftRow[];
} = {}): void {
  const previousByPersonId = new Map(previousEntries.value.map((entry) => [entry.personId, entry]));
  const existingByPersonId = new Map(draftRows.value.map((row) => [row.person.id, row]));
  const savedByPersonId = new Map(options.savedRows?.map((row) => [row.personId, row]) ?? []);

  draftRows.value = peopleStore.people.map((person) => {
    const previousEntry = previousByPersonId.get(person.id);
    const existingRow = existingByPersonId.get(person.id);
    const savedRow = savedByPersonId.get(person.id);

    if (options.applyTemplate) {
      return {
        person,
        score: previousEntry?.scoreSnapshot ?? 0,
        previousEntry
      };
    }

    return {
      person,
      score: savedRow ? legacyAwareSavedScore(savedRow) : existingRow?.score ?? previousEntry?.scoreSnapshot ?? 0,
      previousEntry
    };
  });
}

function previewForPerson(personId: string): RankedDraftItem | undefined {
  return previewByPersonId.value.get(personId);
}

function previewText(personId: string): string {
  const item = previewForPerson(personId);
  if (item) {
    return `#${item.rank} ${movementText(item)}`;
  }

  return draftRows.value.find((row) => row.person.id === personId)?.previousEntry ? "OUT" : "-";
}

function normalizedScore(value: number): number {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 ? score : 0;
}

function readSavedDraft(): SavedLeaderboardDraft | null {
  const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!rawDraft) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as Partial<SavedLeaderboardDraft>;
    if (parsed.version !== 1 || !Array.isArray(parsed.rows)) {
      return null;
    }

    return {
      version: 1,
      title: parsed.title ?? "",
      boardDate: parsed.boardDate ?? todayInputValue(),
      note: parsed.note ?? "",
      rows: parsed.rows
        .filter((row): row is SavedDraftRow => typeof row?.personId === "string")
        .map((row) => ({
          personId: row.personId,
          score: legacyAwareSavedScore(row),
          included: row.included
        })),
      savedAt: parsed.savedAt ?? new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function legacyAwareSavedScore(row: SavedDraftRow): number {
  if (row.included === false) {
    return 0;
  }

  return normalizedScore(row.score);
}

function removeSavedDraft(): void {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  draftSavedAt.value = null;
}

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function todayInputValue(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

watch(boardDate, () => {
  if (!initialized.value) {
    return;
  }

  draftMessage.value = "";
  void refreshReferenceContext();
});

onMounted(() => {
  void loadDraft();
});
</script>

<template>
  <section class="page create-page">
    <PageHeader title="新建榜单" description="按日期选择参考榜单，编辑完成后生成排名变化和出榜记录。">
      <div class="actions-row">
        <button class="button" type="button" :disabled="!canSaveDraft" @click="saveDraft">
          保存草稿
        </button>
        <button class="button" type="button" :disabled="!draftSavedAt" @click="clearSavedDraft">
          清除草稿
        </button>
        <button class="button primary" type="button" :disabled="!canSave" @click="saveLeaderboard">
          {{ saving ? "保存中" : "保存榜单" }}
        </button>
      </div>
    </PageHeader>

    <div class="create-status-lines">
      <p v-if="saveError" class="error-list">{{ saveError }}</p>
      <p class="empty">{{ draftStatusText }}</p>
    </div>

    <div class="create-leaderboard-layout">
      <aside class="panel reference-board-panel">
        <div class="section-title">
          <h2>参考榜单</h2>
          <span class="list-meta">{{ previousEntries.length }} 人</span>
        </div>
        <dl class="detail-list compact-detail-list">
          <dt>日期</dt>
          <dd>{{ previousLeaderboard ? displayDate(previousLeaderboard.boardDate ?? previousLeaderboard.createdAt) : "-" }}</dd>
          <dt>标题</dt>
          <dd>{{ previousLeaderboard ? leaderboardDisplayTitle(previousLeaderboard) : "暂无参考榜单" }}</dd>
        </dl>
        <p v-if="loading" class="empty">正在加载参考榜单。</p>
        <p v-else-if="!previousLeaderboard" class="empty">所选日期前没有榜单。</p>
        <div v-else class="table-panel reference-board-table">
          <div class="table-row table-head">
            <span>名次</span>
            <span>姓名</span>
            <span>分数</span>
          </div>
          <div v-for="entry in previousEntries" :key="entry.id" class="table-row">
            <span>{{ entry.rank ?? "-" }}</span>
            <span class="table-link">{{ entry.personNameSnapshot }}</span>
            <span>{{ formatScore(entry.scoreSnapshot) }}</span>
          </div>
        </div>
      </aside>

      <main class="panel create-editor-panel">
        <div class="section-title">
          <h2>正在编辑</h2>
          <span class="list-meta">在榜 {{ includedCount }} / 出榜 {{ outPreviewEntries.length }}</span>
        </div>

        <div class="form-grid leaderboard-form-grid">
          <label>
            <span>标题</span>
            <input v-model="title" class="field" type="text" placeholder="可留空" />
          </label>
          <label>
            <span>日期</span>
            <input v-model="boardDate" class="field" type="date" />
          </label>
          <label class="wide-field">
            <span>备注</span>
            <textarea v-model="note" class="field text-field" />
          </label>
        </div>

        <div class="editor-section">
          <div class="section-title">
            <h2>榜单数据</h2>
            <div class="toolbar">
              <button class="button" type="button" :disabled="!previousLeaderboard" @click="applyPreviousTemplate">
                套用参考
              </button>
              <button class="button" type="button" :disabled="draftRows.length === 0" @click="clearScores">
                清空分数
              </button>
            </div>
          </div>

          <p v-if="loading" class="empty">正在加载草稿。</p>
          <p v-else-if="draftRows.length === 0" class="empty">先添加人员，再创建榜单。</p>
          <div v-else class="draft-score-table">
            <div class="draft-score-row table-head">
              <span>状态</span>
              <span>姓名</span>
              <span>参考</span>
              <span>分数</span>
            </div>
            <label v-for="row in sortedDraftRows" :key="row.person.id" class="draft-score-row">
              <span class="list-meta">{{ previewText(row.person.id) }}</span>
              <span>
                <span class="list-title">{{ row.person.name }}</span>
                <span v-if="row.person.note" class="list-meta">{{ row.person.note }}</span>
              </span>
              <span class="list-meta">
                <template v-if="row.previousEntry">
                  #{{ row.previousEntry.rank }} / {{ formatScore(row.previousEntry.scoreSnapshot) }}
                </template>
                <template v-else>-</template>
              </span>
              <ScoreInput v-model="row.score" :min="0" />
            </label>
          </div>
        </div>
      </main>
    </div>
  </section>
</template>
