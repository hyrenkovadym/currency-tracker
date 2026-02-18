import type { Binance24hrTicker, BinanceKline, KlineInterval } from "./binance.types";

const BASE = "https://api.binance.com";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Binance API error: ${res.status}${text ? " · " + text : ""}`);
  }

  return (await res.json()) as T;
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ✅ всі 24h тикери
export async function fetch24hrTickers(signal?: AbortSignal) {
  return getJson<Binance24hrTicker[]>(`${BASE}/api/v3/ticker/24hr`, signal);
}

// ✅ один 24h тикер (для сторінки монети)
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

// ✅ для Dashboard sparklines (10 точок)
export async function fetchSparkline(symbol: string, signal?: AbortSignal): Promise<number[]> {
  const url =
    `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=15m&limit=10`;

  const data = await getJson<BinanceKline[]>(url, signal);
  return data.map((k) => Number(k[4])).filter((n) => Number.isFinite(n));
}

// ✅ klines як series {time, close} (для hover з реальною датою)
export async function fetchKlinesSeries(
  symbol: string,
  interval: KlineInterval,
  limit: number,
  signal?: AbortSignal
): Promise<{ time: number; close: number }[]> {
  const url =
    `${BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&limit=${encodeURIComponent(String(limit))}`;

  const data = await getJson<BinanceKline[]>(url, signal);

  return data
    .map((k) => ({ time: k[0], close: Number(k[4]) }))
    .filter((p) => Number.isFinite(p.close));
}
