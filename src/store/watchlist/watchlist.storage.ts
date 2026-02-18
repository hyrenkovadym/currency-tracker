const KEY = "marketpulse_watchlist_v1";

export function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveWatchlist(symbols: string[]) {
  localStorage.setItem(KEY, JSON.stringify(symbols));
}
