// src/pages/MetalAssetPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetchMetalSeries } from "../services/metals/metals.api";

type MetalCode = "xau" | "xag" | "xpt" | "xpd";
type RangeKey = "10d" | "30d" | "90d" | "1y";

const METAL_META: Record<MetalCode, { name: string; code: string }> = {
  xau: { name: "Золото", code: "XAU" },
  xag: { name: "Срібло", code: "XAG" },
  xpt: { name: "Платина", code: "XPT" },
  xpd: { name: "Паладій", code: "XPD" },
};

const RANGE_DAYS: Record<RangeKey, { daysBack: number; label: string }> = {
  "10d": { daysBack: 10, label: "10D" },
  "30d": { daysBack: 30, label: "30D" },
  "90d": { daysBack: 90, label: "90D" },
  "1y": { daysBack: 365, label: "1Y" },
};

function isAbortError(e: unknown) {
  if (!e) return false;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes("aborted");
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function MetalAssetPage() {
  const { metal: raw } = useParams();
  const metal = (raw ?? "").toLowerCase() as MetalCode;
  const nav = useNavigate();

  const meta = METAL_META[metal];

  const [range, setRange] = useState<RangeKey>("10d");
  const [series, setSeries] = useState<{ time: number; close: number }[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const lockRef = useRef(false);

  async function loadAll(signal?: AbortSignal) {
    if (!meta) return;
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setErr(null);

      const cfg = RANGE_DAYS[range];
      const pts = await fetchMetalSeries({
        metal: metal,
        daysBack: cfg.daysBack,
        signal,
      });

      const values = (pts || [])
        .map((p: any) => ({ t: Number(p.t), v: Number(p.v) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.v > 0);

      if (values.length === 0) {
        setSeries([]);
        setPrice(null);
        setChange(null);
        return;
      }

      const last = values[values.length - 1].v;
      const prev = values.length >= 2 ? values[values.length - 2].v : null;
      const ch = prev && prev !== 0 ? ((last - prev) / prev) * 100 : 0;

      setPrice(last);
      setChange(ch);

      setSeries(values.map((p) => ({ time: p.t, close: p.v })));
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
  }, [metal, range]);

  const title = useMemo(() => {
    if (!meta) return "Метал";
    return `${meta.name} · ${meta.code}/UAH`;
  }, [meta]);

  if (!meta) {
    return (
      <div className="card">
        <div className="error">Невідомий метал: {String(raw)}</div>
        <button className="btn ghost" type="button" onClick={() => nav("/metals")}>
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">{title}</div>
          <div className="muted">Джерело: НБУ (інвест. метали) · графік: {RANGE_DAYS[range].label}</div>
        </div>

        <div className="topbar-actions">
          <button className="btn ghost" type="button" onClick={() => nav("/metals")}>
            ← Назад до металів
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
              <div className="muted">Δ (останній день)</div>
              <div>{change != null ? <StatPill value={change} /> : "—"}</div>
            </div>
          </div>
        </div>

        <div className="range-tabs">
          {(Object.keys(RANGE_DAYS) as RangeKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={"tab " + (range === k ? "on" : "")}
              onClick={() => setRange(k)}
            >
              {RANGE_DAYS[k].label}
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

  const hover = hoverIdx != null
    ? (() => {
        const v = points[hoverIdx];
        const t = series[hoverIdx]?.time ?? Date.now();
        const dt = new Date(t);
        const { x, y } = toXY(v, hoverIdx);
        return {
          v,
          x,
          y,
          label: dt.toLocaleDateString("uk-UA", { year: "numeric", month: "2-digit", day: "2-digit" }),
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
