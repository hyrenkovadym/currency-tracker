import { useEffect, useRef, useState } from "react";
import Sparkline from "../components/dashboard/Sparkline";
import StatPill from "../components/dashboard/StatPill";
import { fetch24hrTickers, fetchSparkline } from "../services/binance/binance.api";
import { fetchNbuRates } from "../services/nbu/nbu.api";
import { fetchNbuExchangeSeries } from "../services/nbu/nbu-exchange.api";

type CryptoPreview = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  spark: number[];
};

type FxPreview = {
  pair: string; // USD/UAH
  rate: number;
  change: number; // %
};

type MetalPreview = {
  symbol: string; // XAU/UAH
  name: string; // Золото
  price: number; // UAH
  change: number; // %
  spark: number[]; // останні N точок
};

const POLL_MS = 10_000;

const NAME_MAP: Record<string, string> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  BNBUSDT: "BNB",
  SOLUSDT: "Solana",
  XRPUSDT: "XRP",
  DOGEUSDT: "Dogecoin",
  ADAUSDT: "Cardano",
  TRXUSDT: "TRON",
  TONUSDT: "Toncoin",
  MATICUSDT: "Polygon",
  LTCUSDT: "Litecoin",
  LINKUSDT: "Chainlink",
  DOTUSDT: "Polkadot",
  AVAXUSDT: "Avalanche",
  SHIBUSDT: "Shiba Inu",
};

function isUsdtPair(symbol: string) {
  return (
    symbol.endsWith("USDT") &&
    !symbol.includes("UPUSDT") &&
    !symbol.includes("DOWNUSDT") &&
    !symbol.includes("BULLUSDT") &&
    !symbol.includes("BEARUSDT")
  );
}

function toPercentChange(prev: number | null, next: number) {
  if (!prev || !Number.isFinite(prev) || prev === 0) return 0;
  return ((next - prev) / prev) * 100;
}

export default function DashboardPage() {
  // --- CRYPTO (популярні) ---
  const [popularCrypto, setPopularCrypto] = useState<CryptoPreview[]>([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularError, setPopularError] = useState<string | null>(null);

  // --- CRYPTO (топ росту) ---
  const [moversCrypto, setMoversCrypto] = useState<CryptoPreview[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);
  const [moversError, setMoversError] = useState<string | null>(null);

  // --- FX ---
  const [fxRates, setFxRates] = useState<FxPreview[]>([
    { pair: "USD/UAH", rate: 0, change: 0 },
    { pair: "EUR/UAH", rate: 0, change: 0 },
    { pair: "PLN/UAH", rate: 0, change: 0 },
  ]);
  const [fxLoading, setFxLoading] = useState(true);
  const [fxError, setFxError] = useState<string | null>(null);

  // --- METALS (НБУ) ---
  const [metals, setMetals] = useState<MetalPreview[]>([]);
  const [metalsLoading, setMetalsLoading] = useState(true);
  const [metalsError, setMetalsError] = useState<string | null>(null);

  // --- updated time ---
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // кеш sparklines (для крипти через Binance klines)
  const sparkCacheRef = useRef<Record<string, number[]>>({});

  // “замки” від паралельних запитів
  const loadingPopularRef = useRef(false);
  const loadingMoversRef = useRef(false);
  const loadingFxRef = useRef(false);
  const loadingMetalsRef = useRef(false);

  // для FX — пам’ятаємо попередні значення, щоб рахувати %
  const fxPrevRef = useRef<Record<string, number>>({});

  async function getSpark(symbol: string, signal?: AbortSignal) {
    const cached = sparkCacheRef.current[symbol];
    if (cached) return cached;

    try {
      const spark = await fetchSparkline(symbol, signal);
      sparkCacheRef.current[symbol] = spark;
      return spark;
    } catch {
      return [];
    }
  }

  async function loadPopularCrypto(signal?: AbortSignal) {
    if (loadingPopularRef.current) return;
    loadingPopularRef.current = true;

    try {
      const all = await fetch24hrTickers(signal);

      const top = all
        .filter((t) => isUsdtPair(t.symbol))
        .map((t) => ({
          symbol: t.symbol,
          price: Number(t.lastPrice),
          change24h: Number(t.priceChangePercent),
          quoteVolume: Number(t.quoteVolume),
        }))
        .filter(
          (x) =>
            Number.isFinite(x.price) &&
            Number.isFinite(x.change24h) &&
            Number.isFinite(x.quoteVolume)
        )
        .sort((a, b) => b.quoteVolume - a.quoteVolume)
        .slice(0, 5);

      const result: CryptoPreview[] = [];
      for (const item of top) {
        const spark = await getSpark(item.symbol, signal);
        result.push({
          symbol: item.symbol,
          name: NAME_MAP[item.symbol] ?? item.symbol.replace("USDT", ""),
          price: item.price,
          change24h: item.change24h,
          spark,
        });
      }

      setPopularCrypto(result);
    } finally {
      loadingPopularRef.current = false;
    }
  }

  async function loadMoversCrypto(signal?: AbortSignal) {
    if (loadingMoversRef.current) return;
    loadingMoversRef.current = true;

    try {
      const all = await fetch24hrTickers(signal);

      const top = all
        .filter((t) => isUsdtPair(t.symbol))
        .map((t) => ({
          symbol: t.symbol,
          price: Number(t.lastPrice),
          change24h: Number(t.priceChangePercent),
          quoteVolume: Number(t.quoteVolume),
        }))
        .filter(
          (x) =>
            Number.isFinite(x.price) &&
            Number.isFinite(x.change24h) &&
            Number.isFinite(x.quoteVolume) &&
            x.quoteVolume > 500_000
        )
        .sort((a, b) => b.change24h - a.change24h)
        .slice(0, 5);

      const result: CryptoPreview[] = [];
      for (const item of top) {
        const spark = await getSpark(item.symbol, signal);
        result.push({
          symbol: item.symbol,
          name: NAME_MAP[item.symbol] ?? item.symbol.replace("USDT", ""),
          price: item.price,
          change24h: item.change24h,
          spark,
        });
      }

      setMoversCrypto(result);
    } finally {
      loadingMoversRef.current = false;
    }
  }

  async function loadFx(signal?: AbortSignal) {
    if (loadingFxRef.current) return;
    loadingFxRef.current = true;

    try {
      const map = await fetchNbuRates(signal);

      const need = ["USD", "EUR", "PLN"];
      const next: FxPreview[] = [];

      for (const cc of need) {
        const r = map.get(cc);
        const rate = r?.rate ?? 0;
        const key = `${cc}/UAH`;

        const prev = fxPrevRef.current[key] ?? null;
        const change = rate ? toPercentChange(prev, rate) : 0;

        if (rate) fxPrevRef.current[key] = rate;

        next.push({ pair: key, rate, change });
      }

      setFxRates(next);
    } finally {
      loadingFxRef.current = false;
    }
  }

  // ✅ METALS: fetchNbuExchangeSeries -> [{t, v}]
  async function loadMetals(signal?: AbortSignal) {
    if (loadingMetalsRef.current) return;
    loadingMetalsRef.current = true;

    try {
      const [xau, xag] = await Promise.all([
        fetchNbuExchangeSeries({ valcode: "xau", daysBack: 10, signal }),
        fetchNbuExchangeSeries({ valcode: "xag", daysBack: 10, signal }),
      ]);

      const build = (rows: { t: number; v: number }[], name: string, symbol: string): MetalPreview | null => {
        if (!rows || rows.length === 0) return null;

        const points = rows.map((r) => Number(r.v)).filter((n) => Number.isFinite(n) && n > 0);
        if (points.length === 0) return null;

        const last = points[points.length - 1];
        const prev = points.length >= 2 ? points[points.length - 2] : null;
        const change = prev && prev !== 0 ? ((last - prev) / prev) * 100 : 0;

        return { symbol, name, price: last, change, spark: points };
      };

      const next: MetalPreview[] = [];
      const gold = build(xau, "Золото", "XAU/UAH");
      const silver = build(xag, "Срібло", "XAG/UAH");
      if (gold) next.push(gold);
      if (silver) next.push(silver);

      setMetals(next);
    } finally {
      loadingMetalsRef.current = false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let timerId: number | null = null;

    const safeMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
    const isAbort = (msg: string) => msg.toLowerCase().includes("aborted");

    (async () => {
      try {
        setPopularLoading(true);
        setMoversLoading(true);
        setFxLoading(true);
        setMetalsLoading(true);

        setPopularError(null);
        setMoversError(null);
        setFxError(null);
        setMetalsError(null);

        await Promise.all([
          loadPopularCrypto(controller.signal),
          loadMoversCrypto(controller.signal),
          loadFx(controller.signal),
          loadMetals(controller.signal),
        ]);

        setLastUpdated(Date.now());

        timerId = window.setInterval(async () => {
          try {
            await Promise.all([
              loadPopularCrypto(controller.signal),
              loadMoversCrypto(controller.signal),
              loadFx(controller.signal),
              loadMetals(controller.signal),
            ]);
            setLastUpdated(Date.now());
          } catch (e) {
            const msg = safeMessage(e);
            if (isAbort(msg)) return;
          }
        }, POLL_MS);
      } catch (e) {
        const msg = safeMessage(e);
        if (!isAbort(msg)) setPopularError(msg);
      } finally {
        setPopularLoading(false);
        setMoversLoading(false);
        setFxLoading(false);
        setMetalsLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (timerId) window.clearInterval(timerId);
    };
  }, []);

  return (
    <div>
      <div className="h1">Головна</div>

      <div className="muted" style={{ marginBottom: 12 }}>
        Оновлення ~ кожні 10 секунд
        {lastUpdated ? (
          <>
            {" "}
            · Останнє:{" "}
            {new Date(lastUpdated).toLocaleTimeString("uk-UA", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </>
        ) : null}
      </div>

      <div className="dash-grid-2x2">
        {/* 1) Популярні криптовалюти */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Криптовалюти · популярні</div>
              <div className="muted">Топ за 24h обсягом (USDT)</div>
            </div>
            <a className="link" href="/crypto">Весь ринок →</a>
          </div>

          {popularError && <div className="error">{popularError}</div>}

          {popularLoading && popularCrypto.length === 0 ? (
            <div className="muted">Завантаження...</div>
          ) : (
            <CryptoTable items={popularCrypto} />
          )}
        </div>

        {/* 2) FX */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Курси валют</div>
              <div className="muted">Джерело: НБУ (UAH)</div>
            </div>
            <a className="link" href="/fx">Детальніше →</a>
          </div>

          {fxError && <div className="error">{fxError}</div>}

          {fxLoading && fxRates.every((x) => x.rate === 0) ? (
            <div className="muted">Завантаження...</div>
          ) : (
            <div className="list">
              {fxRates.map((f) => (
                <div key={f.pair} className="list-item">
                  <div>
                    <div className="asset-name">{f.pair}</div>
                    <div className="asset-sub">оновлення в реальному часі</div>
                  </div>
                  <div className="right">
                    <div>{f.rate ? f.rate.toFixed(2) : "—"}</div>
                    <div><StatPill value={f.change} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3) Крипто “рух” */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Криптовалюти · топ росту</div>
              <div className="muted">Найбільша зміна за 24h</div>
            </div>
            <a className="link" href="/crypto">Дивитись →</a>
          </div>

          {moversError && <div className="error">{moversError}</div>}

          {moversLoading && moversCrypto.length === 0 ? (
            <div className="muted">Завантаження...</div>
          ) : (
            <CryptoTable items={moversCrypto} />
          )}
        </div>

        {/* 4) Метали */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Метали</div>
              <div className="muted">Джерело: НБУ (інвест. метали)</div>
            </div>
            <a className="link" href="/metals">Детальніше →</a>
          </div>

          {metalsError && <div className="error">{metalsError}</div>}

          {metalsLoading && metals.length === 0 ? (
            <div className="muted">Завантаження...</div>
          ) : (
            <div className="list">
              {metals.map((m) => (
                <div key={m.symbol} className="list-item">
                  <div>
                    <div className="asset-name">{m.name}</div>
                    <div className="asset-sub">{m.symbol}</div>
                  </div>

                  <div className="right">
                    <div>{formatNumber(m.price)}</div>
                    <div className="dash-inline">
                      <StatPill value={m.change} />
                      <span className="spark">
                        <Sparkline points={m.spark.length ? m.spark : [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="muted" style={{ marginTop: 10 }}>
            Примітка: ціни в UAH, спарклайн — останні 10 днів (НБУ).
          </div>
        </div>
      </div>
    </div>
  );
}

/** Спільна таблиця для крипти */
function CryptoTable({ items }: { items: CryptoPreview[] }) {
  return (
    <div className="table">
      <div className="row header">
        <div>Актив</div>
        <div className="right">Ціна</div>
        <div className="right">24h</div>
        <div className="right">Тренд</div>
      </div>

      {items.map((c) => (
        <div key={c.symbol} className="row">
          <div className="cell-asset">
            <div className="asset-name">{c.name}</div>
            <div className="asset-sub">{c.symbol}</div>
          </div>

          <div className="right">{formatNumber(c.price)}</div>
          <div className="right">
            <StatPill value={c.change24h} />
          </div>

          <div className="right spark">
            <Sparkline points={c.spark.length ? c.spark : [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]} />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}
