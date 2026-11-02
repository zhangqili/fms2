export function parseAnnualLeaderboardYear(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) {
    return null;
  }
  const year = Number(value);
  return year >= 1 && year <= 9999 ? year : null;
}

export function annualLeaderboardPath(year: number): string {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error("请选择有效年份。");
  }
  return `/annual-leaderboards/${year}`;
}
