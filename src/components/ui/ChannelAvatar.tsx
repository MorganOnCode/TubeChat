"use client";

import { useState } from "react";

/**
 * Channel avatar that renders the REAL channel logo (channels.thumbnail_url,
 * a YouTube CDN URL) and gracefully falls back to a colored lettermark when no
 * URL is present or the image fails to load (YT avatar URLs occasionally
 * hotlink-block). Used on the home grid, channels index/detail, scope-filter
 * rows, video-detail attribution, and similar-channel rails.
 */

const AV_COLORS = [
  "#5ee89a",
  "#7dd3fc",
  "#fbbf24",
  "#f0a3c0",
  "#a5b4fc",
  "#86efac",
  "#fcd34d",
  "#67e8f9",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((w) => w[0]).join("");
  return (letters || name.trim()[0] || "?").toUpperCase();
}

function colorFor(name: string): string {
  const code = name.charCodeAt(0) || 0;
  return AV_COLORS[code % AV_COLORS.length];
}

type Size = "tiny" | "sm" | "md" | "lg";

interface Props {
  logoUrl?: string | null;
  name: string;
  size?: Size;
  live?: boolean;
  className?: string;
}

export function ChannelAvatar({ logoUrl, name, size = "md", live = false, className = "" }: Props) {
  const [errored, setErrored] = useState(false);
  const showImg = Boolean(logoUrl) && !errored;
  const sizeClass = size === "md" ? "" : size;
  const c = colorFor(name);
  const lettermarkBg = `radial-gradient(120% 120% at 30% 25%, ${c}, color-mix(in oklab, ${c} 55%, #0a0d0c))`;

  return (
    <div
      className={["avatar", sizeClass, className].filter(Boolean).join(" ")}
      style={showImg ? undefined : { background: lettermarkBg }}
      title={name}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote YT CDN avatars; plain img avoids next/image remotePatterns config
        <img src={logoUrl as string} alt={name} loading="lazy" onError={() => setErrored(true)} />
      ) : (
        <span aria-hidden>{initialsFor(name)}</span>
      )}
      {live && <span className="live" />}
    </div>
  );
}
