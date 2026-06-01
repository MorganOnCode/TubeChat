/** Video thumbnail frame — real thumbnail when present, play-glyph placeholder otherwise. */
export function Thumb({
  thumbnailUrl,
  duration,
  height,
  alt = "",
}: {
  thumbnailUrl?: string | null;
  duration?: string;
  height?: number;
  alt?: string;
}) {
  return (
    <div className="thumb" style={height ? { height } : undefined}>
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote YT CDN thumbnails; plain img avoids next/image remotePatterns config
        <img src={thumbnailUrl} alt={alt} loading="lazy" />
      ) : (
        <div className="play">▶</div>
      )}
      {duration && <span className="dur">{duration}</span>}
    </div>
  );
}
