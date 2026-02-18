import { useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/auth/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  "nav-link" + (isActive ? " active" : "");

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [aboutOpen, setAboutOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const authorInfo = useMemo(
    () => ({
      name: "Потапков Андрій",
      group: "5Пі-22б",
      topic:
        "Веб-застосунок для відстеження курсу валют / криптовалют та металів через API",
    }),
    []
  );

  function openAbout() {
    setAboutOpen(true);
    setStatus(null);
  }

  function closeAbout() {
    setAboutOpen(false);
    setStatus(null);
    setMessage("");
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    const text = message.trim();
    if (text.length < 5) {
      setStatus({ type: "err", text: "Напиши повідомлення (мінімум 5 символів)." });
      return;
    }

    try {
      setSending(true);

      // ✅ Тут буде бекенд, який реально відправляє на пошту.
      // На фронті ми просто шлемо POST. Пізніше зробиш endpoint на сервері.
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUser: user?.email ?? null,
          author: authorInfo,
          message: text,
          createdAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Помилка відправки: ${res.status}${t ? " · " + t : ""}`);
      }

      setStatus({ type: "ok", text: "Надіслано ✅" });
      setMessage("");
    } catch (err) {
      setStatus({
        type: "err",
        text:
          err instanceof Error
            ? err.message
            : "Не вдалося надіслати. Бекенд ще не підключено.",
      });
    } finally {
      setSending(false);
    }
  }

  function onSignOut() {
    signOut();
    // ✅ щоб точно кидало в логін
    navigate("/login", { replace: true });
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">Веб-застосунок для відстеження</div>
            <div className="brand-subtitle">крипто • валюти • метали</div>
          </div>
        </div>

        <nav className="nav">
          <NavLink to="/" end className={linkClass}>
            Головна
          </NavLink>
          <NavLink to="/crypto" className={linkClass}>
            Ринок криптовалют
          </NavLink>
          <NavLink to="/fx" className={linkClass}>
            Курси валют
          </NavLink>
          <NavLink to="/metals" className={linkClass}>
            Метали
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          {/* ✅ Клік по автору відкриває модалку */}
          <button type="button" className="hint hint-btn" onClick={openAbout}>
            Потапков Андрій 5Пі-22б
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">Відстеження ринків</div>

          <div className="topbar-actions">
            <div className="muted" style={{ paddingTop: 10 }}>
              {user?.email}
            </div>

            <button className="btn ghost" type="button" onClick={onSignOut}>
              Вийти
            </button>
          </div>
        </header>

        <div className="page">
          <Outlet />
        </div>
      </main>

      {/* ✅ MODAL */}
      {aboutOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            // клік по фону закриває
            if (e.target === e.currentTarget) closeAbout();
          }}
          role="presentation"
        >
          <div className="modal" role="dialog" aria-modal="true" aria-label="Про автора">
            <div className="modal-head">
              <div className="modal-title">Інформація</div>

              <button type="button" className="modal-close" onClick={closeAbout} aria-label="Закрити">
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-block">
                <div className="muted">Автор</div>
                <div className="modal-value">{authorInfo.name}</div>
              </div>

              <div className="modal-grid">
                <div className="modal-block">
                  <div className="muted">Група</div>
                  <div className="modal-value">{authorInfo.group}</div>
                </div>
                <div className="modal-block">
                  <div className="muted">Тема</div>
                  <div className="modal-value">{authorInfo.topic}</div>
                </div>
              </div>

              <div className="modal-sep" />

              <form onSubmit={onSend} className="modal-form">
                <div className="muted">Побажання / проблеми</div>

                <textarea
                  className="textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Опиши побажання щодо функціоналу або проблеми ..."
                  rows={5}
                />

                {status ? (
                  <div className={status.type === "ok" ? "ok" : "error"}>{status.text}</div>
                ) : null}

                <div className="modal-actions">

                  <button className="btn" type="submit" disabled={sending}>
                    {sending ? "Надсилаю..." : "Надіслати"}
                  </button>
                </div>

                <div className="muted" style={{ marginTop: 8 }}>
                  Дякую якщо залишиш відгук! Це допоможе зробити застосунок кращим.
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
