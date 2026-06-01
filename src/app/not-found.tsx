import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap" style={{ minHeight: "62vh", display: "flex" }}>
      <div className="nf-body">
        <div className="nf-code">Error 404 · signal lost</div>
        <h1 className="nf-title">
          This page is <em>off the radar</em>.
        </h1>
        <p className="nf-sub">
          The link may be broken, or the page moved. The archive is still here, though — ask it
          anything, or head back to safe ground.
        </p>

        {/* Plain GET form → /ask?q=… (the Ask page auto-runs it). No JS needed. */}
        <form className="nf-search" action="/ask" method="get">
          <span style={{ color: "var(--accent)" }}>⌕</span>
          <input name="q" placeholder="Ask anything across the archive…" spellCheck={false} aria-label="Ask the archive" />
          <button
            type="submit"
            className="send"
            style={{ width: 30, height: 30 }}
            aria-label="Ask"
          >
            ↑
          </button>
        </form>

        <div className="nf-actions">
          <Link className="btn accent" href="/">
            ← Back home
          </Link>
          <Link className="btn" href="/channels">
            Browse channels
          </Link>
          <Link className="btn" href="/topics">
            Browse topics
          </Link>
        </div>
      </div>
    </div>
  );
}
