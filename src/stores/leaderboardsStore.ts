import { defineStore } from "pinia";
import { ref } from "vue";

import { listLeaderboards } from "@/repositories/leaderboardsRepository";
import type { Leaderboard } from "@/types/models";

export const useLeaderboardsStore = defineStore("leaderboards", () => {
  const leaderboards = ref<Leaderboard[]>([]);

  async function loadLeaderboards(): Promise<void> {
    leaderboards.value = await listLeaderboards();
  }

  return {
    leaderboards,
    loadLeaderboards
  };
});
