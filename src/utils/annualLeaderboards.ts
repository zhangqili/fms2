export const MAX_ANNUAL_REPRESENTATIVES = 3;

export function normalizeAnnualRepresentativeIds(
  personIds: readonly string[],
  eligiblePersonIds: ReadonlySet<string>
): string[] {
  return [...new Set(personIds)]
    .filter((personId) => eligiblePersonIds.has(personId))
    .slice(0, MAX_ANNUAL_REPRESENTATIVES);
}

export function validateAnnualRepresentativeIds(personIds: readonly string[]): string[] {
  const uniqueIds = [...new Set(personIds)];
  if (uniqueIds.length > MAX_ANNUAL_REPRESENTATIVES) {
    throw new Error(`代表人物最多选择 ${MAX_ANNUAL_REPRESENTATIVES} 人。`);
  }
  return uniqueIds;
}

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
