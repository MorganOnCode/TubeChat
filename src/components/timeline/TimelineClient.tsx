"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { formatDuration } from "@/lib/format";

const TL_CATS = [
  { k: "all", label: "All events", c: "var(--ink-2)" },
  { k: "enc", label: "Encounters", c: "#5ee89a" },
  { k: "gov", label: "Government", c: "#7dd3fc" },
  { k: "wb", label: "Whistleblowers", c: "#fbbf24" },
  { k: "crash", label: "Crashes", c: "#f48fb1" },
];
const CAT_COLOR: Record<string, string> = Object.fromEntries(TL_CATS.map((c) => [c.k, c.c]));

interface TLEvent {
  y: number;
  t: string;
  cat: string;
  clips: number;
}
interface Decade {
  d: string;
  clips: number;
  ch: number;
  events: TLEvent[];
}

// Curated UAP history (editorial). Per-event clips are fetched live from the archive.
const DECADES: Decade[] = [
  { d: "1940s", clips: 47, ch: 6, events: [
    { y: 1947, t: "Kenneth Arnold sighting", cat: "enc", clips: 18 },
    { y: 1947, t: "Roswell crash", cat: "crash", clips: 22 },
    { y: 1948, t: "Mantell UFO incident", cat: "enc", clips: 7 },
  ] },
  { d: "1950s", clips: 112, ch: 9, events: [
    { y: 1952, t: "Washington D.C. flap", cat: "enc", clips: 41 },
    { y: 1951, t: "Lubbock Lights", cat: "enc", clips: 28 },
    { y: 1953, t: "Robertson Panel convened", cat: "gov", clips: 24 },
    { y: 1955, t: "Kelly–Hopkinsville encounter", cat: "enc", clips: 19 },
  ] },
  { d: "1960s", clips: 89, ch: 11, events: [
    { y: 1961, t: "Betty & Barney Hill abduction", cat: "enc", clips: 38 },
    { y: 1966, t: "Project Blue Book — Michigan", cat: "gov", clips: 27 },
    { y: 1969, t: "Condon Report published", cat: "gov", clips: 24 },
  ] },
  { d: "1970s", clips: 78, ch: 10, events: [
    { y: 1973, t: "Pascagoula abduction", cat: "enc", clips: 26 },
    { y: 1975, t: "Travis Walton case", cat: "enc", clips: 31 },
    { y: 1976, t: "Tehran F-4 incident", cat: "enc", clips: 21 },
  ] },
  { d: "1980s", clips: 134, ch: 14, events: [
    { y: 1980, t: "Rendlesham Forest incident", cat: "enc", clips: 52 },
    { y: 1989, t: "Belgian UFO wave begins", cat: "enc", clips: 44 },
    { y: 1980, t: "Cash–Landrum incident", cat: "enc", clips: 23 },
    { y: 1989, t: "Bob Lazar goes public (KLAS)", cat: "wb", clips: 15 },
  ] },
  { d: "1990s", clips: 156, ch: 16, events: [
    { y: 1997, t: "Phoenix Lights", cat: "enc", clips: 58 },
    { y: 1996, t: "Varginha incident (Brazil)", cat: "crash", clips: 39 },
    { y: 1994, t: "Ariel School encounter", cat: "enc", clips: 35 },
    { y: 1995, t: "Alien autopsy hoax surfaces", cat: "gov", clips: 24 },
  ] },
  { d: "2000s", clips: 92, ch: 13, events: [
    { y: 2004, t: "USS Nimitz Tic Tac encounter", cat: "enc", clips: 41 },
    { y: 2006, t: "O'Hare Airport sighting", cat: "enc", clips: 28 },
    { y: 2008, t: "Stephenville sightings", cat: "enc", clips: 23 },
  ] },
  { d: "2010s", clips: 387, ch: 24, events: [
    { y: 2015, t: "GIMBAL & GoFast captured", cat: "enc", clips: 96 },
    { y: 2017, t: "NYT AATIP exposé", cat: "gov", clips: 134 },
    { y: 2017, t: "Luis Elizondo resigns, goes public", cat: "wb", clips: 87 },
    { y: 2019, t: "Navy confirms UAP videos real", cat: "gov", clips: 70 },
  ] },
  { d: "2020s", clips: 612, ch: 31, events: [
    { y: 2021, t: "ODNI Preliminary Assessment", cat: "gov", clips: 88 },
    { y: 2023, t: "David Grusch testifies to Congress", cat: "wb", clips: 187 },
    { y: 2023, t: "AARO established", cat: "gov", clips: 96 },
    { y: 2024, t: "Schumer disclosure amendment", cat: "gov", clips: 74 },
    { y: 2024, t: "Immaculate Constellation leak", cat: "wb", clips: 92 },
    { y: 2025, t: "NHI biologics hearings", cat: "wb", clips: 75 },
  ] },
];

interface SearchVideo {
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  channel?: { name: string } | null;
}

export function TimelineClient() {
  const router = useRouter();
  const maxClips = Math.max(...DECADES.map((d) => d.clips));
  const cols = DECADES.length;
  const [selDec, setSelDec] = useState(cols - 1);
  const [cat, setCat] = useState("all");
  const [selEvt, setSelEvt] = useState(0);
  const [clips, setClips] = useState<SearchVideo[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);

  const dec = DECADES[selDec];
  const visibleEvents = dec.events.filter((e) => cat === "all" || e.cat === cat);
  const safeEvtIdx = Math.min(selEvt, Math.max(0, visibleEvents.length - 1));
  const evt = visibleEvents[safeEvtIdx];

  const pickDecade = (i: number) => {
    setSelDec(i);
    setSelEvt(0);
  };

  // Fetch real clips for the selected event from the keyword search API.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    // When no event is selected the right column shows a placeholder, so we
    // don't need to clear `clips` here (avoids a setState-in-effect).
    if (!evt) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard "set loading, then fetch" data effect
    setLoadingClips(true);
    fetch(`/api/search?q=${encodeURIComponent(evt.t)}&limit=4`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { videos: [] }))
      .then((d: { videos?: SearchVideo[] }) => setClips(d.videos ?? []))
      .catch(() => {
        /* aborted or failed */
      })
      .finally(() => setLoadingClips(false));
    return () => controller.abort();
  }, [evt?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrubLeft = `calc(${(selDec + 0.5) * (100 / cols)}%)`;

  return (
    <div className="wrap tl-wrap">
      <div className="tl-head">
        <div>
          <span className="eyebrow">
            <span className="dot" />
            80 years · the UAP record, mapped
          </span>
          <h1 className="display" style={{ fontSize: "clamp(30px,3.8vw,48px)", marginTop: 14 }}>
            The history of UAP, <em>mapped</em>.
          </h1>
          <p className="lede" style={{ marginTop: 8 }}>
            Scrub the decades, then open any event to pull the matching clips from the archive.
          </p>
        </div>
        <div className="tl-cats">
          {TL_CATS.map((c) => (
            <button
              key={c.k}
              className={"topic" + (c.k === cat ? " hot" : "")}
              style={{ fontSize: 13, padding: "7px 13px" }}
              onClick={() => {
                setCat(c.k);
                setSelEvt(0);
              }}
              type="button"
            >
              {c.k !== "all" && (
                <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: c.c, marginRight: 7 }} />
              )}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-axis-wrap">
        <div className="tl-scrub" style={{ left: scrubLeft }} />
        <div className="tl-axis" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {DECADES.map((d, i) => {
            const h = 24 + Math.round((d.clips / maxClips) * 150);
            return (
              <button key={d.d} className={"tl-col" + (i === selDec ? " sel" : "")} onClick={() => pickDecade(i)} type="button">
                <div className={"tl-bar" + (i === selDec ? " on" : "")} style={{ height: h }}>
                  <span className="tl-barct">{d.clips} clips</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="tl-base" />
        <div className="tl-labels" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {DECADES.map((d, i) => (
            <button key={d.d} className="tl-lab" onClick={() => pickDecade(i)} type="button">
              <div className="tl-decade" style={{ color: i === selDec ? "var(--accent)" : undefined }}>
                {d.d}
              </div>
              <div className="tl-evt">{d.events[0].t}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="tl-drawer">
        <div>
          <div className="tl-drawer-hd">
            <span className="dec">{dec.d}</span>
            <div className="tl-decnav">
              <button className="btn ghost" style={{ padding: "6px 10px" }} disabled={selDec === 0} onClick={() => selDec > 0 && pickDecade(selDec - 1)} type="button">
                ←
              </button>
              <button className="btn ghost" style={{ padding: "6px 10px" }} disabled={selDec === cols - 1} onClick={() => selDec < cols - 1 && pickDecade(selDec + 1)} type="button">
                →
              </button>
            </div>
          </div>
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>
            {visibleEvents.length} events · {dec.ch} channels
          </div>
          <div className="tl-events">
            {visibleEvents.map((e, i) => (
              <button key={`${e.y}-${e.t}`} className={"tl-event" + (i === safeEvtIdx ? " sel" : "")} onClick={() => setSelEvt(i)} type="button">
                <span className="ev-dot" style={{ background: CAT_COLOR[e.cat] }} />
                <span className="yr">{e.y}</span>
                <div>
                  <div className="ev-t">{e.t}</div>
                  <div className="ev-c">{e.clips} clips</div>
                </div>
              </button>
            ))}
            {!visibleEvents.length && (
              <div style={{ padding: "18px 12px", fontSize: 13, color: "var(--ink-3)" }}>
                No {TL_CATS.find((c) => c.k === cat)?.label.toLowerCase()} in this decade.
              </div>
            )}
          </div>
        </div>

        <div>
          {evt ? (
            <>
              <div className="tl-clips-hd">
                <span className="t">
                  Clips on <b>{evt.t}</b>
                </span>
                <span className="kicker" style={{ fontSize: 10.5 }}>
                  {evt.y}
                </span>
              </div>
              {loadingClips ? (
                <div className="tl-clip-grid">
                  {[0, 1].map((i) => (
                    <div key={i} className="tl-clip">
                      <div className="th skeleton" style={{ borderRadius: 0 }} />
                      <div className="body">
                        <div className="skeleton" style={{ height: 12, width: "90%" }} />
                        <div className="skeleton" style={{ height: 10, width: "50%", marginTop: 8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : clips.length > 0 ? (
                <div className="tl-clip-grid">
                  {clips.map((c) => (
                    <Link key={c.youtube_id} className="tl-clip" href={`/v/${c.youtube_id}`}>
                      <div className="th">
                        {c.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- remote YT thumbnail
                          <img src={c.thumbnail_url} alt="" loading="lazy" />
                        ) : (
                          <div className="play">▶</div>
                        )}
                        {c.duration_seconds ? <span className="ts">{formatDuration(c.duration_seconds)}</span> : null}
                      </div>
                      <div className="body">
                        <div className="ct">{c.title}</div>
                        <div className="cm">
                          {c.channel && <ChannelAvatar name={c.channel.name} size="tiny" />}
                          <span>{c.channel?.name}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "8px 0 0", fontSize: 13.5, color: "var(--ink-3)" }}>
                  No indexed clips matched this event yet — ask the archive to synthesize what it has.
                </div>
              )}

              <div className="tl-ask-row">
                <span style={{ color: "var(--accent)", fontSize: 16 }}>◈</span>
                <span className="txt">
                  Ask tubechat to synthesize everything on <b style={{ color: "var(--ink)" }}>{evt.t}</b> across channels.
                </span>
                <button className="btn accent" onClick={() => router.push(`/ask?q=${encodeURIComponent(evt.t)}`)} type="button">
                  Ask about this →
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Pick an event to see its clips.</div>
          )}
        </div>
      </div>
    </div>
  );
}
