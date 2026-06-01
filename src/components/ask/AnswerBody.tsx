"use client";

import { Fragment } from "react";
import type { AskSource } from "@/lib/ask-types";

const CITE_RE = /\[\[(\d+)\]\]|\[Source\s+(\d+)\]/g;

export interface CiteHandlers {
  enter: (n: number) => void;
  leave: () => void;
  click: (n: number) => void;
}

function Cite({
  n,
  src,
  active,
  handlers,
}: {
  n: number;
  src?: AskSource;
  active: boolean;
  handlers?: CiteHandlers;
}) {
  if (handlers) {
    return (
      <button
        className={"cite" + (active ? " on" : "")}
        onMouseEnter={() => handlers.enter(n)}
        onMouseLeave={handlers.leave}
        onClick={() => handlers.click(n)}
        type="button"
        aria-label={src ? `Source ${n}: ${src.title}` : `Source ${n}`}
      >
        {n}
      </button>
    );
  }
  if (src) {
    return (
      <a className="cite" href={src.url} title={`${src.title} — ${src.channel}`}>
        {n}
      </a>
    );
  }
  return <span className="cite">{n}</span>;
}

function renderLine(
  line: string,
  sources: AskSource[],
  activeCite: number | null,
  handlers: CiteHandlers | undefined,
  keyBase: string,
) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  CITE_RE.lastIndex = 0;
  let m: RegExpExecArray | null = CITE_RE.exec(line);
  let i = 0;
  while (m !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    const n = parseInt(m[1] || m[2], 10);
    nodes.push(
      <Cite
        key={`${keyBase}-c${i}`}
        n={n}
        src={sources[n - 1]}
        active={activeCite === n}
        handlers={handlers}
      />,
    );
    last = m.index + m[0].length;
    i += 1;
    m = CITE_RE.exec(line);
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

/**
 * Renders a (possibly still-streaming) answer with inline [Source N] citation
 * pills. Pass `handlers` for the interactive Ask view (hover/click drive the
 * clip rail); omit them for the read-only shared page (pills become links).
 */
export function AnswerBody({
  text,
  sources,
  activeCite = null,
  handlers,
  streaming = false,
}: {
  text: string;
  sources: AskSource[];
  activeCite?: number | null;
  handlers?: CiteHandlers;
  streaming?: boolean;
}) {
  const lines = text.split(/\n+/);
  return (
    <div className="answer">
      {lines.map((line, li) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("• ");
        const content = renderLine(
          isBullet ? trimmed.replace(/^[-•]\s*/, "") : line,
          sources,
          activeCite,
          handlers,
          `l${li}`,
        );
        if (isBullet) {
          return (
            <div key={li} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "var(--accent)", flex: "none" }}>•</span>
              <span>{content}</span>
            </div>
          );
        }
        return (
          <Fragment key={li}>
            {li > 0 && <span className="pbreak" />}
            <span>{content}</span>
          </Fragment>
        );
      })}
      {streaming && <span className="type-caret" />}
    </div>
  );
}
