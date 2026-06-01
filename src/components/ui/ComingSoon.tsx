import Link from "next/link";
import { Eyebrow } from "./Eyebrow";

/** Placeholder for sections designed but scheduled for a later milestone. */
export function ComingSoon({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
}) {
  return (
    <div className="wrap" style={{ padding: "96px 32px 80px", textAlign: "center" }}>
      <div style={{ display: "inline-flex", marginBottom: 20 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 60px)", margin: "0 auto", maxWidth: "16ch" }}>
        {title}
      </h1>
      <p className="lede" style={{ margin: "20px auto 0", textAlign: "center" }}>
        {body}
      </p>
      <div className="row gap12" style={{ justifyContent: "center", marginTop: 28 }}>
        <Link className="btn accent" href="/">
          Back to home
        </Link>
        <Link className="btn ghost" href="/ask">
          Ask the archive
        </Link>
      </div>
    </div>
  );
}
