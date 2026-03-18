export default function VideosLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="h-8 w-40 bg-[var(--background-elevated)] rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-[var(--background-elevated)] rounded animate-pulse mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="bg-[var(--background-elevated)] rounded-lg overflow-hidden">
                        <div className="w-full h-40 bg-[var(--border-color)] animate-pulse" />
                        <div className="p-3 space-y-2">
                            <div className="h-4 w-3/4 bg-[var(--border-color)] rounded animate-pulse" />
                            <div className="h-3 w-1/2 bg-[var(--border-color)] rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
