export type MetalCode = "xau" | "xag" | "xpt" | "xpd";

export type SeriesPoint = { t: number; v: number };

const BASE = "https://bank.gov.ua/NBUStatService/v1/statdirectory";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtYmd(d: Date) {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NBU metals error: ${res.status}${text ? " · " + text : ""}`);
  }

  return (await res.json()) as T;
}

export async function fetchMetalSeries(opts: {
  metal: MetalCode;
  daysBack: number;
  signal?: AbortSignal;
}): Promise<SeriesPoint[]> {
  const valcode = opts.metal.toUpperCase();

  const end = new Date();
  end.setHours(12, 0, 0, 0);

  const start = new Date(end);
  start.setDate(end.getDate() - (opts.daysBack - 1));

  const result: SeriesPoint[] = [];

  for (let i = 0; i < opts.daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const ymd = fmtYmd(d);

    const url =
      `${BASE}/exchangenew?json` +
      `&valcode=${encodeURIComponent(valcode)}` +
      `&date=${ymd}`;

    try {
      const data = await getJson<any[]>(url, opts.signal);
      const rate = Number(data?.[0]?.rate);

      if (!Number.isFinite(rate)) continue;

      result.push({
        t: d.getTime(),
        v: rate,
      });
    } catch {
      continue;
    }
  }

  return result;
}