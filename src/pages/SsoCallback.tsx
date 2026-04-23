import { Navigate } from "react-router-dom";

export default function SsoCallback() {
  return <Navigate to="/settings?tab=network" replace />;
}
