import { db } from "@/db";
import { DB_SCHEMA_VERSION } from "@/db/schema";
import { nowIso } from "@/utils/dates";

export async function createJsonBackup(): Promise<string> {
  const payload = {
    exportedAt: nowIso(),
    appVersion: "0.1.0",
    schemaVersion: DB_SCHEMA_VERSION,
    people: await db.people.toArray(),
    tags: await db.tags.toArray(),
    person_tags: await db.person_tags.toArray(),
    leaderboards: await db.leaderboards.toArray(),
    leaderboard_entries: await db.leaderboard_entries.toArray(),
    app_settings: await db.app_settings.toArray()
  };

  return JSON.stringify(payload, null, 2);
}
