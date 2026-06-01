import Link from "next/link";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { channelHref, type ChannelCard } from "@/lib/channel-utils";
import { formatCount } from "@/lib/format";

/** Home "Indexed channels" grid — real logos via ChannelAvatar. */
export function ChannelsGrid({ channels, limit }: { channels: ChannelCard[]; limit?: number }) {
  const list = limit ? channels.slice(0, limit) : channels;
  return (
    <div className="ch-grid">
      {list.map((c) => (
        <Link key={c.id} href={channelHref(c)} className="ch-card" style={{ textDecoration: "none" }}>
          <ChannelAvatar logoUrl={c.thumbnailUrl} name={c.name} size="md" />
          <div className="ch-name">{c.name}</div>
          <div className="ch-meta">
            {formatCount(c.subscriberCount)} · {c.videoCount} vids
          </div>
        </Link>
      ))}
    </div>
  );
}
