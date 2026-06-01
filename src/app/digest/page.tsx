import Link from "next/link";
import type { Metadata } from "next";
import "@/styles/digest.css";
import { sql } from "@/lib/db";
import { getChannelCards } from "@/lib/channels";
import { channelHref } from "@/lib/channel-utils";
import { slugify } from "@/lib/topic-model";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { DigestSubscribe } from "@/components/digest/DigestSubscribe";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "The Dispatch — tubechat",
  description: "A weekly digest of the UFO/UAP archive: the lead synthesis, the week in UAP, answer of the week, and topic movers.",
};

const WEEK = [
  { n: "01", t: "Pilots & sensors: what actually changed at the May hearings", m: ["6 videos", "Government"], delta: "+38 clips" },
  { n: "02", t: "The new Bob Lazar interview — every claim cross-referenced", m: ["4 videos", "Whistleblowers"], delta: "+22 clips" },
  { n: "03", t: "Skinwalker Ranch: the orb incidents nobody had indexed yet", m: ["9 videos", "Phenomena"], delta: "+19 clips" },
  { n: "04", t: "A quiet week for ancient — only three channels posted", m: ["3 videos", "History"], delta: "+7 clips" },
  { n: "05", t: "NHI biologics: the testimony timeline, finally in one place", m: ["7 videos", "Science"], delta: "+31 clips" },
];

const SOURCES = [
  { t: "Hal Puthoff on the Wilson-Davis notes & provenance", ch: "Need to Know", ts: "14:22" },
  { t: "Immaculate Constellation — what the document actually says", ch: "Jesse Michels", ts: "08:41" },
  { t: "Cross-examining the leak: a skeptic reads the same pages", ch: "The Why Files", ts: "31:50" },
];

const SPOT = [
  { n: "The Why Files", role: "Best for narrative", why: "Turns a tangle of testimony into a clean throughline — the place to start a topic." },
  { n: "Danny Jones", role: "Best for interviews", why: "Long, unhurried sit-downs that let claims breathe and contradictions surface." },
  { n: "Jesse Michels", role: "Best for technical depth", why: "Goes deep on provenance, programs, and the hard physical questions." },
  { n: "Need to Know", role: "Best for the beat", why: "Coulthart & Zabel track the disclosure politics week to week, primary-source first." },
];

const MOVERS = [
  { n: "Immaculate Constellation", d: "+312%", dir: "up", b: "From near-zero to the week's most-cited document leak." },
  { n: "Drone swarms (NJ)", d: "+148%", dir: "up", b: "The New Jersey sightings keep pulling new coverage." },
  { n: "Roswell", d: "−12%", dir: "down", b: "Quiet week — no new primary material surfaced." },
];

const askHref = (q: string) => `/ask?q=${encodeURIComponent(q)}`;
const LEAD_Q = "What do the Immaculate Constellation papers actually claim, and where do channels agree?";
const AOTW_Q = "How credible is the Wilson-Davis memo, really?";

async function getStats() {
  try {
    const [row] = await sql<{ videos: number; chunks: number }[]>`
      SELECT (SELECT COUNT(*)::int FROM videos WHERE status='completed') AS videos,
             (SELECT COUNT(*)::int FROM transcript_chunks) AS chunks
    `;
    return { videos: row?.videos ?? 0, chunks: row?.chunks ?? 0 };
  } catch {
    return { videos: 0, chunks: 0 };
  }
}

export default async function DigestPage() {
  const [stats, channels] = await Promise.all([getStats(), getChannelCards()]);
  const byName = new Map(channels.map((c) => [c.name.toLowerCase(), c]));

  return (
    <div className="wrap dg-wrap">
      {/* masthead */}
      <div className="dg-masthead">
        <div>
          <div style={{ marginBottom: 10 }}>
            <Eyebrow>Synthesized weekly from {stats.videos.toLocaleString()} videos</Eyebrow>
          </div>
          <div className="ttl">
            The <em>Dispatch</em>
          </div>
        </div>
        <div className="dg-issue">
          <div>
            <b>Issue 47</b>
          </div>
          <div>Week of May 25, 2026</div>
          <div>{stats.chunks.toLocaleString()} segments indexed</div>
        </div>
      </div>

      <div className="dg-subbar">
        <div className="tag-row">
          {["This week", "Hearings", "Whistleblowers", "Science", "History"].map((t, i) => (
            <span key={t} className={"topic" + (i === 0 ? " hot" : "")} style={{ fontSize: 13, padding: "6px 12px" }}>
              {t}
            </span>
          ))}
        </div>
        <DigestSubscribe />
      </div>

      {/* lead */}
      <div className="dg-lead">
        <Link className="dg-feature" href={askHref(LEAD_Q)}>
          <div className="fimg">
            <span className="badge">Lead story</span>
            <span className="synth">◈ Synthesized from 14 videos across 9 channels</span>
          </div>
          <div className="kick">The document everyone is reading</div>
          <h2>The Immaculate Constellation papers, read across fourteen channels at once.</h2>
          <p className="dek">
            A side-by-side reading of every transcript that names the document — where the coverage agrees, where it
            quietly contradicts itself, and the three claims that show up in almost every retelling.
          </p>
          <div className="byline">
            <span className="src">
              <span style={{ color: "var(--accent)" }}>◈</span> Synthesized by tubechat
            </span>
            <span>·</span>
            <span>23 cited clips</span>
            <span>·</span>
            <span style={{ color: "var(--accent)" }}>Open the synthesis →</span>
          </div>
        </Link>

        <div className="dg-stack">
          <div className="stack-hd">
            <span className="section-title" style={{ fontSize: 17 }}>
              The week in UAP
            </span>
            <span className="kicker" style={{ fontSize: 10.5 }}>
              5 stories
            </span>
          </div>
          {WEEK.map((w) => (
            <Link className="dg-item" key={w.n} href={askHref(w.t)}>
              <span className="num">{w.n}</span>
              <div>
                <div className="it">{w.t}</div>
                <div className="im">
                  {w.m.map((x, i) => (
                    <span key={i}>{i > 0 ? `· ${x}` : x}</span>
                  ))}
                  <span>·</span>
                  <span className="delta">{w.delta}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* answer of the week */}
      <div className="dg-section-hd">
        <span className="lbl">Answer of the week</span>
        <span className="rule" />
        <Link className="more" href="/ask">
          Ask your own →
        </Link>
      </div>
      <div className="dg-answer">
        <div className="dg-answer-card">
          <div className="q">{AOTW_Q}</div>
          <div className="a">
            Across the archive, channels converge on three points: the notes are{" "}
            <b style={{ color: "var(--ink)" }}>genuinely attributed</b> to a 2002 meeting
            <span className="ref">1</span>, their <b style={{ color: "var(--ink)" }}>provenance is documented but
            unverified</b> by independent parties<span className="ref">2</span>, and the most extraordinary claims rest
            on <b style={{ color: "var(--ink)" }}>second-hand testimony</b> rather than primary evidence
            <span className="ref">3</span>. Skeptical channels and proponents agree on the chain of custody — they
            diverge only on what it implies.
          </div>
          <div className="foot">
            <span>Drawn from 11 videos · 7 channels</span>
            <Link href={askHref(AOTW_Q)} style={{ color: "var(--accent)", textDecoration: "none" }}>
              See full answer →
            </Link>
          </div>
        </div>
        <div className="dg-sources">
          <div className="src-hd">The clips this answer cites</div>
          {SOURCES.map((s, i) => (
            <Link key={i} className="dg-source" href={askHref(s.t)}>
              <span className="idx">{i + 1}</span>
              <div className="th">
                <span className="p">▶</span>
              </div>
              <div className="meta">
                <div className="t">{s.t}</div>
                <div className="m">
                  {s.ch} · {s.ts}
                </div>
              </div>
            </Link>
          ))}
          <Link className="btn ghost" href="/ask" style={{ justifyContent: "center", marginTop: 4 }}>
            Ask a follow-up →
          </Link>
        </div>
      </div>

      {/* channel spotlight */}
      <div className="dg-section-hd">
        <span className="lbl">Where to watch this week</span>
        <span className="rule" />
        <Link className="more" href="/channels">
          All channels →
        </Link>
      </div>
      <div className="dg-spotlight">
        {SPOT.map((s) => {
          const real = byName.get(s.n.toLowerCase());
          return (
            <Link
              key={s.n}
              className="dg-spot"
              href={real ? channelHref(real) : "/channels"}
            >
              <div className="top">
                <ChannelAvatar logoUrl={real?.thumbnailUrl} name={s.n} size="sm" />
                <div>
                  <div className="nm">{s.n}</div>
                  <div className="role">{s.role}</div>
                </div>
              </div>
              <div className="why">{s.why}</div>
            </Link>
          );
        })}
      </div>

      {/* topic movement */}
      <div className="dg-section-hd">
        <span className="lbl">Topics on the move</span>
        <span className="rule" />
        <Link className="more" href="/topics">
          All topics →
        </Link>
      </div>
      <div className="dg-movers">
        {MOVERS.map((m) => (
          <Link key={m.n} className="dg-mover" href={`/t/${slugify(m.n)}`}>
            <div className="mv-top">
              <span className="mv-nm">{m.n}</span>
              <span className={"mv-d " + m.dir}>{m.d}</span>
            </div>
            <div className="mv-b">{m.b}</div>
          </Link>
        ))}
      </div>

      {/* CTA */}
      <div className="dg-cta">
        <h3>Don’t wait for the weekly.</h3>
        <p>Ask tubechat anything across the whole archive, right now.</p>
        <Link className="btn accent" href="/ask" style={{ padding: "12px 22px", fontSize: 15 }}>
          Start asking →
        </Link>
      </div>
    </div>
  );
}
