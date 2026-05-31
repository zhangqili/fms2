export function nowIso(): string {
  return new Date().toISOString();
}

export function digitalDateToIsoDate(value: number): string | null {
  const text = String(value);
  if (!/^\d{8}$/.test(text)) {
    return null;
  }

  const year = text.slice(0, 4);
  const month = text.slice(4, 6);
  const day = text.slice(6, 8);
  return `${year}-${month}-${day}`;
}

export function displayDate(value: string | null): string {
  if (!value) {
    return "未设置日期";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
