/** Client-safe channel helpers + type (no db imports — usable in client components). */

export interface ChannelCard {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number;
  segmentCount: number;
  topics: string[];
}

/** Canonical channel URL (short route). */
export function channelHref(c: { slug: string | null; id: string }): string {
  return `/c/${c.slug ?? c.id}`;
}

/** Display @handle derived from slug/name (the real YT handle isn't stored). */
export function channelHandle(c: { slug: string | null; name: string }): string {
  const base = c.slug ? c.slug.replace(/-/g, "") : c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return "@" + base;
}
