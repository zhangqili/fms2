export const DB_NAME = "fms2";
export const DB_SCHEMA_VERSION = 1;

export const stores = {
  people: "&id, name, archived, createdAt, updatedAt",
  tags: "&id, name, sortOrder, createdAt, updatedAt",
  person_tags: "&id, [personId+tagId], personId, tagId",
  leaderboards: "&id, createdAt, updatedAt, boardDate, legacyDigitalDate, previousLeaderboardId",
  leaderboard_entries: "&id, leaderboardId, personId, rank, movement, includedInRanking",
  app_settings: "&id"
};
