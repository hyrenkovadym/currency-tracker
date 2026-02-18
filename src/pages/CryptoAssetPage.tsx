// src/pages/CryptoAssetPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetch24hrTickerOne, fetchKlinesSeries } from "../services/binance/binance.api";
import type { KlineInterval } from "../services/binance/binance.types";

type RangeKey = "24h" | "7d" | "30d" | "1y";

const RANGE_MAP: Record<RangeKey, { interval: KlineInterval; limit: number; label: string }> = {
  "24h": { interval: "15m", limit: 96, label: "24H" },
  "7d": { interval: "1h", limit: 168, label: "7D" },
  "30d": { interval: "4h", limit: 180, label: "30D" },
  "1y": { interval: "1d", limit: 365, label: "1Y" },
};

function isAbortError(e: unknown) {
  if (!e) return false;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes("aborted");
}

export default function CryptoAssetPage() {
  const { symbol: raw } = useParams();
  const symbol = (raw ?? "").toUpperCase(); // BTCUSDT
  const nav = useNavigate();

  const [range, setRange] = useState<RangeKey>("24h");

  const [price, setPrice] = useState<number | null>(null);
  const [change24h, setChange24h] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [low, setLow] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);

  const [series, setSeries] = useState<{ time: number; close: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const lockRef = useRef(false);

  async function loadAll(signal?: AbortSignal) {
    if (!symbol) return;
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setErr(null);

      const t = await fetch24hrTickerOne(symbol, signal);
      setPrice(t.price);
      setChange24h(t.change24h);
      setHigh(t.high);
      setLow(t.low);
      setVolume(t.quoteVolume);

      const cfg = RANGE_MAP[range];
      const s = await fetchKlinesSeries(symbol, cfg.interval, cfg.limit, signal);
      setSeries(s);
    } finally {
      lockRef.current = false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        await loadAll(controller.signal);
      } catch (e) {
        if (!isAbortError(e)) setErr(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, range]);

  const title = useMemo(() => {
    if (!symbol) return "Монета";
    // як було раніше: показуємо .../USDT
    return symbol.endsWith("USDT") ? `${symbol.replace("USDT", "")} / USDT` : symbol;
  }, [symbol]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">{title}</div>
          <div className="muted">Дані: Binance · графік: {RANGE_MAP[range].label}</div>
        </div>

        <div className="topbar-actions">
          <button className="btn ghost" type="button" onClick={() => nav("/crypto")}>
            ← Назад до ринку
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="asset-head">
          <div className="asset-price">
            <div className="muted">Остання ціна</div>
            <div className="asset-price-value">{price != null ? formatNumber(price) : "—"}</div>
          </div>

          <div className="asset-metrics">
            <div className="metric">
              <div className="muted">24h</div>
              <div>{change24h != null ? <StatPill value={change24h} /> : "—"}</div>
            </div>
            <div className="metric">
              <div className="muted">High</div>
              <div>{high != null ? formatNumber(high) : "—"}</div>
            </div>
            <div className="metric">
              <div className="muted">Low</div>
              <div>{low != null ? formatNumber(low) : "—"}</div>
            </div>
            <div className="metric">
              <div className="muted">Обсяг (USDT)</div>
              <div>{volume != null ? formatCompact(volume) : "—"}</div>
            </div>
          </div>
        </div>

        <div className="range-tabs">
          {(["24h", "7d", "30d", "1y"] as RangeKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={"tab " + (range === k ? "on" : "")}
              onClick={() => setRange(k)}
            >
              {RANGE_MAP[k].label}
            </button>
          ))}
        </div>

        {err && <div className="error">{err}</div>}
        {loading && series.length === 0 ? <div className="muted">Завантаження графіка...</div> : null}

        <div className="chart-wrap">
          <HoverLineChart series={series} />
        </div>
      </div>
    </div>
  );
}

/**
 * Hover (як було): індекс по X, tooltip по реальному часу (openTime)
 */
function HoverLineChart({ series }: { series: { time: number; close: number }[] }) {
  const w = 1000;
  const h = 260;
  const pad = 16;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!series || series.length < 2) {
    return <div className="muted" style={{ padding: 14 }}>Немає даних для графіка.</div>;
  }

  const points = series.map((p) => p.close);
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const step = (w - pad * 2) / (points.length - 1);

  const toXY = (v: number, i: number) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return { x, y };
  };

  const d = points
    .map((v, i) => {
      const { x, y } = toXY(v, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const local = pt.matrixTransform(ctm.inverse());

    let idx = Math.round((local.x - pad) / step);
    idx = Math.max(0, Math.min(points.length - 1, idx));
    setHoverIdx(idx);
  };

  const onLeave = () => setHoverIdx(null);

  const hover =
    hoverIdx != null
      ? (() => {
          const v = points[hoverIdx];
          const t = series[hoverIdx]?.time ?? Date.now();
          const dt = new Date(t);
          const { x, y } = toXY(v, hoverIdx);
          return {
            v,
            x,
            y,
            label: dt.toLocaleString("uk-UA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        })()
      : null;

  return (
    <div style={{ position: "relative" }}>
      {hover ? (
        <div
          className="chart-tooltip"
          style={{
            position: "absolute",
            left: `${(hover.x / w) * 100}%`,
            top: `${(hover.y / h) * 100}%`,
            transform: "translate(12px, -12px)",
            pointerEvents: "none",
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>{hover.label}</div>
          <div style={{ fontSize: 14 }}>{formatNumber(hover.v)}</div>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="big-chart"
        role="img"
        aria-label="Графік ціни"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <path d={d} className="big-chart-line" />

        {hover ? (
          <>
            <line x1={hover.x} y1={pad} x2={hover.x} y2={h - pad} className="big-chart-cross" />
            <circle cx={hover.x} cy={hover.y} r={4} className="big-chart-dot" />
          </>
        ) : null}
      </svg>
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
