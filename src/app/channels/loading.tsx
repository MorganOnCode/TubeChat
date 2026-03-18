export default function ChannelsLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="h-8 w-48 bg-[var(--background-elevated)] rounded animate-pulse mb-2" />
            <div className="h-4 w-96 bg-[var(--background-elevated)] rounded animate-pulse mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="bg-[var(--background-elevated)] rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[var(--border-color)] animate-pulse" />
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-32 bg-[var(--border-color)] rounded animate-pulse" />
                                <div className="h-3 w-20 bg-[var(--border-color)] rounded animate-pulse" />
                            </div>
                        </div>
                        <div className="h-3 w-full bg-[var(--border-color)] rounded animate-pulse" />
                        <div className="h-3 w-3/4 bg-[var(--border-color)] rounded animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
