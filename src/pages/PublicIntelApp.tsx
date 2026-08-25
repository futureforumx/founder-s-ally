import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import FreshCapitalPage from "./FreshCapitalPage";
import TrendingStartupsPage from "./TrendingStartupsPage";
import TrendingStartupDetailPage from "./TrendingStartupDetailPage";

function EscapeToFullApp() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    window.location.replace(`${pathname}${search}${hash}`);
  }, [pathname, search, hash]);
  return null;
}

export default function PublicIntelApp() {
  return (
    <Routes>
      <Route path="/fresh-capital" element={<FreshCapitalPage />} />
      <Route path="/fund-watch" element={<FreshCapitalPage />} />
      <Route path="/freshcapital" element={<FreshCapitalPage />} />
      <Route path="/fundwatch" element={<FreshCapitalPage />} />
      <Route path="/newfunds" element={<FreshCapitalPage />} />
      <Route path="/trending-companies" element={<Navigate to="/fresh-capital?tab=latest_funding" replace />} />
      <Route path="/trending-startups" element={<TrendingStartupsPage />} />
      <Route path="/trending-startups/:id" element={<TrendingStartupDetailPage />} />
      <Route path="*" element={<EscapeToFullApp />} />
    </Routes>
  );
}
