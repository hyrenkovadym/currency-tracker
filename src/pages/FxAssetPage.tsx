import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetchNbuRates } from "../services/nbu/nbu.api";
import { fetchNbuExchangeSeries } from "../services/nbu/nbu-exchange.api";

type RangeKey = "7d" | "30d" | "1y";

const RANGE: Record<RangeKey, { days: number; label: string }> = {
  "7d": { days: 7, label: "7D" },
  "30d": { days: 30, label: "30D" },
  "1y": { days: 365, label: "1Y" },
};

function isAbortError(e: unknown) {
  if (!e) return false;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes("aborted");
}

export default function FxAssetPage() {
  const { base: rawBase } = useParams();
  const base = (rawBase ?? "usd").toLowerCase();
  const nav = useNavigate();

  const [range, setRange] = useState<RangeKey>("30d");
  const [quote, setQuote] = useState<string>("uah");

  const [spot, setSpot] = useState<number | null>(null);
  const [deltaPoll, setDeltaPoll] = useState<number>(0);
  const [deltaRange, setDeltaRange] = useState<number>(0);
  const [nbuDate, setNbuDate] = useState<string>("—");

  const [series, setSeries] = useState<{ t: number; v: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const prevSpotRef = useRef<number | null>(null);
  const [ccList, setCcList] = useState<string[]>(["uah"]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setErr(null);

        // 1) список валют (spot)
        const rates = await fetchNbuRates(controller.signal);
        const all = ["uah", ...Array.from(rates.keys()).map((x) => x.toLowerCase())]
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort();

        setCcList(all);

        // 2) поточний курс base/quote через UAH
        const baseRow = rates.get(base.toUpperCase());
        const quoteRow = quote === "uah" ? null : rates.get(quote.toUpperCase());

        const baseUAH = base === "uah" ? 1 : (baseRow?.rate ?? 0);
        const quoteUAH = quote === "uah" ? 1 : (quoteRow?.rate ?? 0);

        const nextSpot = baseUAH > 0 && quoteUAH > 0 ? baseUAH / quoteUAH : null;

        const prev = prevSpotRef.current;
        const pollDelta = prev && nextSpot ? ((nextSpot - prev) / prev) * 100 : 0;

        prevSpotRef.current = nextSpot;
        setSpot(nextSpot);
        setDeltaPoll(pollDelta);

        const dateStr = (baseRow as any)?.exchangedate ?? (baseRow as any)?.date ?? null;
        setNbuDate(dateStr ? String(dateStr) : "—");
      } catch (e) {
        if (!isAbortError(e)) setErr(e instanceof Error ? e.message : "Помилка");
      }

      // 3) series (через exchange_site -> через proxy)
      try {
        setLoading(true);
        setErr(null);

        const days = RANGE[range].days;

        const baseS =
          base === "uah"
            ? []
            : await fetchNbuExchangeSeries({ valcode: base, daysBack: days, signal: controller.signal });

        const quoteS =
          quote === "uah"
            ? []
            : await fetchNbuExchangeSeries({ valcode: quote, daysBack: days, signal: controller.signal });

        const qMap = new Map<number, number>(quoteS.map((p) => [p.t, p.v]));

        const merged =
          quote === "uah"
            ? baseS
            : (baseS
                .map((p) => {
                  const q = qMap.get(p.t);
                  if (!q || q <= 0) return null;
                  return { t: p.t, v: p.v / q };
                })
                .filter(Boolean) as { t: number; v: number }[]);

        setSeries(merged);

        if (merged.length >= 2) {
          const first = merged[0].v;
          const last = merged[merged.length - 1].v;
          setDeltaRange(first ? ((last - first) / first) * 100 : 0);
        } else {
          setDeltaRange(0);
        }
      } catch (e) {
        if (!isAbortError(e)) setErr(e instanceof Error ? e.message : "Помилка графіка");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [base, quote, range]);

  const title = useMemo(() => `${base.toUpperCase()} / ${quote.toUpperCase()}`, [base, quote]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">{title}</div>
          <div className="muted">Дані: НБУ · графік: {RANGE[range].label}</div>
        </div>

        <div className="topbar-actions">
          <button className="btn ghost" type="button" onClick={() => nav("/fx")}>
            ← Назад до валют
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="asset-head">
          <div className="asset-price">
            <div className="muted">Поточний курс</div>
            <div className="asset-price-value">{spot != null ? formatNumber(spot) : "—"}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {base.toUpperCase()} → {quote.toUpperCase()}
            </div>
          </div>

          <div className="asset-metrics">
            <div className="metric">
              <div className="muted">Δ (poll)</div>
              <div>
                <StatPill value={deltaPoll} />
              </div>
            </div>
            <div className="metric">
              <div className="muted">Δ (range)</div>
              <div>
                <StatPill value={deltaRange} />
              </div>
            </div>
            <div className="metric">
              <div className="muted">Дата НБУ</div>
              <div>{nbuDate}</div>
            </div>
          </div>
        </div>

        <div className="market-controls" style={{ marginTop: 10 }}>
          <div className="ctrl" style={{ minWidth: 240 }}>
            <label className="muted">Quote</label>
            <select value={quote} onChange={(e) => setQuote(e.target.value)}>
              {ccList.map((cc) => (
                <option key={cc} value={cc}>
                  {cc.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="range-tabs" style={{ marginLeft: "auto" }}>
            {(Object.keys(RANGE) as RangeKey[]).map((k) => (
              <button
                key={k}
                type="button"
                className={"tab " + (range === k ? "on" : "")}
                onClick={() => setRange(k)}
              >
                {RANGE[k].label}
              </button>
            ))}
          </div>
        </div>

        {err && <div className="error">{err}</div>}
        {loading && series.length === 0 ? <div className="muted">Завантаження графіка...</div> : null}

        <div className="chart-wrap">
          <HoverLineChart points={series} />
        </div>
      </div>
    </div>
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * ✅ ВАЖЛИВО:
 * - координати миші конвертуємо в SVG-координати через getScreenCTM().inverse()
 * - тоді вертикальна лінія буде 1:1 під курсором (без зсувів від масштабування/letterbox)
 */
function HoverLineChart({ points }: { points: { t: number; v: number }[] }) {
  const w = 1000;
  const h = 260;
  const pad = 16;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // позиція tooltip у пікселях відносно wrap (щоб tooltip йшов рівно за мишкою)
  const [tipLeftPx, setTipLeftPx] = useState<number>(0);
  const [tipTopPx, setTipTopPx] = useState<number>(0);

  // X лінії у координатах viewBox
  const [hoverX, setHoverX] = useState<number>(pad);

  if (!points || points.length < 2) {
    return <div className="muted" style={{ padding: 14 }}>Немає даних для графіка.</div>;
  }

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const step = (w - pad * 2) / (points.length - 1);

  const toXY = (v: number, i: number) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return { x, y };
  };

  const d = points
    .map((p, i) => {
      const { x, y } = toXY(p.v, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap) return;

    // 1) tooltip в пікселях (щоб не було розсинхрону)
    const wrapRect = wrap.getBoundingClientRect();
    setTipLeftPx(e.clientX - wrapRect.left);
    setTipTopPx(e.clientY - wrapRect.top);

    // 2) точне переведення clientX -> SVG viewBox X
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    const svgPt = pt.matrixTransform(ctm.inverse());

    // clamp в межах поля графіка
    const x = clamp(svgPt.x, pad, w - pad);
    setHoverX(x);

    const idx = Math.round((x - pad) / step);
    setHoverIdx(clamp(idx, 0, points.length - 1));
  };

  const onLeave = () => setHoverIdx(null);

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const dot = hoverIdx != null ? toXY(points[hoverIdx].v, hoverIdx) : null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {hover && dot ? (
        <div
          className="chart-tooltip"
          style={{
            position: "absolute",
            left: tipLeftPx,
            top: tipTopPx,
            transform: "translate(12px, -12px)",
            pointerEvents: "none",
          }}
        >
          <div className="muted" style={{ fontSize: 12 }}>
            {new Date(hover.t).toLocaleString("uk-UA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })}
          </div>
          <div style={{ fontSize: 14 }}>{formatNumber(hover.v)}</div>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="big-chart"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* path не має ловити hover */}
        <path d={d} className="big-chart-line" style={{ pointerEvents: "none" }} />

        {hoverIdx != null ? (
          <>
            {/* ✅ вертикальна лінія 1:1 під мишкою */}
            <line
              x1={hoverX}
              y1={pad}
              x2={hoverX}
              y2={h - pad}
              className="big-chart-cross"
              style={{ pointerEvents: "none" }}
            />

            {/* крапка на найближчій точці */}
            {dot ? (
              <circle
                cx={dot.x}
                cy={dot.y}
                r={4}
                className="big-chart-dot"
                style={{ pointerEvents: "none" }}
              />
            ) : null}
          </>
        ) : null}
      </svg>
    </div>
  );
}

function formatNumber(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
  if (n >= 1) return n.toFixed(6);
  return n.toFixed(6);
}
