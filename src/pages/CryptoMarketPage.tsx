// src/pages/CryptoMarketPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetch24hrTickers } from "../services/binance/binance.api";
import { loadWatchlist, saveWatchlist } from "../store/watchlist/watchlist.storage";

type Row = {
  symbol: string;
  base: string;
  quote: string; // завжди "USDT"
  price: number;
  change24h: number;
  quoteVolume: number;
  high: number;
  low: number;
};

type SortKey = "quoteVolume" | "change24h" | "price";
type SortDir = "desc" | "asc";

const POLL_MS = 5000;
const PAGE_SIZE = 20;

function isCleanUsdtPair(symbol: string) {
  const s = symbol.toUpperCase();
  return (
    s.endsWith("USDT") &&
    !s.includes("UPUSDT") &&
    !s.includes("DOWNUSDT") &&
    !s.includes("BULLUSDT") &&
    !s.includes("BEARUSDT")
  );
}

function parseNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isAbortError(e: unknown) {
  if (!e) return false;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes("aborted");
}

export default function CryptoMarketPage() {
  const nav = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [page, setPage] = useState(1);
  const [watch, setWatch] = useState<string[]>(() => loadWatchlist());

  const loadingRef = useRef(false);

  function toggleWatch(symbol: string) {
    setWatch((prev) => {
      const next = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      saveWatchlist(next);
      return next;
    });
  }

  async function load(signal?: AbortSignal) {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const all = await fetch24hrTickers(signal);

      const mapped: Row[] = all
        .filter((t) => isCleanUsdtPair(t.symbol))
        .map((t) => {
          const symbol = t.symbol.toUpperCase();
          const base = symbol.replace("USDT", "");
          return {
            symbol,
            base,
            quote: "USDT",
            price: parseNum(t.lastPrice),
            change24h: parseNum(t.priceChangePercent),
            quoteVolume: parseNum(t.quoteVolume),
            high: parseNum(t.highPrice),
            low: parseNum(t.lowPrice),
          };
        })
        .filter((r) => r.price > 0 && r.quoteVolume > 0);

      setRows(mapped);
      setLastUpdated(Date.now());
      setErr(null);
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let id: number | null = null;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        await load(controller.signal);

        id = window.setInterval(async () => {
          try {
            await load(controller.signal);
          } catch (e) {
            if (!isAbortError(e)) {
              // мовчимо, щоб UI не мигав
            }
          }
        }, POLL_MS);
      } catch (e) {
        if (!isAbortError(e)) setErr(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (id) window.clearInterval(id);
    };
  }, []);

  // 1) Пошук
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.base.includes(q) || r.symbol.includes(q));
  }, [rows, query]);

  // 2) Сортування
  const sorted = useMemo(() => {
    const copy = [...filtered];
    const mul = sortDir === "desc" ? -1 : 1;
    copy.sort((a, b) => (a[sortKey] - b[sortKey]) * mul);
    return copy;
  }, [filtered, sortKey, sortDir]);

  // 3) Watchlist зверху
  const withPinned = useMemo(() => {
    if (!watch.length) return sorted;
    const watchSet = new Set(watch);
    const pinned: Row[] = [];
    const rest: Row[] = [];

    for (const r of sorted) {
      if (watchSet.has(r.symbol)) pinned.push(r);
      else rest.push(r);
    }
    return [...pinned, ...rest];
  }, [sorted, watch]);

  // 4) Пагінація
  const total = withPinned.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  const view = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return withPinned.slice(start, start + PAGE_SIZE);
  }, [withPinned, page]);

  const topStats = useMemo(() => {
    const totalPairs = rows.length;
    const topVol = [...rows].sort((a, b) => b.quoteVolume - a.quoteVolume)[0];
    const topGainer = [...rows].sort((a, b) => b.change24h - a.change24h)[0];

    return {
      totalPairs,
      topVol: topVol ? `${topVol.base} · ${formatCompact(topVol.quoteVolume)} USDT` : "—",
      topGainer: topGainer ? `${topGainer.base} · ${topGainer.change24h.toFixed(2)}%` : "—",
    };
  }, [rows]);

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }
  function goNext() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  function openSymbol(symbol: string) {
    nav(`/crypto/${symbol}`);
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">Ринок криптовалют</div>
          <div className="muted">
            Live · оновлення кожні {Math.round(POLL_MS / 1000)}с 
            {lastUpdated ? (
              <>
                {" "}
                · Оновлено:{" "}
                {new Date(lastUpdated).toLocaleTimeString("uk-UA", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </>
            ) : null}
          </div>
        </div>

        <div className="mini-stats">
          <div className="mini-stat">
            <div className="muted">Кількість монет</div>
            <div className="value">{topStats.totalPairs}</div>
          </div>
          <div className="mini-stat">
            <div className="muted">Топ обсяг</div>
            <div className="value">{topStats.topVol}</div>
          </div>
          <div className="mini-stat">
            <div className="muted">Топ зростання</div>
            <div className="value">{topStats.topGainer}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="market-controls">
          <div className="search">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Пошук: BTC, ETH, SOL..."
            />
          </div>

          <div className="ctrl">
            <label className="ctrl-label">Сортування</label>
            <div className="select">
              <select
                value={sortKey}
                onChange={(e) => {
                  setSortKey(e.target.value as SortKey);
                  setPage(1);
                }}
              >
                <option value="quoteVolume">Обсяг (USDT)</option>
                <option value="change24h">Зміна 24h</option>
                <option value="price">Ціна</option>
              </select>
              <span className="select-icon">▾</span>
            </div>
          </div>

          <div className="ctrl">
            <label className="ctrl-label">Напрям</label>
            <div className="select">
              <select
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value as SortDir);
                  setPage(1);
                }}
              >
                <option value="desc">Спадання</option>
                <option value="asc">Зростання</option>
              </select>
              <span className="select-icon">▾</span>
            </div>
          </div>

          <div className="ctrl">
            <label className="ctrl-label">Сторінка</label>
            <div className="pager">
              <button className="btn ghost" type="button" onClick={goPrev} disabled={page <= 1}>
                ←
              </button>
              <div className="pager-info">
                {page} / {totalPages}
              </div>
              <button className="btn ghost" type="button" onClick={goNext} disabled={page >= totalPages}>
                →
              </button>
            </div>
          </div>
        </div>

        {err && !err.toLowerCase().includes("aborted") ? <div className="error">{err}</div> : null}
        {loading && rows.length === 0 ? <div className="muted">Завантаження...</div> : null}

        <div className="market-table">
          <div className="row header">
            <div>Актив</div>
            <div className="right">Ціна</div>
            <div className="right">24h</div>
            <div className="right">Обсяг</div>
            <div className="right">High / Low</div>
            <div className="right">★</div>
          </div>

          {view.map((r) => (
            <div
              key={r.symbol}
              className="row clickable"
              role="button"
              tabIndex={0}
              onClick={() => openSymbol(r.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openSymbol(r.symbol);
              }}
            >
              <div className="cell-asset">
                <div className="asset-name">{r.base}</div>
                <div className="asset-sub">{r.symbol}</div>
              </div>

              <div className="right">{formatNumber(r.price)}</div>

              <div className="right">
                <StatPill value={r.change24h} />
              </div>

              <div className="right">{formatCompact(r.quoteVolume)} USDT</div>

              <div className="right muted">
                {formatNumber(r.high)} / {formatNumber(r.low)}
              </div>

              <div className="right">
                <button
                  type="button"
                  className={"star " + (watch.includes(r.symbol) ? "on" : "")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatch(r.symbol);
                  }}
                  title="Додати у watchlist"
                >
                  ★
                </button>
              </div>
            </div>
          ))}

          {view.length === 0 && !loading ? (
            <div className="muted" style={{ padding: 14 }}>
              Нічого не знайдено.
            </div>
          ) : null}
        </div>

        <div className="market-footer">
          <div className="muted">
            Показано {view.length} з {total} · Обрані (★) завжди зверху
          </div>

          <div className="pager">
            <button className="btn ghost" type="button" onClick={goPrev} disabled={page <= 1}>
              Назад
            </button>
            <div className="pager-info">
              {page} / {totalPages}
            </div>
            <button className="btn ghost" type="button" onClick={goNext} disabled={page >= totalPages}>
              Далі
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
}

function formatCompact(n: number) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(0);
}
