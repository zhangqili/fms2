<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";

import PageHeader from "@/components/PageHeader.vue";
import {
  getAnnualLeaderboard,
  listAnnualYears,
  saveAnnualRepresentatives,
  type AnnualLeaderboardData
} from "@/repositories/annualLeaderboardsRepository";
import { useWorkspaceTabsStore } from "@/stores/workspaceTabsStore";
import { annualLeaderboardPath, parseAnnualLeaderboardYear } from "@/utils/annualLeaderboards";

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
let loadVersion = 0;
let yearsLoaded = false;

const representatives = computed(() => {
  const ids = new Set(annualData.value?.representativePersonIds ?? []);
  return (annualData.value?.rows ?? []).filter((row) => ids.has(row.personId));
});
const draftRepresentatives = computed(() => {
  const ids = new Set(draftRepresentativeIds.value);
  return (annualData.value?.rows ?? []).filter((row) => ids.has(row.personId));
});
const representativeCandidates = computed(() => {
  const query = representativeQuery.value.trim().toLocaleLowerCase("zh-CN");
  return (annualData.value?.rows ?? []).filter((row) =>
    row.personName.toLocaleLowerCase("zh-CN").includes(query)
  );
});

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
  draftRepresentativeIds.value = draftRepresentativeIds.value.filter((id) => id !== personId);
}

async function saveRepresentatives(): Promise<void> {
  const data = annualData.value;
  if (!data || saving.value) {
    return;
  }
  const currentVersion = loadVersion;
  saving.value = true;
  saveError.value = "";
  try {
    const settings = await saveAnnualRepresentatives(data.year, [...draftRepresentativeIds.value]);
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
              <tr v-for="person in annualData.rows" :key="person.personId">
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

        <div v-if="representatives.length" class="annual-representatives">
          <RouterLink
            v-for="person in representatives"
            :key="person.personId"
            class="annual-representative"
            :to="`/people/${person.personId}`"
          >
            {{ person.personName }}
          </RouterLink>
        </div>
        <p v-else class="empty">尚未设置代表人物。</p>
        <p v-if="statusMessage" class="list-meta" role="status">{{ statusMessage }}</p>

        <form
          v-if="editingRepresentatives"
          id="annual-representatives-editor"
          class="annual-editor"
          @submit.prevent="saveRepresentatives"
        >
          <div class="section-title annual-section-title">
            <span class="list-meta">从当年上榜人员中选择，已选 {{ draftRepresentativeIds.length }} 人</span>
            <button
              class="button"
              type="button"
              :disabled="saving || draftRepresentativeIds.length === 0"
              @click="draftRepresentativeIds = []"
            >
              清空选择
            </button>
          </div>
          <div v-if="draftRepresentatives.length" class="annual-selected-people">
            <button
              v-for="person in draftRepresentatives"
              :key="person.personId"
              class="annual-selected-person"
              type="button"
              :disabled="saving"
              :aria-label="`移除代表人物 ${person.personName}`"
              @click="removeDraftRepresentative(person.personId)"
            >
              {{ person.personName }}
              <X :size="14" aria-hidden="true" />
            </button>
          </div>
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
              <input v-model="draftRepresentativeIds" type="checkbox" :value="person.personId" />
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
.annual-selected-people,
.annual-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.annual-representative,
.annual-selected-person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 14px;
  border: 1px solid var(--theme-border-soft);
  border-radius: 8px;
  color: var(--theme-color);
  background: var(--theme-softer);
  overflow-wrap: anywhere;
  font-weight: 650;
}

.annual-representative:hover,
.annual-selected-person:hover:not(:disabled) {
  background: var(--theme-soft);
}

.annual-selected-person {
  padding: 4px 10px;
  font-weight: 400;
  cursor: pointer;
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

.annual-person-link:hover {
  color: var(--theme-color);
  text-decoration: underline;
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
