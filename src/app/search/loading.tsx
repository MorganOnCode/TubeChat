export default function SearchLoading() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="h-8 w-32 bg-[var(--background-elevated)] rounded animate-pulse mb-4" />
            <div className="h-10 w-full bg-[var(--background-elevated)] rounded-lg animate-pulse mb-8" />
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-[var(--background-elevated)] rounded-lg p-4 space-y-2">
                        <div className="h-4 w-3/4 bg-[var(--border-color)] rounded animate-pulse" />
                        <div className="h-3 w-1/2 bg-[var(--border-color)] rounded animate-pulse" />
                        <div className="h-3 w-full bg-[var(--border-color)] rounded animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
