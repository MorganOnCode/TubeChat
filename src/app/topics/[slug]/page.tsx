import { redirect } from "next/navigation";

// Canonical topic route is /t/[slug]; keep the old path working via redirect.
export default async function LegacyTopicRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/t/${slug}`);
}
