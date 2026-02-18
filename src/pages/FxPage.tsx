import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetchNbuSpotRates } from "../services/nbu/nbu.api";
import { loadWatchlist, saveWatchlist } from "../store/watchlist/watchlist.storage";

type Row = {
  base: string;      // "USD"
  name: string;      // "Долар США"
  rateUAH: number;   // курс до UAH
  date: string;      // дата НБУ
  changePoll: number; // % від попереднього опитування
};

type SortKey = "base" | "rateUAH" | "changePoll";
type SortDir = "asc" | "desc";

const POLL_MS = 10_000;
const PAGE_SIZE = 20;

function toPercentChange(prev: number | null, next: number) {
  if (!prev || !Number.isFinite(prev) || prev === 0) return 0;
  return ((next - prev) / prev) * 100;
}

export default function FxPage() {
  const nav = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("base");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const [watch, setWatch] = useState<string[]>(() => loadWatchlist());
  const loadingRef = useRef(false);

  // пам’ять попередніх значень щоб рахувати Δ(poll)
  const prevRef = useRef<Record<string, number>>({});

  function toggleWatch(base: string) {
    setWatch((prev) => {
      const next = prev.includes(base) ? prev.filter((x) => x !== base) : [...prev, base];
      saveWatchlist(next);
      return next;
    });
  }

  async function load(signal?: AbortSignal) {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const map = await fetchNbuSpotRates(signal);

      const next: Row[] = [];
      for (const [cc, v] of map.entries()) {
        // UAH теж можемо показувати, але зазвичай не потрібно — можеш прибрати
        if (!cc || !v?.rate) continue;

        const prev = prevRef.current[cc] ?? null;
        const change = toPercentChange(prev, v.rate);
        prevRef.current[cc] = v.rate;

        next.push({
          base: cc,
          name: v.name,
          rateUAH: v.rate,
          date: v.date,
          changePoll: change,
        });
      }

      setRows(next);
      setErr(null);
      setLastUpdated(Date.now());
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
          } catch {
            // дрібні фейли не миготимо
          }
        }, POLL_MS);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (id) window.clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return rows;
    return rows.filter((r) => r.base.includes(q) || r.name.toUpperCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const mul = sortDir === "desc" ? -1 : 1;

    copy.sort((a, b) => {
      if (sortKey === "base") return a.base.localeCompare(b.base) * mul;
      return (a[sortKey] - b[sortKey]) * mul;
    });

    return copy;
  }, [filtered, sortKey, sortDir]);

  const withPinned = useMemo(() => {
    if (!watch.length) return sorted;
    const set = new Set(watch);
    const pinned: Row[] = [];
    const rest: Row[] = [];
    for (const r of sorted) (set.has(r.base) ? pinned : rest).push(r);
    return [...pinned, ...rest];
  }, [sorted, watch]);

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

  function goPrev() {
    setPage((p) => Math.max(1, p - 1));
  }
  function goNext() {
    setPage((p) => Math.min(totalPages, p + 1));
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">Курси валют</div>
          <div className="muted">
            Дані: НБУ · оновлення кожні {Math.round(POLL_MS / 1000)}с
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

        <div className="pager mini">
          <button className="btn ghost" type="button" onClick={goPrev} disabled={page <= 1}>
            ←
          </button>
          <div className="pager-info">{page} / {totalPages}</div>
          <button className="btn ghost" type="button" onClick={goNext} disabled={page >= totalPages}>
            →
          </button>
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
              placeholder="Пошук: USD, EUR..."
            />
          </div>

          <div className="ctrl">
            <label className="muted">Сортування</label>
            <select
              className="select"
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setPage(1);
              }}
            >
              <option value="base">Валюта</option>
              <option value="rateUAH">Курс</option>
              <option value="changePoll">Зміна</option>
            </select>
          </div>

          <div className="ctrl">
            <label className="muted">Напрям</label>
            <select
              className="select"
              value={sortDir}
              onChange={(e) => {
                setSortDir(e.target.value as SortDir);
                setPage(1);
              }}
            >
              <option value="asc">Зростання</option>
              <option value="desc">Спадання</option>
            </select>
          </div>
        </div>

        {err && <div className="error">{err}</div>}
        {loading && rows.length === 0 ? <div className="muted">Завантаження...</div> : null}

        <div className="market-table">
          <div className="row header">
            <div>Пара</div>
            <div className="right">Курс</div>
            <div className="right">Δ (poll)</div>
            <div className="right">Дата НБУ</div>
            <div className="right">★</div>
          </div>

          {view.map((r) => (
            <div
              key={r.base}
              className="row clickable"
              onClick={() => nav(`/fx/${r.base}`)}
              role="button"
              tabIndex={0}
            >
              <div className="cell-asset">
                <div className="asset-name">{r.base} / UAH</div>
                <div className="asset-sub">{r.name}</div>
              </div>

              <div className="right">{formatNumber(r.rateUAH)}</div>

              <div className="right">
                <StatPill value={r.changePoll} />
              </div>

              <div className="right muted">{r.date || "—"}</div>

              <div className="right" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={"star " + (watch.includes(r.base) ? "on" : "")}
                  onClick={() => toggleWatch(r.base)}
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
            Показано {Math.min(PAGE_SIZE, view.length)} з {total} · Обрані (★) завжди зверху
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
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}
