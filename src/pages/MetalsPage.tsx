// src/pages/MetalsPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatPill from "../components/dashboard/StatPill";
import { fetchNbuExchangeSeries } from "../services/nbu/nbu-exchange.api";

type MetalCode = "xau" | "xag" | "xpt" | "xpd";

const METAL_META: Record<MetalCode, { name: string; code: string }> = {
  xau: { name: "Золото", code: "XAU" },
  xag: { name: "Срібло", code: "XAG" },
  xpt: { name: "Платина", code: "XPT" },
  xpd: { name: "Паладій", code: "XPD" },
};

type Row = {
  key: MetalCode;
  name: string;
  price: number;
  change: number;
};

const POLL_MS = 10_000;

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

export default function MetalsPage() {
  const nav = useNavigate();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const lockRef = useRef(false);

  async function load(signal?: AbortSignal) {
    if (lockRef.current) return;
    lockRef.current = true;

    try {
      setErr(null);

      const metals = Object.keys(METAL_META) as MetalCode[];

      const tasks = metals.map(async (key) => {
        const pts = await fetchNbuExchangeSeries({
          valcode: key,
          daysBack: 10,
          signal,
        });

        if (!pts.length) return null;

        const last = pts[pts.length - 1].v;
        const prev = pts.length >= 2 ? pts[pts.length - 2].v : 0;
        const change = prev ? ((last - prev) / prev) * 100 : 0;

        return { key, name: METAL_META[key].name, price: last, change } as Row;
      });

      const next = (await Promise.all(tasks)).filter(Boolean) as Row[];
      setRows(next);
      setLastUpdated(Date.now());
    } finally {
      lockRef.current = false;
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let id: number | null = null;

    (async () => {
      try {
        setLoading(true);
        await load(controller.signal);

        id = window.setInterval(async () => {
          try {
            await load(controller.signal);
          } catch (e) {
            if (!isAbortError(e)) {
              // не миготимо UI
            }
          }
        }, POLL_MS);
      } catch (e) {
        if (!isAbortError(e)) setErr(e instanceof Error ? e.message : "Помилка");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
      if (id) window.clearInterval(id);
    };
  }, []);

  const view = useMemo(() => rows, [rows]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="h1">Метали</div>
          <div className="muted">
            Джерело: НБУ (інвест. метали) · UAH
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
      </div>

      <div className="card">
        {err ? <div className="error">{err}</div> : null}
        {loading && view.length === 0 ? <div className="muted">Завантаження...</div> : null}

        <div className="list">
          {view.map((m) => (
            <div
              key={m.key}
              className="list-item"
              style={{ cursor: "pointer" }}
              onClick={() => nav(`/metals/${m.key}`)}
              title="Відкрити графік"
            >
              <div>
                <div className="asset-name">{m.name}</div>
                <div className="asset-sub">{METAL_META[m.key].code} / UAH</div>
              </div>

              <div className="right">
                <div>{formatNumber(m.price)}</div>
                <div><StatPill value={m.change} /></div>
              </div>
            </div>
          ))}
        </div>

        {!loading && view.length === 0 ? (
          <div className="muted" style={{ padding: 14 }}>
            Завантаження... (JSON).
          </div>
        ) : null}
      </div>
    </div>
  );
}
