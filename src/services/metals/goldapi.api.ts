// src/services/metals/goldapi.api.ts
export type MetalCode = "xau" | "xag" | "xpt" | "xpd";
export type SeriesPoint = { t: number; v: number };

const API_KEY = import.meta.env.VITE_GOLD_API_KEY as string | undefined;

// ✅ через proxy у Vite: /goldapi -> https://www.goldapi.io
// GoldAPI endpoint: /api/historical/{METAL}/USD/{YYYY-MM-DD}
const BASE = "/goldapi/api";

function assertKey() {
  if (!API_KEY) {
    throw new Error("GoldAPI: немає ключа. Додай VITE_GOLD_API_KEY у .env.local і перезапусти dev-сервер.");
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function mapMetal(m: string) {
  const u = String(m || "").trim().toUpperCase();
  if (u === "XAU" || u === "XAG" || u === "XPT" || u === "XPD") return u;
  // якщо прилетить "xau"
  const low = u.toLowerCase();
  if (low === "XAU".toLowerCase()) return "XAU";
  return u;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: {
      "x-api-key": API_KEY!, // ✅ ключ в заголовку (не в URL)
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GoldAPI error: ${res.status}${text ? " · " + text : ""}`);
  }

  return (await res.json()) as T;
}

/**
 * ✅ Серія цін (USD) за N днів.
 * Free-ліміти зазвичай жорсткі — тому обмежимося 30 днями.
 */
export async function fetchGoldSeries(opts: {
  metal: MetalCode | string;
  daysBack: number;
  signal?: AbortSignal;
}): Promise<SeriesPoint[]> {
  assertKey();

  const metal = mapMetal(opts.metal);
  const daysBack = Math.min(30, Math.max(1, Math.floor(opts.daysBack || 30)));

  const out: SeriesPoint[] = [];

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);

    const dateStr = fmtIsoDate(d);
    const url = `${BASE}/historical/${metal}/USD/${dateStr}`;

    try {
      const data = await getJson<any>(url, opts.signal);
      const price = Number(data?.price);

      if (!Number.isFinite(price) || price <= 0) continue;

      out.push({
        t: new Date(`${dateStr}T12:00:00`).getTime(),
        v: price,
      });
    } catch {
      // якщо за день немає даних/ліміти — пропускаємо день
    }
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}
