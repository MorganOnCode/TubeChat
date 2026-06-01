import "@/styles/topics.css";

// Deterministic widths (no Math.random — must be pure for render).
const WIDTHS = [120, 90, 150, 110, 80, 140, 100, 130, 95];

export default function TopicsLoading() {
  return (
    <div className="wrap tpx-wrap">
      <div className="skeleton" style={{ height: 40, width: 240, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 16, width: 380, marginBottom: 24 }} />
      <div className="tpx-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="tpx-card" style={{ cursor: "default" }}>
            <div className="skeleton" style={{ height: 18, width: WIDTHS[i % WIDTHS.length] }} />
            <div className="skeleton" style={{ height: 36, width: "100%" }} />
            <div className="skeleton" style={{ height: 30, width: "100%" }} />
            <div className="skeleton" style={{ height: 12, width: "60%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
