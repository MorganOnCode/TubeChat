"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/brand/Mark";
import { ThemeToggle } from "./ThemeToggle";

const NAV: [string, string][] = [
  ["Home", "/"],
  ["Channels", "/channels"],
  ["Topics", "/topics"],
  ["Timeline", "/timeline"],
  ["Digest", "/digest"],
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Header() {
  const pathname = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="wrap">
      <header className="hdr">
        <Link
          href="/"
          className="brand as-btn"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <Mark />
          <span className="name">
            tube<b>chat</b>
          </span>
        </Link>

        <nav className="nav">
          <div className="nav-links">
            {NAV.map(([label, href]) => (
              <Link key={label} href={href} className={isActive(pathname, href) ? "active" : ""}>
                {label}
              </Link>
            ))}
            <ThemeToggle />
            <Link className="btn ghost" href="/ask" style={{ padding: "7px 12px" }}>
              Sign in
            </Link>
          </div>
          <Link className="btn accent nav-cta" href="/ask" style={{ padding: "8px 15px" }}>
            Start asking
          </Link>
          <button
            className="nav-toggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            ☰
          </button>
        </nav>
      </header>

      {/* Minimal mobile menu (full mobile pass is a later TODO) */}
      {menuOpen && (
        <div
          className="col gap8"
          style={{
            padding: "8px 0 18px",
            borderBottom: "1px solid var(--line)",
            marginBottom: 8,
          }}
        >
          {NAV.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className={isActive(pathname, href) ? "active" : ""}
              style={{ fontSize: 15, color: "var(--ink-2)", textDecoration: "none", padding: "6px 2px" }}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <div className="row gap12" style={{ marginTop: 6 }}>
            <ThemeToggle />
            <Link
              className="btn accent"
              href="/ask"
              style={{ padding: "8px 15px" }}
              onClick={() => setMenuOpen(false)}
            >
              Start asking
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
