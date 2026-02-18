// src/services/nbu/nbu-exchange.api.ts
export type NbuValCode = "xau" | "xag" | "xpt" | "xpd";
export type SeriesPoint = { t: number; v: number };

const BASE = "/nbu"; // vite proxy -> https://bank.gov.ua

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// YYYYMMDD
function fmtYmdCompact(d: Date) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

// "01.01.2026" -> timestamp
function parseExchangeDate(s: string) {
  const m = String(s || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return NaN;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = Number(m[3]);
  const dt = new Date(yy, mm - 1, dd, 12, 0, 0, 0);
  return dt.getTime();
}

function mapValcode(v: string) {
  return String(v || "").trim().toUpperCase(); // xau -> XAU
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NBU error: ${res.status}${text ? " · " + text : ""}`);
  }
  return (await res.json()) as T;
}

/**
 * НБУ (інвест. метали) серія за N днів.
 * Повертає [{t, v}] де v = rate_per_unit (UAH за 1 унцію/одиницю, як дає НБУ).
 */
export async function fetchNbuExchangeSeries(opts: {
  valcode: NbuValCode | string;
  daysBack: number;
  signal?: AbortSignal;
}): Promise<SeriesPoint[]> {
  const daysBack = Math.max(2, Math.min(365, Math.floor(opts.daysBack || 10)));

  const end = new Date();
  end.setHours(12, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - (daysBack - 1));

  const startStr = fmtYmdCompact(start);
  const endStr = fmtYmdCompact(end);

  const valcode = mapValcode(opts.valcode);

  // Це саме той формат, який повертає об’єкти як у тебе: exchangedate, rate_per_unit, ...
  const url =
    `${BASE}/NBU_Exchange/exchange_site` +
    `?start=${encodeURIComponent(startStr)}` +
    `&end=${encodeURIComponent(endStr)}` +
    `&valcode=${encodeURIComponent(valcode)}` +
    `&sort=exchangedate&order=asc&json`;

  const rows = await getJson<any[]>(url, opts.signal);

  const out: SeriesPoint[] = [];
  for (const r of rows || []) {
    const t = parseExchangeDate(r?.exchangedate);
    const v =
      Number(r?.rate_per_unit ?? r?.rate ?? r?.value ?? r?.amount ?? 0);

    if (!Number.isFinite(t) || !Number.isFinite(v) || v <= 0) continue;
    out.push({ t, v });
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
