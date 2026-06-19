"use client";

import { useEffect, useState } from "react";
import { Popover } from "./Popover";
import { useAsk } from "./AskProvider";
import { PROVIDER_PRESETS, BYOK_PROVIDER_IDS, type ByokProviderId } from "@/lib/providers";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--line-2)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-mono)",
  outline: "none",
};

type TestState = { state: "idle" | "testing" | "ok" | "err"; msg?: string };

/**
 * Gear popover for bringing your own model/key. Reuses the Popover + filter
 * design language. Edits a local draft; "Save & use" commits it to the shared
 * AskProvider state (localStorage). A "Test connection" button validates the key
 * against the provider with a 1-token call before the user relies on it.
 */
export function ModelSettings() {
  const { byok, byokEnabled, activeByok, setByok, setByokEnabled } = useAsk();
  const [provider, setProvider] = useState<ByokProviderId>(byok?.provider ?? "openai");
  const [model, setModel] = useState(byok?.model ?? "");
  const [apiKey, setApiKey] = useState(byok?.apiKey ?? "");
  const [test, setTest] = useState<TestState>({ state: "idle" });

  // Keep the draft in sync with stored config (e.g. a change in another tab).
  useEffect(() => {
    setProvider(byok?.provider ?? "openai");
    setModel(byok?.model ?? "");
    setApiKey(byok?.apiKey ?? "");
    setTest({ state: "idle" });
  }, [byok]);

  const preset = PROVIDER_PRESETS[provider];
  const canSave = model.trim().length > 0 && apiKey.trim().length > 0;
  const isActiveDraft =
    !!activeByok &&
    activeByok.provider === provider &&
    activeByok.model === model.trim() &&
    activeByok.apiKey === apiKey.trim();

  const runTest = async () => {
    if (!canSave) return;
    setTest({ state: "testing" });
    try {
      const res = await fetch("/api/byok/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: model.trim(), apiKey: apiKey.trim() }),
      });
      const j = await res.json();
      setTest(j.ok ? { state: "ok" } : { state: "err", msg: j.error || "Connection failed" });
    } catch {
      setTest({ state: "err", msg: "Network error" });
    }
  };

  const save = () => {
    if (!canSave) return;
    setByok({ provider, model: model.trim(), apiKey: apiKey.trim() });
    setByokEnabled(true);
  };

  return (
    <Popover
      width={332}
      align="right"
      trigger={({ toggle }) => (
        <button
          className={"icon-btn" + (activeByok ? " on" : "")}
          title={activeByok ? `Answering with ${PROVIDER_PRESETS[activeByok.provider].label} · ${activeByok.model}` : "Use your own model"}
          onClick={toggle}
          type="button"
          aria-label="Model settings"
        >
          ⚙
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="pop-hd">
            <span className="pop-ttl">Bring your own model</span>
          </div>

          {byokEnabled && activeByok && (
            <div
              className="row between"
              style={{
                margin: "0 4px 8px",
                padding: "7px 10px",
                borderRadius: 8,
                background: "color-mix(in oklab, var(--accent) 10%, transparent)",
                border: "1px solid color-mix(in oklab, var(--accent) 28%, transparent)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                <span style={{ color: "var(--accent)" }}>●</span>{" "}
                Using {PROVIDER_PRESETS[activeByok.provider].label} · <span className="mono">{activeByok.model}</span>
              </span>
              <button
                className="pop-link"
                style={{ color: "var(--ink-3)", fontSize: 12 }}
                onClick={() => setByokEnabled(false)}
                type="button"
              >
                Use default
              </button>
            </div>
          )}

          {/* provider */}
          <div className="pop-sec" style={{ paddingTop: 2 }}>Provider</div>
          <div className="row gap6 wrapf" style={{ padding: "0 4px 8px" }}>
            {BYOK_PROVIDER_IDS.map((id) => (
              <button
                key={id}
                className={"pill" + (provider === id ? " on" : "")}
                onClick={() => {
                  setProvider(id);
                  setTest({ state: "idle" });
                }}
                type="button"
              >
                {PROVIDER_PRESETS[id].label}
              </button>
            ))}
          </div>

          {/* model */}
          <div className="pop-sec">Model</div>
          <div style={{ padding: "0 4px 6px" }}>
            <input
              style={inputStyle}
              placeholder="model id…"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setTest({ state: "idle" });
              }}
              spellCheck={false}
              aria-label="Model id"
            />
            <div className="row gap6 wrapf" style={{ marginTop: 6 }}>
              {preset.suggestedModels.map((m) => (
                <button
                  key={m}
                  className="suggest"
                  style={{ fontSize: 11.5, padding: "4px 9px" }}
                  onClick={() => {
                    setModel(m);
                    setTest({ state: "idle" });
                  }}
                  type="button"
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* api key */}
          <div className="pop-sec row between">
            <span>API key</span>
            <a
              href={preset.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pop-link"
              style={{ color: "var(--accent)", fontSize: 11.5, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
            >
              Get a key ↗
            </a>
          </div>
          <div style={{ padding: "0 4px 8px" }}>
            <input
              style={inputStyle}
              type="password"
              placeholder={preset.keyHint}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTest({ state: "idle" });
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="API key"
            />
          </div>

          {/* test + save */}
          <div className="row between" style={{ padding: "0 4px 4px", gap: 8 }}>
            <button
              className="btn ghost"
              style={{ padding: "6px 11px", fontSize: 12.5 }}
              onClick={runTest}
              disabled={!canSave || test.state === "testing"}
              type="button"
            >
              {test.state === "testing" ? "Testing…" : "Test connection"}
            </button>
            <button
              className="btn accent"
              style={{ padding: "6px 13px", fontSize: 12.5, opacity: canSave ? 1 : 0.5 }}
              onClick={() => {
                save();
                close();
              }}
              disabled={!canSave}
              type="button"
            >
              {isActiveDraft ? "✓ Saved" : "Save & use"}
            </button>
          </div>
          {test.state === "ok" && (
            <div style={{ padding: "2px 8px 0", fontSize: 12, color: "var(--accent)" }}>✓ Connected</div>
          )}
          {test.state === "err" && (
            <div style={{ padding: "2px 8px 0", fontSize: 12, color: "var(--danger, #e5736b)", lineHeight: 1.4 }}>
              ✗ {test.msg}
            </div>
          )}

          <div className="pop-foot">
            <span style={{ fontSize: 11, color: "var(--ink-faint)", lineHeight: 1.45 }}>
              Your key is stored in this browser only and sent with each question to run answers on your model — never saved on our servers. Search still runs on tubechat. Don’t use a shared computer.
            </span>
          </div>
        </>
      )}
    </Popover>
  );
}
