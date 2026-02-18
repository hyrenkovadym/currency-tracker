// src/services/nbu/nbu.api.ts

export type NbuRateRow = {
  r030: number;
  txt: string;
  rate: number;
  cc: string; // "USD"
  exchangedate: string; // "09.02.2026"
};

const BASE = "https://bank.gov.ua/NBUStatService/v1/statdirectory";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NBU API error: ${res.status}${text ? " · " + text : ""}`);
  }

  // NBU повертає JSON, але fetch інколи може спіткнутись об BOM/тип контенту
  // тому читаємо як text -> JSON (максимально “живуче”)
  const raw = await res.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    // якщо раптом вже об’єкт (рідко), спробуємо стандартно
    return (await res.json()) as T;
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// YYYYMMDD
function fmtYmd(d: Date) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** ✅ СПОТ-курси НБУ відносно UAH (на сьогодні) */
export async function fetchNbuSpotRates(signal?: AbortSignal) {
  const url = `${BASE}/exchange?json`;
  const data = await getJson<NbuRateRow[]>(url, signal);

  const map = new Map<string, { rate: number; date: string; name: string }>();

  for (const r of data) {
    // ✅ важливо: trim() — інколи в cc трапляються невидимі пробіли
    const cc = String(r?.cc ?? "").trim().toUpperCase();
    if (!cc) continue;

    const rate = Number(r.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;

    map.set(cc, {
      rate,
      date: String(r.exchangedate ?? ""),
      name: String(r.txt ?? ""),
    });
  }

  // “віртуальний” курс UAH
  map.set("UAH", {
    rate: 1,
    date: String(data[0]?.exchangedate ?? ""),
    name: "Українська гривня",
  });

  return map;
}

// alias під твій старий імпорт
export const fetchNbuRates = fetchNbuSpotRates;

export type NbuSeriesPoint = { date: string; ts: number; rate: number };

/**
 * ✅ Історія курсу для графіка:
 * беремо `/exchange?date=YYYYMMDD&json`, фільтруємо cc.
 *
 * Повертає масив точок з rate для пари base/quote.
 * - якщо quote = "UAH" -> просто беремо base в UAH
 * - якщо quote != "UAH" -> рахуємо крос-курс: baseUAH / quoteUAH
 */
export async function fetchNbuSeries(params: {
  base: string; // наприклад "AED"
  quote?: string; // "UAH" | "USD" | ...
  daysBack: number; // 7, 30, 365...
  signal?: AbortSignal;
}): Promise<NbuSeriesPoint[]> {
  const base = String(params.base || "").trim().toUpperCase();
  const quote = String(params.quote || "UAH").trim().toUpperCase();
  const daysBack = Math.max(1, Math.min(366, Math.floor(params.daysBack || 7)));
  const signal = params.signal;

  if (!base) return [];

  const end = new Date();
  end.setHours(12, 0, 0, 0); // стабільніше по TZ
  const start = new Date(end);
  start.setDate(end.getDate() - (daysBack - 1));

  const points: NbuSeriesPoint[] = [];

  // 1 запит на день: повертається весь список валют
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const ymd = fmtYmd(d);
    const url = `${BASE}/exchange?date=${ymd}&json`;

    let rows: NbuRateRow[];
    try {
      rows = await getJson<NbuRateRow[]>(url, signal);
    } catch {
      // якщо за якийсь день нема даних/фейл — просто пропускаємо
      continue;
    }

    const map = new Map<string, number>();
    let dateLabel = "";

    for (const r of rows) {
      const cc = String(r?.cc ?? "").trim().toUpperCase();
      if (!cc) continue;

      const rate = Number(r.rate);
      if (!Number.isFinite(rate) || rate <= 0) continue;

      map.set(cc, rate);
      if (!dateLabel) dateLabel = String(r.exchangedate ?? "");
    }

    // додаємо UAH=1
    map.set("UAH", 1);

    const baseRate = map.get(base);
    const quoteRate = map.get(quote);

    if (!baseRate || !quoteRate) continue;

    const cross = baseRate / quoteRate;
    if (!Number.isFinite(cross) || cross <= 0) continue;

    points.push({
      date: dateLabel || ymd,
      ts: d.getTime(),
      rate: cross,
    });
  }

  return points;
}
