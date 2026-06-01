import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAnswer } from "@/lib/db";
import { AnswerBody } from "@/components/ask/AnswerBody";
import { ClipCard } from "@/components/ask/ClipCard";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { formatDate } from "@/lib/format";

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ans = await getAnswer(id);
  if (!ans) return { title: "Shared answer — tubechat" };
  return {
    title: `${ans.question.slice(0, 70)} — tubechat`,
    description: ans.answer.replace(/\[Source \d+\]|\[\[\d+\]\]/g, "").slice(0, 160),
    openGraph: { title: ans.question.slice(0, 90), type: "article" },
  };
}

export default async function SharedAnswerPage({ params }: PageProps) {
  const { id } = await params;
  const ans = await getAnswer(id);
  if (!ans) notFound();

  const sources = Array.isArray(ans.sources) ? ans.sources : [];

  return (
    <div className="wrap" style={{ paddingTop: 36, paddingBottom: 72 }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div className="breadcrumb" style={{ marginBottom: 18 }}>
          <Link className="back" href="/ask">
            ← Ask your own
          </Link>
          <span className="cur">Shared answer</span>
        </div>

        <Eyebrow>Shared answer · {formatDate(ans.created_at)}</Eyebrow>
        <h1 className="q-text" style={{ fontSize: 28, marginTop: 14 }}>
          {ans.question}
        </h1>

        <div className="msg-ans" style={{ marginTop: 24 }}>
          <div className="row gap10" style={{ marginBottom: 12 }}>
            <span className="kicker" style={{ color: "var(--accent)" }}>
              tubechat
            </span>
            {sources.length > 0 && (
              <span className="kicker" style={{ color: "var(--ink-faint)" }}>
                · {sources.length} sources
              </span>
            )}
          </div>
          <AnswerBody text={ans.answer} sources={sources} />
        </div>

        {sources.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <span className="section-title" style={{ fontSize: 15 }}>
              Cited clips
            </span>
            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {sources.map((s, i) => (
                <ClipCard key={`${s.videoId}-${i}`} source={s} n={i + 1} active={false} />
              ))}
            </div>
          </section>
        )}

        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ fontSize: 12, color: "var(--ink-faint)", lineHeight: 1.5, maxWidth: "48ch" }}>
            AI-synthesized from creator transcripts — verify with the cited clips.
          </p>
          <Link className="btn accent" href="/ask">
            Ask your own question →
          </Link>
        </div>
      </div>
    </div>
  );
}
