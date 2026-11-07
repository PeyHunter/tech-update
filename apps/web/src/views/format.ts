const TZ = "Europe/Copenhagen";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const shortDateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
// Calendar dates (YYYY-MM-DD) are already Copenhagen days; format them in UTC so they never shift.
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

export const formatDateTime = (iso: string): string => dateTimeFmt.format(new Date(iso)).replace(" at ", ", ");
export const formatShortDateTime = (iso: string): string =>
  shortDateTimeFmt.format(new Date(iso)).replace(" at ", ", ");

export function formatDay(date: string): { dow: string; dm: string } {
  const [dow = "", ...rest] = dayFmt.format(new Date(`${date}T00:00:00Z`)).replace(",", "").split(" ");
  return { dow, dm: rest.join(" ") };
}
export const formatLongDay = (date: string): string => longDayFmt.format(new Date(`${date}T00:00:00Z`));
export const formatMonth = (month: string): string => monthFmt.format(new Date(`${month}-01T00:00:00Z`));

export function formatDuration(s: number | null): string {
  if (s === null) return "–";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function initials(name: string | null, handle: string): string {
  const words = (name ?? handle).trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? handle).slice(0, 2);
  return letters.toUpperCase();
}

const SOURCE_LABELS: Record<string, string> = {
  x: "X",
  hn: "HN",
  github: "GitHub",
  arxiv: "arXiv",
  lab: "Lab",
  newsletter: "Newsletter",
  youtube: "YouTube",
  podcast: "the podcast",
};
export const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s;
