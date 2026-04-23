import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function AiAgentsPage() {
  useEffect(() => {
    document.title = "AI Agents · Vekta";
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#fff", fontFamily: "sans-serif", padding: 40 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>AI Agents</h1>
      <p style={{ color: "#666", marginTop: 8 }}>Page is rendering correctly.</p>
      <Link to="/" style={{ color: "#5B5CFF", marginTop: 24, display: "inline-block" }}>← Back home</Link>
    </div>
  );
}
