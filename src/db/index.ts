import Dexie, { type Table } from "dexie";

import { DB_NAME, DB_SCHEMA_VERSION, stores, version1Stores } from "./schema";
import type {
  AnnualLeaderboardSettings,
  AppSettings,
  Leaderboard,
  LeaderboardEntry,
  Person,
  PersonTag,
  Tag
} from "@/types/models";

export class FmsDatabase extends Dexie {
  people!: Table<Person, string>;
  tags!: Table<Tag, string>;
  person_tags!: Table<PersonTag, string>;
  leaderboards!: Table<Leaderboard, string>;
  leaderboard_entries!: Table<LeaderboardEntry, string>;
  app_settings!: Table<AppSettings, string>;
  annual_leaderboard_settings!: Table<AnnualLeaderboardSettings, number>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores(version1Stores);
    this.version(DB_SCHEMA_VERSION).stores(stores);
  }
}

export const db = new FmsDatabase();
