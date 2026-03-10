"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface Source {
    videoId: string;
    title: string;
    channel: string;
    similarity: number;
    snippet: string;
}

interface AskResult {
    answer: string;
    sources: Source[];
    tokensUsed?: number;
}

const EXAMPLE_QUESTIONS = [
    "Who talks most about crash retrieval programs?",
    "What evidence exists for the Wilson memo?",
    "What do witnesses say about orb UFOs?",
    "Explain the connection between consciousness and UAPs",
    "What is Project Serpo?",
    "What did Bob Lazar claim about Area 51?",
];

function SourceCard({ source, index }: { source: Source; index: number }) {
    return (
        <a
            href={`/videos/${source.videoId}`}
            className="block p-3 rounded-lg bg-[var(--background-tertiary)] border border-[var(--border)] hover:border-[var(--color-accent)] transition-all group"
        >
            <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-medium line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
                        {source.title}
                    </h4>
                    <p className="text-[10px] text-[var(--color-accent)] mt-0.5">{source.channel}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)] mt-1 line-clamp-2 leading-relaxed">
                        {source.snippet}...
                    </p>
                </div>
            </div>
        </a>
    );
}

function AnswerDisplay({ result }: { result: AskResult }) {
    // Convert [Source N] references to styled badges
    const formatAnswer = (text: string) => {
        const parts = text.split(/(\[Source \d+\])/g);
        return parts.map((part, i) => {
            const match = part.match(/\[Source (\d+)\]/);
            if (match) {
                const num = parseInt(match[1]);
                const source = result.sources[num - 1];
                if (source) {
                    return (
                        <a
                            key={i}
                            href={`/videos/${source.videoId}`}
                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-[9px] font-bold hover:bg-[var(--color-accent)]/30 transition-colors mx-0.5 align-text-top"
                            title={`${source.title} — ${source.channel}`}
                        >
                            {num}
                        </a>
                    );
                }
            }
            return <span key={i}>{part}</span>;
        });
    };

    const paragraphs = result.answer.split('\n').filter(p => p.trim());

    return (
        <div className="space-y-6">
            {/* Answer */}
            <div className="prose-custom">
                {paragraphs.map((p, i) => {
                    // Check if it's a bullet point
                    if (p.trim().startsWith('- ') || p.trim().startsWith('• ')) {
                        return (
                            <div key={i} className="flex gap-2 text-sm leading-relaxed mb-2">
                                <span className="text-[var(--color-accent)] flex-shrink-0 mt-0.5">•</span>
                                <span>{formatAnswer(p.replace(/^[-•]\s*/, ''))}</span>
                            </div>
                        );
                    }
                    return (
                        <p key={i} className="text-sm leading-relaxed mb-3">
                            {formatAnswer(p)}
                        </p>
                    );
                })}
            </div>

            {/* Sources */}
            {result.sources.length > 0 && (
                <div>
                    <h3 className="text-xs font-medium text-[var(--foreground-muted)] mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        Sources ({result.sources.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {result.sources.map((source, i) => (
                            <SourceCard key={source.videoId} source={source} index={i} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AskPage() {
    const [question, setQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AskResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<Array<{ question: string; result: AskResult }>>([]);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history, result, loading]);

    const handleSubmit = async (q?: string) => {
        const queryText = q || question;
        if (!queryText.trim() || loading) return;

        // Save previous result to history
        if (result) {
            setHistory(prev => [...prev, { question: question, result }]);
        }

        setLoading(true);
        setError(null);
        setResult(null);
        setQuestion(queryText);

        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: queryText.trim() }),
            });

            if (!res.ok) {
                throw new Error(`Request failed: ${res.status}`);
            }

            const data: AskResult = await res.json();
            setResult(data);
        } catch (err) {
            setError('Failed to get an answer. Please try again.');
            console.error('Ask error:', err);
        } finally {
            setLoading(false);
            setQuestion("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-8rem)] flex flex-col">
            {/* Header */}
            {history.length === 0 && !result && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-center pb-8">
                    <div className="text-5xl mb-4">🛸</div>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                        Ask the transcript library
                    </h1>
                    <p className="mt-3 text-sm text-[var(--foreground-muted)] max-w-md">
                        Ask any question about UFOs, UAPs, NHI, or related topics. 
                        Answers are sourced from {" "}
                        <span className="text-[var(--color-accent)]">10 curated channels</span> 
                        {" "} and backed by real transcript data.
                    </p>

                    {/* Example questions */}
                    <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-lg">
                        {EXAMPLE_QUESTIONS.map((q) => (
                            <button
                                key={q}
                                onClick={() => {
                                    setQuestion(q);
                                    handleSubmit(q);
                                }}
                                className="px-3 py-1.5 text-xs rounded-full bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--color-accent)] hover:text-[var(--foreground)] transition-all"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Conversation history */}
            {(history.length > 0 || result || loading) && (
                <div className="flex-1 space-y-8 mb-8">
                    {history.map((entry, i) => (
                        <div key={i} className="space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center text-xs">
                                    👤
                                </div>
                                <p className="text-sm font-medium pt-1">{entry.question}</p>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center text-xs">
                                    🛸
                                </div>
                                <div className="flex-1 min-w-0">
                                    <AnswerDisplay result={entry.result} />
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Current question */}
                    {(result || loading) && (
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--background-tertiary)] flex items-center justify-center text-xs">
                                    👤
                                </div>
                                <p className="text-sm font-medium pt-1">{question || history[history.length - 1]?.question}</p>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center text-xs">
                                    🛸
                                </div>
                                <div className="flex-1 min-w-0">
                                    {loading ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                                                Searching transcripts...
                                            </div>
                                            <div className="space-y-2">
                                                <div className="h-3 w-full skeleton" />
                                                <div className="h-3 w-4/5 skeleton" />
                                                <div className="h-3 w-3/5 skeleton" />
                                            </div>
                                        </div>
                                    ) : result ? (
                                        <AnswerDisplay result={result} />
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>
            )}

            {/* Input area — always at bottom */}
            <div className="sticky bottom-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-6 pb-4">
                <div className="relative search-glow rounded-xl">
                    <textarea
                        ref={inputRef}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask a question about UFOs, UAPs, NHI..."
                        rows={1}
                        className="w-full min-h-[48px] max-h-32 pl-4 pr-14 py-3 rounded-xl bg-[var(--background-secondary)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:border-[var(--color-accent)] transition-all text-sm resize-none"
                        disabled={loading}
                    />
                    <button
                        onClick={() => handleSubmit()}
                        disabled={loading || !question.trim()}
                        className="absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-[var(--foreground-muted)] text-center mt-2">
                    Answers are generated from indexed transcripts. Always verify claims with original sources.
                </p>
            </div>
        </div>
    );
}
