// src/services/metals/metals.api.ts

export type MetalCode = "xau" | "xag" | "xpt" | "xpd";
export type QuoteCode = "UAH" | "USD" | "EUR";

export type SeriesPoint = { t: number; v: number };

// ✅ ЛОКАЛЬНО: ключ можна “палити” прямо тут
// Встав свій ключ:
const API_KEY = "29edff55-53f4-45c5-919d-6e5573e1a52a";

// Працюємо через Vite proxy: /metals-api -> https://metals-api.com
const BASE = "/metals-api/api";

function assertKey() {
  if (!API_KEY || API_KEY === "29edff55-53f4-45c5-919d-6e5573e1a52a") {
    throw new Error("METALS API: встав ключ у metals.api.ts (API_KEY).");
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// YYYY-MM-DD
function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function clampDaysBack(daysBack: number) {
  const n = Math.floor(daysBack || 30);
  return Math.max(1, Math.min(366, n));
}

function normalizeQuote(q: string) {
  const u = String(q || "UAH").toUpperCase();
  if (u === "USD") return "USD";
  if (u === "EUR") return "EUR";
  return "UAH";
}

function mapMetalToSymbol(metal: string) {
  const m = String(metal || "").trim().toLowerCase();
  if (m === "xau") return "XAU";
  if (m === "xag") return "XAG";
  if (m === "xpt") return "XPT";
  if (m === "xpd") return "XPD";
  return m.toUpperCase();
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`METALS API error: ${res.status}${text ? " · " + text : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * Spot: ціна металу в quote (UAH/USD/EUR)
 */
export async function fetchMetalSpot(opts: {
  metal: MetalCode | string;
  quote: QuoteCode;
  signal?: AbortSignal;
}): Promise<number | null> {
  assertKey();

  const quote = normalizeQuote(opts.quote);
  const symbol = mapMetalToSymbol(opts.metal);

  const url =
    `${BASE}/latest` +
    `?access_key=${encodeURIComponent(API_KEY)}` +
    `&base=${encodeURIComponent(quote)}` +
    `&symbols=${encodeURIComponent(symbol)}`;

  const data = await getJson<any>(url, opts.signal);

  const v = Number(data?.rates?.[symbol]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

/**
 * Series: історія металу в quote за daysBack днів
 */
export async function fetchMetalSeries(opts: {
  metal: MetalCode | string;
  quote: QuoteCode;
  daysBack: number;
  signal?: AbortSignal;
}): Promise<SeriesPoint[]> {
  assertKey();

  const daysBack = clampDaysBack(opts.daysBack);
  const quote = normalizeQuote(opts.quote);
  const symbol = mapMetalToSymbol(opts.metal);

  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (daysBack - 1));

  const startDate = fmtIsoDate(start);
  const endDate = fmtIsoDate(end);

  const url =
    `${BASE}/timeseries` +
    `?access_key=${encodeURIComponent(API_KEY)}` +
    `&base=${encodeURIComponent(quote)}` +
    `&symbols=${encodeURIComponent(symbol)}` +
    `&start_date=${encodeURIComponent(startDate)}` +
    `&end_date=${encodeURIComponent(endDate)}`;

  const data = await getJson<any>(url, opts.signal);

  const rates = data?.rates;
  if (!rates || typeof rates !== "object") return [];

  const out: SeriesPoint[] = [];
  const keys = Object.keys(rates).sort();

  for (const k of keys) {
    const v = Number(rates?.[k]?.[symbol]);
    if (!Number.isFinite(v) || v <= 0) continue;

    const ts = new Date(`${k}T12:00:00`).getTime();
    out.push({ t: ts, v });
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
