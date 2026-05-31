<script setup lang="ts">
import { onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import { createJsonBackup } from "@/repositories/backupRepository";
import {
  importLegacyFmsWorkbook,
  previewLegacyFmsWorkbook,
  type LegacyFmsImportResult,
  type LegacyFmsPreview
} from "@/repositories/legacyFmsImportRepository";
import { useSettingsStore } from "@/stores/settingsStore";

const settingsStore = useSettingsStore();
const backupText = ref("");
const legacyFile = ref<File | null>(null);
const legacyPreview = ref<LegacyFmsPreview | null>(null);
const legacyImportResult = ref<LegacyFmsImportResult | null>(null);
const legacyImporting = ref(false);
const legacyImportError = ref("");

async function exportBackup(): Promise<void> {
  backupText.value = await createJsonBackup();
}

async function previewLegacyFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  legacyFile.value = file;
  legacyImportResult.value = null;
  legacyImportError.value = "";
  legacyPreview.value = await previewLegacyFmsWorkbook(file);
}

async function importLegacyFile(): Promise<void> {
  if (!legacyFile.value || !legacyPreview.value) {
    return;
  }

  if (legacyPreview.value.errors.length > 0) {
    legacyImportError.value = "当前文件存在解析错误，请修正后再导入。";
    return;
  }

  const confirmed = window.confirm("此操作会清空当前人员、标签和榜单数据，并导入旧 FMS xlsx。确定继续吗？");
  if (!confirmed) {
    return;
  }

  legacyImporting.value = true;
  legacyImportError.value = "";
  legacyImportResult.value = null;
  try {
    legacyImportResult.value = await importLegacyFmsWorkbook(legacyFile.value);
  } catch (error) {
    legacyImportError.value = error instanceof Error ? error.message : "导入失败。";
  } finally {
    legacyImporting.value = false;
  }
}

onMounted(() => {
  void settingsStore.loadSettings();
});
</script>

<template>
  <section class="page">
    <PageHeader title="设置" description="本地数据、备份和旧 FMS xlsx 导入入口。" />

    <section class="panel">
      <div class="section-title">
        <h2>分数规则</h2>
      </div>
      <p>默认下限：{{ settingsStore.settings.scoreMin }}；不设置上限。</p>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>JSON 备份</h2>
        <button class="button" type="button" @click="exportBackup">生成备份</button>
      </div>
      <textarea v-if="backupText" class="backup-area" readonly :value="backupText" />
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>旧 FMS xlsx 导入</h2>
      </div>
      <input class="field" type="file" accept=".xlsx" @change="previewLegacyFile" />
      <div v-if="legacyPreview" class="import-summary">
        <span>人员 {{ legacyPreview.peopleCount }}</span>
        <span>榜单 {{ legacyPreview.leaderboardCount }}</span>
        <span>条目 {{ legacyPreview.entryCount }}</span>
        <span>零分/出榜候选 {{ legacyPreview.zeroScoreEntryCount }}</span>
      </div>
      <div v-if="legacyPreview?.dates.length" class="table-panel import-table">
        <div class="table-row table-head">
          <span>日期</span>
          <span>标题</span>
          <span>条目</span>
          <span>零分</span>
        </div>
        <div v-for="item in legacyPreview.dates.slice(0, 8)" :key="item.digitalDate" class="table-row">
          <span>{{ item.boardDate ?? item.digitalDate }}</span>
          <span>{{ item.title || "未命名榜单" }}</span>
          <span>{{ item.entryCount }}</span>
          <span>{{ item.zeroScoreEntryCount }}</span>
        </div>
      </div>
      <p v-if="legacyPreview && legacyPreview.dates.length > 8" class="empty">
        仅预览前 8 期榜单。
      </p>
      <div v-if="legacyPreview?.errors.length" class="error-list">
        <p v-for="error in legacyPreview.errors" :key="error">{{ error }}</p>
      </div>
      <p v-if="legacyImportError" class="error-list">{{ legacyImportError }}</p>
      <div v-if="legacyImportResult" class="success-box">
        已导入 {{ legacyImportResult.peopleCount }} 人、{{ legacyImportResult.leaderboardCount }} 期榜单、{{
          legacyImportResult.entryCount
        }}
        条在榜记录、{{ legacyImportResult.outEntryCount }} 条出榜记录。
      </div>
      <button
        class="button danger"
        type="button"
        :disabled="!legacyPreview || legacyImporting || legacyPreview.errors.length > 0"
        @click="importLegacyFile"
      >
        {{ legacyImporting ? "导入中" : "覆盖导入旧 FMS 数据" }}
      </button>
    </section>
  </section>
</template>
