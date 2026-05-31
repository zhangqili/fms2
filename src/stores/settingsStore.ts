import { defineStore } from "pinia";
import { ref } from "vue";

import { db } from "@/db";
import { DB_SCHEMA_VERSION } from "@/db/schema";
import type { AppSettings } from "@/types/models";
import { nowIso } from "@/utils/dates";

const defaultSettings = (): AppSettings => ({
  id: "app",
  scoreMin: 0,
  defaultSort: "name",
  schemaVersion: DB_SCHEMA_VERSION,
  updatedAt: nowIso()
});

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>(defaultSettings());

  async function loadSettings(): Promise<void> {
    const existing = await db.app_settings.get("app");

    if (existing) {
      settings.value = existing;
      return;
    }

    const initial = defaultSettings();
    await db.app_settings.put(initial);
    settings.value = initial;
  }

  return {
    settings,
    loadSettings
  };
});
