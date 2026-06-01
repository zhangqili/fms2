import { defineStore } from "pinia";
import { ref } from "vue";

import {
  createLeaderboard,
  listLeaderboards,
  type CreateLeaderboardInput
} from "@/repositories/leaderboardsRepository";
import type { Leaderboard } from "@/types/models";

export const useLeaderboardsStore = defineStore("leaderboards", () => {
  const leaderboards = ref<Leaderboard[]>([]);

  async function loadLeaderboards(): Promise<void> {
    leaderboards.value = await listLeaderboards();
  }

  async function addLeaderboard(input: CreateLeaderboardInput): Promise<Leaderboard> {
    const leaderboard = await createLeaderboard(input);
    await loadLeaderboards();
    return leaderboard;
  }

  return {
    leaderboards,
    loadLeaderboards,
    addLeaderboard
  };
});
