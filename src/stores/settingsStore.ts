import { defineStore } from "pinia";
import { ref } from "vue";

import { db } from "@/db";
import { DB_SCHEMA_VERSION } from "@/db/schema";
import type { AppSettings } from "@/types/models";
import { nowIso } from "@/utils/dates";

export const DEFAULT_THEME_COLOR = "#5b2a86";

const defaultSettings = (): AppSettings => ({
  id: "app",
  scoreMin: 0,
  defaultSort: "name",
  themeColor: DEFAULT_THEME_COLOR,
  schemaVersion: DB_SCHEMA_VERSION,
  updatedAt: nowIso()
});

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings>(defaultSettings());

  async function loadSettings(): Promise<void> {
    const existing = await db.app_settings.get("app");

    if (existing) {
      const normalizedSettings = normalizeSettings(existing);
      settings.value = normalizedSettings;
      applyThemeColor(normalizedSettings.themeColor);
      if (normalizedSettings.updatedAt !== existing.updatedAt || normalizedSettings.themeColor !== existing.themeColor) {
        await db.app_settings.put(normalizedSettings);
      }
      return;
    }

    const initial = defaultSettings();
    await db.app_settings.put(initial);
    settings.value = initial;
    applyThemeColor(initial.themeColor);
  }

  async function updateThemeColor(color: string): Promise<void> {
    const themeColor = normalizeThemeColor(color);
    const nextSettings: AppSettings = {
      ...settings.value,
      themeColor,
      updatedAt: nowIso()
    };

    await db.app_settings.put(nextSettings);
    settings.value = nextSettings;
    applyThemeColor(themeColor);
  }

  return {
    settings,
    loadSettings,
    updateThemeColor
  };
});

function normalizeSettings(value: Partial<AppSettings>): AppSettings {
  const defaults = defaultSettings();

  return {
    ...defaults,
    ...value,
    id: "app",
    scoreMin: Number.isFinite(value.scoreMin) ? Number(value.scoreMin) : defaults.scoreMin,
    defaultSort: value.defaultSort ?? defaults.defaultSort,
    themeColor: normalizeThemeColor(value.themeColor),
    schemaVersion: DB_SCHEMA_VERSION
  };
}

function normalizeThemeColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : DEFAULT_THEME_COLOR;
}

function applyThemeColor(color: string): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty("--theme-color", color);
}
