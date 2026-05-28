"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// `ssr: false` dynamic imports must live in a Client Component (Next 16 rule).
const ChatWidget = dynamic(() => import("./ChatWidget"), {
  ssr: false,
  loading: () => null,
});

export default function ChatWidgetLoader(props: ComponentProps<typeof ChatWidget>) {
  return <ChatWidget {...props} />;
}
