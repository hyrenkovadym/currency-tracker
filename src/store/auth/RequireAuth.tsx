// src/store/auth/RequireAuth.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function RequireAuth() {
  const { isAuthed } = useAuth();
  const location = useLocation();

  if (!isAuthed) {
    // збережемо повний шлях (з query), щоб після логіну можна було повернутись назад
    const from = location.pathname + location.search;

    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
}
