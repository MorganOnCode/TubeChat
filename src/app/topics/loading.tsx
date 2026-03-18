export default function TopicsLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="h-8 w-40 bg-[var(--background-elevated)] rounded animate-pulse mb-2" />
            <div className="h-4 w-80 bg-[var(--background-elevated)] rounded animate-pulse mb-8" />
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="h-8 bg-[var(--background-elevated)] rounded-full animate-pulse"
                         style={{ width: `${60 + Math.random() * 80}px` }} />
                ))}
            </div>
        </div>
    );
}
