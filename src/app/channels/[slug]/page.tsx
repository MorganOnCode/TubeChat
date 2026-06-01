import { redirect } from "next/navigation";

// Canonical channel route is /c/[slug]; keep the old path working for existing
// links + SEO by redirecting (preserving query like ?page=).
export default async function LegacyChannelRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/c/${slug}${query ? `?${query}` : ""}`);
}
