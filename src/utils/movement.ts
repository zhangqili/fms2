import type { LeaderboardEntry, Movement } from "@/types/models";

export function movementText(entry: Pick<LeaderboardEntry, "movement" | "rankDelta">): string {
  switch (entry.movement) {
    case "new":
      return "NEW";
    case "returning":
      return "BACK";
    case "out":
      return "OUT";
    case "same":
      return "-";
    case "up":
      return `▲${Math.abs(entry.rankDelta ?? 0)}`;
    case "down":
      return `▼${Math.abs(entry.rankDelta ?? 0)}`;
    default:
      return movementLabel(entry.movement);
  }
}

export function movementLabel(movement: Movement): string {
  switch (movement) {
    case "new":
      return "初次进榜";
    case "returning":
      return "回榜";
    case "out":
      return "出榜";
    case "same":
      return "持平";
    case "up":
      return "上升";
    case "down":
      return "下降";
  }
}

export function formatScore(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
