import Link from "next/link";
import type { Topic } from "@/lib/topic-model";

function Spark({ data, pk, pending }: { data: number[] | null; pk: number | null; pending: boolean }) {
  if (pending || !data) {
    return (
      <div className="spark pending" aria-label="clustering in progress">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} style={{ height: 20 + (i % 3) * 18 + "%" }} />
        ))}
      </div>
    );
  }
  const max = Math.max(...data, 1);
  return (
    <div className="spark" aria-hidden>
      {data.map((d, i) => (
        <span key={i} className={i === pk ? "pk" : ""} style={{ height: Math.round((d / max) * 100) + "%" }} />
      ))}
    </div>
  );
}

export function TopicCard({ topic }: { topic: Topic }) {
  const t = topic;
  const emerging = t.status !== "live";
  return (
    <Link
      href={`/t/${t.slug}`}
      className={"tpx-card" + (t.hot ? " hot" : "") + (emerging ? " emerging" : "")}
      data-slug={t.slug}
      data-status={t.status}
    >
      <div className="trow">
        <div className="tnm">
          {t.display}
          {t.hot && <span className="fire">▲ trending</span>}
          {t.status === "new" && <span className="badge new">✦ new</span>}
          {t.status === "indexing" && <span className="badge idx">◴ indexing</span>}
        </div>
        <span className="tarrow">→</span>
      </div>

      <div className={"tblurb" + (t.blurb ? "" : " empty")}>
        {t.blurb ||
          (t.status === "indexing"
            ? "Clustering segments — a summary will appear once tubechat has enough coverage."
            : "Summary pending. This topic was just discovered in the archive.")}
      </div>

      <Spark data={t.spark} pk={t.pk} pending={t.status === "indexing"} />

      <div className="trow">
        <span className="tcount">
          {t.c > 0 ? (
            <>
              <b>{t.c.toLocaleString()}</b> clips · {t.v} videos
            </>
          ) : (
            "awaiting first pass"
          )}
        </span>
        <span className="kicker" style={{ fontSize: 10.5 }}>
          {emerging && t.discovered ? `found ${t.discovered}` : t.cat}
        </span>
      </div>
    </Link>
  );
}
