"use client";

import { useAsk } from "./AskProvider";
import { AddScope, ChannelFilter, DateFilter, ScopeChips } from "./ScopeFilters";
import { ModelSettings } from "./ModelSettings";
import { PROVIDER_PRESETS } from "@/lib/providers";

const DEFAULT_SUGGESTIONS = [
  "What did Grusch say about NHI biologics?",
  "Compare Tic Tac witness accounts across channels",
  "Strongest evidence for crash retrievals?",
];

export function AskBox({
  placeholder = "Ask anything about UFOs, UAPs, NHI research…",
  compact = false,
  topics = [],
}: {
  placeholder?: string;
  compact?: boolean;
  topics?: string[];
}) {
  const { query, setQuery, submit, activeByok } = useAsk();
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="ask">
      <textarea
        className={"ask-input ask-ta" + (compact ? " compact" : "")}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        rows={compact ? 2 : 3}
        spellCheck={false}
        aria-label="Ask a question"
      />
      <div className="ask-bar">
        <div className="ask-tools">
          <AddScope topics={topics} />
          <ChannelFilter />
          <DateFilter />
          <ModelSettings />
          <ScopeChips inBar />
        </div>
        <div className="row gap10">
          {activeByok && (
            <span className="pill on" title={`Answering with ${PROVIDER_PRESETS[activeByok.provider].label}`} style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ⚙ {activeByok.model}
            </span>
          )}
          <span className="kicker" style={{ opacity: 0.7 }}>
            ⏎ to ask
          </span>
          <button className="send" title="Ask" onClick={() => submit()} type="button">
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

export function Suggestions({
  items = DEFAULT_SUGGESTIONS,
  center = false,
}: {
  items?: string[];
  center?: boolean;
}) {
  const { submit } = useAsk();
  return (
    <div className="row gap8 wrapf" style={{ justifyContent: center ? "center" : "flex-start" }}>
      {items.map((s) => (
        <button key={s} className="suggest" onClick={() => submit(s)} type="button">
          <span className="arr">↗</span>
          {s}
        </button>
      ))}
    </div>
  );
}
