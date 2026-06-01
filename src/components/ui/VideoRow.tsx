import Link from "next/link";
import { Fragment } from "react";
import { Thumb } from "./Thumb";

/** Horizontal video list row: thumb · title + meta · open button. */
export function VideoRow({
  href,
  title,
  thumbnailUrl,
  durationLabel,
  metaParts,
  openLabel = "Open ↗",
}: {
  href: string;
  title: string;
  thumbnailUrl?: string | null;
  durationLabel?: string;
  metaParts?: React.ReactNode[];
  openLabel?: string;
}) {
  return (
    <Link href={href} className="vid-row" style={{ textDecoration: "none", color: "inherit" }}>
      <Thumb thumbnailUrl={thumbnailUrl} duration={durationLabel} height={74} alt={title} />
      <div style={{ minWidth: 0 }}>
        <div className="vid-title">{title}</div>
        {metaParts && metaParts.length > 0 && (
          <div className="vid-meta">
            {metaParts.map((m, i) => (
              <Fragment key={i}>
                {i > 0 && <span>·</span>}
                {m}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <span className="btn ghost open-btn" style={{ fontSize: 13 }}>
        {openLabel}
      </span>
    </Link>
  );
}
