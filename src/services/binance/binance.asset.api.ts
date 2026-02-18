import type { Binance24hrTicker, BinanceKline } from "./binance.types";

const BASE = "https://api.binance.com";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });

  // важливо: якщо Binance віддає html/помилку — побачимо текст
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Binance API error: ${res.status} ${text ? "· " + text : ""}`);
  }

  return (await res.json()) as T;
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// 24h по одному символу
export async function fetch24hrTickerOne(symbol: string, signal?: AbortSignal) {
  const url = `${BASE}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
  const t = await getJson<Binance24hrTicker>(url, signal);

  return {
    symbol: t.symbol,
    price: parseNum(t.lastPrice),
    change24h: parseNum(t.priceChangePercent),
    quoteVolume: parseNum(t.quoteVolume),
    high: parseNum(t.highPrice),
    low: parseNum(t.lowPrice),
  };
}

// klines -> масив close
export async function fetchKlinesClose(
  symbol: string,
  interval: string,
  limit: number,
  signal?: AbortSignal
): Promise<number[]> {
  const url =
    `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(String(limit))}`;

  const data = await getJson<BinanceKline[]>(url, signal);

  // BinanceKline = (string|number)[]; close = index 4
  const closes = data
    .map((k) => Number(k[4]))
    .filter((n) => Number.isFinite(n));

  return closes;
}
