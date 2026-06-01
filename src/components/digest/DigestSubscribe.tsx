"use client";

import { useState } from "react";

/** Email capture for the weekly digest. No backend yet — acknowledges signup client-side. */
export function DigestSubscribe() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
        You’re on the list — the weekly is coming soon.
      </span>
    );
  }

  return (
    <form
      className="dg-subscribe"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setDone(true);
      }}
    >
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        spellCheck={false}
        aria-label="Email address"
      />
      <button className="btn accent" type="submit">
        Get it weekly
      </button>
    </form>
  );
}
