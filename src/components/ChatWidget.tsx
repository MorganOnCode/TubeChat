"use client";

import { useState, useRef, useEffect } from "react";

interface Source {
    videoId: string;
    title: string;
    channel: string;
    similarity: number;
    snippet: string;
}

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
    sources?: Source[];
}

interface ChatWidgetProps {
    /** Scope context for RAG. Sent as filter to /api/ask */
    context?: {
        channelId?: string;
        channelName?: string;
        videoId?: string;
        videoTitle?: string;
        topicName?: string;
    };
    /** Placeholder text */
    placeholder?: string;
    /** Initial suggested questions */
    suggestions?: string[];
}

export default function ChatWidget({ context, placeholder, suggestions }: ChatWidgetProps) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, loading]);

    const contextLabel = context?.channelName || context?.videoTitle || context?.topicName || "all channels";

    const handleSubmit = async (q?: string) => {
        const text = (q || input).trim();
        if (!text || loading) return;

        const userMsg: ChatMessage = { role: "user", content: text };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: text,
                    channelId: context?.channelId,
                    videoId: context?.videoId,
                    topicName: context?.topicName,
                }),
            });

            if (!res.ok) throw new Error(`${res.status}`);

            const data = await res.json();
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: data.answer, sources: data.sources },
            ]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Sorry, something went wrong. Please try again." },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // Floating button when closed
    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-[var(--color-accent)] text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
                title={`Ask about ${contextLabel}`}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-6rem)] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--background-secondary)]">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">🛸</span>
                    <div className="min-w-0">
                        <h3 className="text-xs font-semibold truncate">Ask OpenTube</h3>
                        <p className="text-[10px] text-[var(--foreground-muted)] truncate">
                            Searching {contextLabel}
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setOpen(false)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--background-tertiary)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <p className="text-xs text-[var(--foreground-muted)] mb-4">
                            Ask anything about {contextLabel}
                        </p>
                        {suggestions && suggestions.length > 0 && (
                            <div className="flex flex-wrap justify-center gap-1.5">
                                {suggestions.slice(0, 4).map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => handleSubmit(s)}
                                        className="px-2.5 py-1 text-[10px] rounded-full bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)] transition-all"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role === "assistant" && (
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center text-[10px]">
                                🛸
                            </div>
                        )}
                        <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                                msg.role === "user"
                                    ? "bg-[var(--color-accent)] text-white"
                                    : "bg-[var(--background-secondary)] border border-[var(--border)]"
                            }`}
                        >
                            {msg.content.split('\n').filter(p => p.trim()).map((p, j) => (
                                <p key={j} className={j > 0 ? "mt-1.5" : ""}>{p}</p>
                            ))}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-[var(--border)]">
                                    <p className="text-[9px] text-[var(--foreground-muted)] mb-1">Sources:</p>
                                    {msg.sources.slice(0, 3).map((s, j) => (
                                        <a
                                            key={j}
                                            href={`/videos/${s.videoId}`}
                                            className="block text-[9px] text-[var(--color-accent)] hover:underline truncate"
                                        >
                                            [{j + 1}] {s.title}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center text-[10px]">
                            🛸
                        </div>
                        <div className="bg-[var(--background-secondary)] border border-[var(--border)] rounded-lg px-3 py-2">
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground-muted)] animate-bounce" style={{ animationDelay: "0ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground-muted)] animate-bounce" style={{ animationDelay: "150ms" }} />
                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--foreground-muted)] animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--background-secondary)]">
                <div className="flex gap-2">
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder || `Ask about ${contextLabel}...`}
                        className="flex-1 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--color-accent)] transition-colors outline-none"
                        disabled={loading}
                    />
                    <button
                        onClick={() => handleSubmit()}
                        disabled={loading || !input.trim()}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] disabled:opacity-30 transition-all flex-shrink-0"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
