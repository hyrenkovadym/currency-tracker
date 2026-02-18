import { Route, type RouteObject } from "react-router-dom";
import AppLayout from "../components/layout/AppLayout";
import LoginPage from "../pages/LoginPage";
import DashboardPage from "../pages/DashboardPage";
import CryptoMarketPage from "../pages/CryptoMarketPage";
import CryptoAssetPage from "../pages/CryptoAssetPage";
import FxPage from "../pages/FxPage";
import FxAssetPage from "../pages/FxAssetPage";
import MetalsPage from "../pages/MetalsPage";
import NotFoundPage from "../pages/NotFoundPage";
import MetalAssetPage from "../pages/MetalAssetPage";

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },

  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },


      { path: "crypto", element: <CryptoMarketPage /> },
      { path: "crypto/:symbol", element: <CryptoAssetPage /> },
      { path: "/fx/:base", element: <FxAssetPage /> },

      { path: "fx", element: <FxPage /> },
      { path: "metals", element: <MetalsPage /> },
      { path: "metals/:metal", element: <MetalAssetPage /> },

    ],
  },

  { path: "*", element: <NotFoundPage /> },
];
