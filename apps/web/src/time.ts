export const TIME_ZONE = "Europe/Copenhagen";
export const WINDOW_DAYS = 30;

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) in Copenhagen at the given instant. */
export function today(now: Date = new Date()): string {
  return dateFormat.format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First date (inclusive) of the 30-day window. Items dated before it are "older than 30 days". */
export function windowStart(now: Date = new Date()): string {
  return addDays(today(now), -WINDOW_DAYS);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}
