// src/pages/LoginPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth/AuthContext";
import { registerUser } from "../store/auth/users.storage";

type Mode = "login" | "register";

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

// ✅ тільки ASCII (без укр/рус, емодзі і т.п.)
function isAsciiOnly(s: string) {
  return /^[\x00-\x7F]*$/.test(s);
}

// ✅ email тільки латиницею/цифрами/дозволеними символами
function isValidEmailStrictAscii(email: string) {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (!isAsciiOnly(e)) return false;

  // local-part: A-Z a-z 0-9 . _ % + -
  // domain: A-Z a-z 0-9 . -
  // tld: тільки літери (2+)
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e);
}

export default function LoginPage() {
  const { isAuthed, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from = useMemo(() => location.state?.from || "/", [location.state?.from]);

  useEffect(() => {
    if (isAuthed) navigate(from, { replace: true });
  }, [isAuthed, navigate, from]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const em = normalizeEmail(email);
    const pw = password;

    if (!em || !pw.trim()) {
      setError("Заповни email і пароль");
      return;
    }

    if (!isValidEmailStrictAscii(em)) {
      setError("Email має бути тільки латиницею (A-Z), цифрами та символами ._%+-  (без укр/рус літер)");
      return;
    }

    if (mode === "register") {
      if (pw !== repeatPassword) {
        setError("Паролі не співпадають");
        return;
      }
    }

    try {
      setLoading(true);

      if (mode === "register") {
        await registerUser(em, pw);
        await signIn(em, pw);
      } else {
        await signIn(em, pw);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="tabs">
          <button
            type="button"
            className={"tab" + (mode === "login" ? " active" : "")}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Вхід
          </button>

          <button
            type="button"
            className={"tab" + (mode === "register" ? " active" : "")}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            Реєстрація
          </button>

          <div className={"tab-indicator " + mode} />
        </div>

        <div className="h1" style={{ marginTop: 14 }}>
          {mode === "login" ? "Вхід у систему" : "Створення облікового запису"}
        </div>

        <div className="muted">
          {mode === "login"
            ? "Введи дані для входу. Сесія зберігається локально."
            : "Реєстрація зберігається локально (без БД) — для дипломного прототипу."}
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => {
                // прибираємо пробіли "на льоту" (не обов'язково, але зручно)
                const v = e.target.value.replace(/\s+/g, "");
                setEmail(v);
              }}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </label>

          <label className="field">
            <span>Пароль</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {mode === "register" && (
            <label className="field">
              <span>Повтори пароль</span>
              <input
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
          )}

          {error && <div className="error">{error}</div>}

          <button className="btn full" type="submit" disabled={loading}>
            {loading ? "Зачекай..." : mode === "login" ? "Увійти" : "Зареєструватись"}
          </button>
        </form>
      </div>
    </div>
  );
}
