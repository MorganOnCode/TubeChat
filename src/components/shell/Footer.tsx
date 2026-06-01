import Link from "next/link";
import { Mark } from "@/components/brand/Mark";

export function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", marginTop: 80 }}>
      <div className="wrap" style={{ padding: "40px 32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr",
            gap: 32,
          }}
          className="footer-grid"
        >
          <div>
            <div className="row gap10" style={{ marginBottom: 12 }}>
              <Mark size={24} />
              <span className="name" style={{ fontWeight: 600, fontSize: 16 }}>
                tube<b style={{ color: "var(--accent)" }}>chat</b>
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.6, maxWidth: "40ch" }}>
              AI search across the best UFO, UAP &amp; NHI research channels. Every answer cites the
              exact clip and timestamp.
            </p>
          </div>

          <div>
            <h4 className="kicker" style={{ marginBottom: 12 }}>
              Browse
            </h4>
            <div className="col gap8">
              <FooterLink href="/channels">Channels</FooterLink>
              <FooterLink href="/topics">Topics</FooterLink>
              <FooterLink href="/timeline">Timeline</FooterLink>
              <FooterLink href="/digest">Digest</FooterLink>
            </div>
          </div>

          <div>
            <h4 className="kicker" style={{ marginBottom: 12 }}>
              Project
            </h4>
            <div className="col gap8">
              <FooterLink href="/ask">Ask the archive</FooterLink>
              <a
                href="https://github.com/MorganOnCode/TubeChat"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13.5, color: "var(--ink-2)", textDecoration: "none" }}
              >
                GitHub
              </a>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid var(--line)",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.6 }}>
            AI-synthesized from creator transcripts — verify with the cited clips. tubechat indexes
            public YouTube transcripts and links back to every source.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ fontSize: 13.5, color: "var(--ink-2)", textDecoration: "none" }}>
      {children}
    </Link>
  );
}
