<script setup lang="ts">
import { ArrowDown, ArrowUp, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  getAnnualLeaderboard,
  listAnnualYears,
  saveAnnualRepresentatives,
  type AnnualLeaderboardData,
  type AnnualLeaderboardRow
} from "@/repositories/annualLeaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import {
  annualLeaderboardPath,
  MAX_ANNUAL_REPRESENTATIVES,
  parseAnnualLeaderboardYear,
  validateAnnualRepresentativeIds
} from "@/utils/annualLeaderboards";

const route = useRoute();
const router = useRouter();
const workspaceTabs = useWorkspaceTabsStore();
const years = ref<number[]>([]);
const selectedYear = computed(() => parseAnnualLeaderboardYear(route.params.year));
const annualData = ref<AnnualLeaderboardData | null>(null);
const loading = ref(true);
const loadError = ref("");
const editingRepresentatives = ref(false);
const representativeQuery = ref("");
const draftRepresentativeIds = ref<string[]>([]);
const saving = ref(false);
const saveError = ref("");
const statusMessage = ref("");
const scoreFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const representativeColorClasses = ["representative-purple", "representative-red", "representative-orange"];
let loadVersion = 0;
let yearsLoaded = false;

const representatives = computed(() => orderedRepresentativeRows(annualData.value?.representativePersonIds ?? []));
const draftRepresentatives = computed(() => orderedRepresentativeRows(draftRepresentativeIds.value));
const representativeClasses = computed(() => new Map(
  representatives.value.map((person, index) => [person.personId, representativeColorClasses[index]])
));
const representativeCandidates = computed(() => {
  const query = representativeQuery.value.trim().toLocaleLowerCase("zh-CN");
  return (annualData.value?.rows ?? []).filter((row) =>
    row.personName.toLocaleLowerCase("zh-CN").includes(query)
  );
});

function orderedRepresentativeRows(personIds: string[]): AnnualLeaderboardRow[] {
  const rowsById = new Map((annualData.value?.rows ?? []).map((row) => [row.personId, row]));
  return personIds.flatMap((personId) => {
    const row = rowsById.get(personId);
    return row ? [row] : [];
  });
}

async function loadData(refreshYears = false): Promise<void> {
  const currentVersion = ++loadVersion;
  const yearParam = route.params.year;
  loading.value = true;
  loadError.value = "";
  annualData.value = null;
  saving.value = false;
  cancelEditing();
  statusMessage.value = "";

  try {
    if (refreshYears || !yearsLoaded) {
      const nextYears = await listAnnualYears();
      if (currentVersion !== loadVersion) {
        return;
      }
      years.value = nextYears;
      yearsLoaded = true;
    }

    if (yearParam === undefined) {
      if (years.value.length > 0) {
        await router.replace(annualLeaderboardPath(years.value[0]));
      }
      return;
    }

    const year = parseAnnualLeaderboardYear(yearParam);
    if (year === null || !years.value.includes(year)) {
      loadError.value = year === null
        ? "年份无效，请从年份列表中选择。"
        : `${year} 年暂无榜单，请从年份列表中选择其他年份。`;
      workspaceTabs.clearActiveTab();
      return;
    }

    const nextData = await getAnnualLeaderboard(year);
    if (currentVersion === loadVersion) {
      annualData.value = nextData;
      workspaceTabs.openAnnualLeaderboardTab(year);
    }
  } catch (error) {
    if (currentVersion === loadVersion) {
      loadError.value = error instanceof Error ? error.message : "年榜加载失败，请重试。";
    }
  } finally {
    if (currentVersion === loadVersion) {
      loading.value = false;
    }
  }
}

function selectYear(year: number): void {
  if (!saving.value) {
    void router.push(annualLeaderboardPath(year));
  }
}

function startEditing(): void {
  draftRepresentativeIds.value = [...(annualData.value?.representativePersonIds ?? [])];
  representativeQuery.value = "";
  saveError.value = "";
  statusMessage.value = "";
  editingRepresentatives.value = true;
}

function cancelEditing(): void {
  editingRepresentatives.value = false;
  draftRepresentativeIds.value = [];
  representativeQuery.value = "";
  saveError.value = "";
}

function removeDraftRepresentative(personId: string): void {
  if (saving.value) {
    return;
  }
  draftRepresentativeIds.value = draftRepresentativeIds.value.filter((id) => id !== personId);
  saveError.value = "";
}

function toggleDraftRepresentative(personId: string): void {
  if (saving.value) {
    return;
  }
  if (draftRepresentativeIds.value.includes(personId)) {
    removeDraftRepresentative(personId);
    return;
  }
  if (draftRepresentativeIds.value.length >= MAX_ANNUAL_REPRESENTATIVES) {
    saveError.value = `代表人物最多选择 ${MAX_ANNUAL_REPRESENTATIVES} 人。`;
    return;
  }
  if (annualData.value?.rows.some((row) => row.personId === personId)) {
    draftRepresentativeIds.value = [...draftRepresentativeIds.value, personId];
    saveError.value = "";
  }
}

function moveDraftRepresentative(personId: string, direction: -1 | 1): void {
  if (saving.value) {
    return;
  }
  const ids = [...draftRepresentativeIds.value];
  const index = ids.indexOf(personId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) {
    return;
  }
  [ids[index], ids[target]] = [ids[target], ids[index]];
  draftRepresentativeIds.value = ids;
  saveError.value = "";
}

async function saveRepresentatives(): Promise<void> {
  const data = annualData.value;
  if (!data || saving.value) {
    return;
  }
  const currentVersion = loadVersion;
  saveError.value = "";
  try {
    const personIds = validateAnnualRepresentativeIds(draftRepresentativeIds.value);
    saving.value = true;
    const settings = await saveAnnualRepresentatives(data.year, personIds);
    if (currentVersion === loadVersion) {
      data.representativePersonIds = settings.representativePersonIds;
      cancelEditing();
      statusMessage.value = `${data.year} 年代表人物已保存。`;
    }
  } catch (error) {
    if (currentVersion === loadVersion) {
      saveError.value = error instanceof Error ? error.message : "保存失败，请重试。";
    }
  } finally {
    if (currentVersion === loadVersion) {
      saving.value = false;
    }
  }
}

watch(
  () => route.params.year,
  () => { void loadData(); },
  { immediate: true }
);
onBeforeUnmount(() => {
  loadVersion += 1;
});
</script>

<template>
  <section class="page annual-page">
    <PageHeader title="年榜" description="按年查看榜单成绩，记录这一年的代表人物。" />

    <div class="annual-layout" :class="{ 'has-years': years.length > 0 }">
      <aside v-if="years.length" class="panel annual-years-panel" aria-labelledby="annual-years-title">
        <div class="section-title">
          <h2 id="annual-years-title">年份</h2>
        </div>
        <nav aria-label="选择年榜年份">
          <ul class="annual-year-list">
            <li v-for="year in years" :key="year">
              <button
                class="annual-year-button"
                :class="{ selected: selectedYear === year }"
                type="button"
                :aria-current="selectedYear === year ? 'page' : undefined"
                :disabled="saving"
                @click="selectYear(year)"
              >
                {{ year }} 年
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <section v-if="loading" class="panel annual-ranking-panel">
        <p class="empty" role="status">正在加载年榜...</p>
      </section>
      <section v-else-if="loadError" class="panel annual-ranking-panel">
        <p class="annual-error" role="alert">{{ loadError }}</p>
        <button class="button" type="button" @click="loadData(true)">重新加载</button>
      </section>
      <section v-else-if="!annualData" class="panel annual-ranking-panel">
        <p class="empty">还没有榜单，创建榜单后即可按年查看年榜。</p>
      </section>
      <section v-else class="panel annual-ranking-panel" aria-labelledby="annual-ranking-title">
        <div class="section-title annual-section-title">
          <h2 id="annual-ranking-title">{{ annualData.year }} 年榜</h2>
          <span class="list-meta">共 {{ annualData.rows.length }} 人</span>
        </div>
        <p class="list-meta annual-explanation">
          年榜名次按当年数据沿用总榜算法；周平均点数仅按本人有效上榜期数计算，峰值点数为当年最高单期点数，周 peak 为当年最佳单周名次。
        </p>
        <p v-if="!annualData.rows.length" class="empty">该年暂无有效上榜记录。</p>
        <div v-else class="annual-table-scroll" role="region" aria-label="年榜表格" tabindex="0">
          <table class="annual-table">
            <thead>
              <tr>
                <th scope="col">年榜名次</th>
                <th scope="col">姓名</th>
                <th scope="col">年内周平均点数</th>
                <th scope="col">年内峰值点数</th>
                <th scope="col">年内周peak排名</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="person in annualData.rows"
                :key="person.personId"
                :class="[
                  representativeClasses.get(person.personId),
                  { 'annual-representative-row': representativeClasses.has(person.personId) }
                ]"
              >
                <td>{{ person.annualRank }}</td>
                <td>
                  <RouterLink class="annual-person-link" :to="`/people/${person.personId}`">
                    {{ person.personName }}
                  </RouterLink>
                </td>
                <td>{{ scoreFormatter.format(person.weeklyAverageScore) }}</td>
                <td>{{ scoreFormatter.format(person.annualPeakScore) }}</td>
                <td>{{ person.weeklyPeakRank }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-if="annualData"
        class="panel annual-representatives-panel"
        aria-labelledby="annual-representatives-title"
      >
        <div class="section-title annual-section-title">
          <h2 id="annual-representatives-title">{{ annualData.year }} 年代表人物</h2>
          <button
            v-if="!editingRepresentatives"
            class="button"
            type="button"
            :disabled="annualData.rows.length === 0"
            :aria-expanded="editingRepresentatives"
            aria-controls="annual-representatives-editor"
            @click="startEditing"
          >
            设置代表人物
          </button>
        </div>

        <ol v-if="representatives.length" class="annual-representatives">
          <li
            v-for="(person, index) in representatives"
            :key="person.personId"
          >
            <RouterLink
              class="annual-representative"
              :class="representativeColorClasses[index]"
              :to="`/people/${person.personId}`"
            >
              <span class="annual-representative-number" aria-hidden="true">{{ index + 1 }}</span>
              {{ person.personName }}
            </RouterLink>
          </li>
        </ol>
        <p v-else class="empty">尚未设置代表人物。</p>
        <p v-if="statusMessage" class="list-meta" role="status">{{ statusMessage }}</p>

        <form
          v-if="editingRepresentatives"
          id="annual-representatives-editor"
          class="annual-editor"
          @submit.prevent="saveRepresentatives"
        >
          <div class="section-title annual-section-title">
            <span class="list-meta">已选 {{ draftRepresentativeIds.length }} / {{ MAX_ANNUAL_REPRESENTATIVES }} 人</span>
            <button
              class="button"
              type="button"
              :disabled="saving || draftRepresentativeIds.length === 0"
              @click="draftRepresentativeIds = []"
            >
              清空选择
            </button>
          </div>
          <p class="list-meta annual-order-help">按顺序显示：1 紫色、2 红色、3 橙色。使用箭头调整顺序。</p>
          <ol v-if="draftRepresentatives.length" class="annual-selected-people">
            <li
              v-for="(person, index) in draftRepresentatives"
              :key="person.personId"
              class="annual-selected-person"
              :class="representativeColorClasses[index]"
            >
              <span class="annual-representative-number" aria-hidden="true">{{ index + 1 }}</span>
              <span class="annual-selected-name">{{ person.personName }}</span>
              <span class="annual-order-actions">
                <button
                  class="annual-order-button"
                  type="button"
                  :disabled="saving || index === 0"
                  :aria-label="`上移代表人物 ${person.personName}`"
                  title="上移"
                  @click="moveDraftRepresentative(person.personId, -1)"
                >
                  <ArrowUp :size="14" aria-hidden="true" />
                </button>
                <button
                  class="annual-order-button"
                  type="button"
                  :disabled="saving || index === draftRepresentatives.length - 1"
                  :aria-label="`下移代表人物 ${person.personName}`"
                  title="下移"
                  @click="moveDraftRepresentative(person.personId, 1)"
                >
                  <ArrowDown :size="14" aria-hidden="true" />
                </button>
                <button
                  class="annual-order-button"
                  type="button"
                  :disabled="saving"
                  :aria-label="`移除代表人物 ${person.personName}`"
                  title="移除"
                  @click="removeDraftRepresentative(person.personId)"
                >
                  <X :size="14" aria-hidden="true" />
                </button>
              </span>
            </li>
          </ol>
          <label class="field-label">
            <span>搜索人员</span>
            <input
              v-model="representativeQuery"
              class="field"
              type="search"
              placeholder="搜索当年上榜人员姓名"
              :disabled="saving"
            />
          </label>
          <fieldset class="annual-candidates" :disabled="saving">
            <legend class="annual-sr-only">当年上榜人员</legend>
            <label
              v-for="person in representativeCandidates"
              :key="person.personId"
              class="annual-candidate"
            >
              <input
                type="checkbox"
                :value="person.personId"
                :checked="draftRepresentativeIds.includes(person.personId)"
                :disabled="draftRepresentativeIds.length >= MAX_ANNUAL_REPRESENTATIVES && !draftRepresentativeIds.includes(person.personId)"
                @change="toggleDraftRepresentative(person.personId)"
              />
              <span>{{ person.personName }}</span>
              <span class="list-meta">年榜第 {{ person.annualRank }} 名</span>
            </label>
            <p v-if="!representativeCandidates.length" class="empty">没有符合条件的人员。</p>
          </fieldset>
          <p v-if="saveError" class="annual-error" role="alert">{{ saveError }}</p>
          <div class="annual-editor-actions">
            <button class="button primary" type="submit" :disabled="saving">
              {{ saving ? "正在保存..." : "保存" }}
            </button>
            <button class="button" type="button" :disabled="saving" @click="cancelEditing">取消</button>
          </div>
        </form>
      </section>

    </div>
  </section>
</template>

<style scoped>
.annual-page {
  max-width: 1600px;
  container: annual-page / inline-size;
}

.annual-page,
.annual-layout,
.annual-layout > .panel {
  min-width: 0;
}

.annual-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

.annual-year-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.annual-year-button {
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #3c4b50;
  background: transparent;
  text-align: center;
  cursor: pointer;
}

.annual-year-button:hover:not(:disabled),
.annual-year-button.selected {
  border-color: var(--theme-border-soft);
  color: var(--theme-color);
  background: var(--theme-softer);
}

.annual-year-button.selected {
  font-weight: 750;
}

.annual-year-button:disabled {
  cursor: wait;
}

.annual-section-title {
  flex-wrap: wrap;
}

.annual-representatives,
.annual-selected-people {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.annual-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.representative-purple {
  --representative-color: #7e22ce;
  --representative-soft: #faf5ff;
  --representative-border: #e9d5ff;
}

.representative-red {
  --representative-color: #b91c1c;
  --representative-soft: #fef2f2;
  --representative-border: #fecaca;
}

.representative-orange {
  --representative-color: #c2410c;
  --representative-soft: #fff7ed;
  --representative-border: #fed7aa;
}

.annual-representative,
.annual-selected-person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  padding: 8px 14px;
  border: 1px solid var(--representative-border);
  border-radius: 8px;
  color: var(--representative-color);
  background: var(--representative-soft);
  overflow-wrap: anywhere;
  font-weight: 650;
}

.annual-representative:hover {
  background: color-mix(in srgb, var(--representative-color) 12%, white);
}

.annual-representative-number {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: white;
  background: var(--representative-color);
  font-size: 0.875rem;
  font-weight: 750;
}

.annual-selected-person {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: 6px 8px;
  font-weight: 400;
}

.annual-selected-name {
  min-width: 0;
}

.annual-order-actions {
  display: inline-flex;
  gap: 2px;
}

.annual-order-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--representative-border);
  border-radius: 6px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.annual-order-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--representative-color) 12%, white);
}

.annual-order-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.annual-order-help {
  margin: 0;
}

.annual-selected-person svg {
  flex-shrink: 0;
}

.annual-editor {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #edf2f0;
}

.annual-editor .section-title {
  margin: 0;
}

.annual-candidates {
  min-width: 0;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  border: 1px solid #d8e3e0;
  border-radius: 8px;
}

.annual-candidate {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.annual-candidate + .annual-candidate {
  border-top: 1px solid #edf2f0;
}

.annual-candidate input {
  accent-color: var(--theme-color);
}

.annual-candidate:has(input:disabled) {
  opacity: 0.6;
  cursor: default;
}

.annual-candidates .empty {
  padding-inline: 12px;
}

.annual-explanation {
  margin: 0 0 12px;
}

.annual-table-scroll {
  overflow-x: auto;
}

.annual-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

.annual-table th,
.annual-table td {
  padding: 12px;
  border-bottom: 1px solid #edf2f0;
  text-align: right;
}

.annual-table th {
  color: #657276;
  font-size: 0.875rem;
  font-weight: 650;
  white-space: nowrap;
}

.annual-table th:nth-child(2),
.annual-table td:nth-child(2) {
  min-width: 160px;
  text-align: left;
  overflow-wrap: anywhere;
}

.annual-table tbody tr:hover {
  background: var(--theme-softer);
}

.annual-table tbody tr.annual-representative-row {
  color: var(--representative-color);
  background: var(--representative-soft);
}

.annual-table tbody tr.annual-representative-row:hover {
  background: color-mix(in srgb, var(--representative-color) 12%, white);
}

.annual-representative-row td:first-child {
  box-shadow: inset 3px 0 0 var(--representative-color);
}

.annual-person-link:hover {
  color: var(--theme-color);
  text-decoration: underline;
}

.annual-representative-row .annual-person-link:hover {
  color: var(--representative-color);
}

.annual-error {
  color: #a33131;
}

.annual-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@container annual-page (min-width: 1280px) {
  .annual-layout.has-years {
    grid-template-columns: 144px minmax(0, 1fr) 280px;
  }

  .annual-year-list {
    grid-template-columns: minmax(0, 1fr);
    max-height: min(600px, 70vh);
  }

  .annual-year-button {
    text-align: left;
  }
}
</style>
