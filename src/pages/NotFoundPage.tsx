import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="card">
      <div className="h1">404</div>
      <div className="muted">Сторінку не знайдено.</div>
      <div style={{ marginTop: 12 }}>
        <Link className="link" to="/">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
