// src/services/minfin/minfin-metals.api.ts

export type MetalCode = "xau" | "xag" | "xpt" | "xpd";

type SpotMap = Partial<Record<MetalCode, number>>;

const BASE_PATH = "/minfin/ua/markets/bullion/";

/**
 * Тягнемо HTML сторінку Minfin bullion і парсимо таблицю.
 * Повертаємо ціни (UAH) по ключах xau/xag/xpt/xpd.
 */
export async function fetchMinfinMetalsSpot(signal?: AbortSignal): Promise<SpotMap> {
  const res = await fetch(BASE_PATH, {
    signal,
    headers: {
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MINFIN error: ${res.status}${text ? " · " + text.slice(0, 200) : ""}`);
  }

  const html = await res.text();

  // Парсимо HTML
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Беремо всі рядки таблиць (на випадок якщо структура зміниться — шукаємо “по всім”)
  const rows = Array.from(doc.querySelectorAll("table tr"));

  const out: SpotMap = {};

  for (const tr of rows) {
    const tds = Array.from(tr.querySelectorAll("td,th"));
    if (tds.length < 2) continue;

    const rowText = normalize(tds.map((x) => x.textContent ?? "").join(" "));

    // визначаємо метал по тексту рядка (максимально “живуче”)
    const code = detectMetal(rowText);
    if (!code) continue;

    // Витягуємо останнє адекватне число з рядка (часто в кінці ціна)
    const nums = tds
      .map((x) => parseNumber(x.textContent ?? ""))
      .filter((n) => Number.isFinite(n) && n > 0);

    const price = nums.length ? nums[nums.length - 1] : NaN;
    if (Number.isFinite(price) && price > 0) {
      out[code] = price;
    }
  }

  return out;
}

function normalize(s: string) {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detectMetal(rowText: string): MetalCode | null {
  // Українська/рос + коди
  if (rowText.includes("xau") || rowText.includes("золото") || rowText.includes("gold")) return "xau";
  if (rowText.includes("xag") || rowText.includes("срібло") || rowText.includes("сереб")) return "xag";
  if (rowText.includes("xpt") || rowText.includes("платина") || rowText.includes("platinum")) return "xpt";
  if (rowText.includes("xpd") || rowText.includes("палад") || rowText.includes("palladium")) return "xpd";
  return null;
}

function parseNumber(raw: string) {
  // забираємо пробіли/nbsp, приводимо кому до крапки
  const s = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");

  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
