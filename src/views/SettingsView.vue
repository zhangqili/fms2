<script setup lang="ts">
import { onMounted, ref } from "vue";

import PageHeader from "@/components/PageHeader.vue";
import { createJsonBackup } from "@/repositories/backupRepository";
import {
  downloadWorkbook,
  exportLegacyWorkbook,
  legacyExportFilename
} from "@/repositories/excelExportRepository";
import {
  importLegacyFmsWorkbook,
  previewLegacyFmsWorkbook,
  type LegacyFmsImportResult,
  type LegacyFmsPreview
} from "@/repositories/legacyFmsImportRepository";
import { DEFAULT_THEME_COLOR, useSettingsStore } from "@/stores/settingsStore";

const settingsStore = useSettingsStore();
const backupText = ref("");
const themeColor = ref(DEFAULT_THEME_COLOR);
const legacyFile = ref<File | null>(null);
const legacyPreview = ref<LegacyFmsPreview | null>(null);
const legacyImportResult = ref<LegacyFmsImportResult | null>(null);
const legacyImporting = ref(false);
const legacyImportError = ref("");
const legacyExporting = ref(false);
const legacyExportError = ref("");

async function exportBackup(): Promise<void> {
  backupText.value = await createJsonBackup();
}

async function saveThemeColor(): Promise<void> {
  await settingsStore.updateThemeColor(themeColor.value);
  themeColor.value = settingsStore.settings.themeColor;
}

async function resetThemeColor(): Promise<void> {
  themeColor.value = DEFAULT_THEME_COLOR;
  await saveThemeColor();
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

async function exportLegacyFile(): Promise<void> {
  legacyExporting.value = true;
  legacyExportError.value = "";
  try {
    const workbook = await exportLegacyWorkbook();
    await downloadWorkbook(workbook, legacyExportFilename());
  } catch (error) {
    legacyExportError.value = error instanceof Error ? error.message : "导出失败。";
  } finally {
    legacyExporting.value = false;
  }
}

onMounted(async () => {
  await settingsStore.loadSettings();
  themeColor.value = settingsStore.settings.themeColor;
});
</script>

<template>
  <section class="page">
    <PageHeader title="设置" description="本地数据、备份和旧 FMS xlsx 导入导出入口。" />

    <section class="panel">
      <div class="section-title">
        <h2>分数规则</h2>
      </div>
      <p>默认下限：{{ settingsStore.settings.scoreMin }}；不设置上限。</p>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>主题</h2>
      </div>
      <div class="toolbar">
        <label class="theme-field">
          <span>主题色</span>
          <input v-model="themeColor" class="field color-field" type="color" aria-label="主题色" />
        </label>
        <button class="button primary" type="button" @click="saveThemeColor">保存主题色</button>
        <button class="button" type="button" @click="resetThemeColor">恢复紫金色</button>
      </div>
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
        <span>标签 {{ legacyPreview.tagCount }}</span>
        <span>标签绑定 {{ legacyPreview.personTagCount }}</span>
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
        条在榜记录、{{ legacyImportResult.outEntryCount }} 条出榜记录、{{
          legacyImportResult.tagCount
        }}
        个标签、{{ legacyImportResult.personTagCount }} 条标签绑定。
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

    <section class="panel">
      <div class="section-title">
        <h2>旧 FMS xlsx 导出</h2>
        <button class="button" type="button" :disabled="legacyExporting" @click="exportLegacyFile">
          {{ legacyExporting ? "导出中" : "导出旧 FMS 格式" }}
        </button>
      </div>
      <p class="empty">
        第一个 sheet 按旧版三列块格式导出全部榜单；第二个 sheet 每行一个标签，A 列为颜色块，B 列为标签名，C 列之后为人员姓名。
      </p>
      <p v-if="legacyExportError" class="error-list">{{ legacyExportError }}</p>
    </section>
  </section>
</template>
