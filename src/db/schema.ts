export const DB_NAME = "fms2";
export const DB_SCHEMA_VERSION = 2;

export const version1Stores = {
  people: "&id, name, archived, createdAt, updatedAt",
  tags: "&id, name, sortOrder, createdAt, updatedAt",
  person_tags: "&id, [personId+tagId], personId, tagId",
  leaderboards: "&id, createdAt, updatedAt, boardDate, legacyDigitalDate, previousLeaderboardId",
  leaderboard_entries: "&id, leaderboardId, personId, rank, movement, includedInRanking",
  app_settings: "&id"
};

export const stores = {
  ...version1Stores,
  annual_leaderboard_settings: "&year, updatedAt"
};
