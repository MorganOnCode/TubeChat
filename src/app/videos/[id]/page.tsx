import { redirect } from "next/navigation";

// Canonical video route is /v/[id]; preserve old links + SEO (and ?t= deep-links)
// by redirecting.
export default async function LegacyVideoRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/v/${id}${query ? `?${query}` : ""}`);
}
