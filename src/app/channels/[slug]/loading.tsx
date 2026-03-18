export default function ChannelDetailLoading() {
    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[var(--background-elevated)] animate-pulse" />
                <div className="space-y-2">
                    <div className="h-6 w-48 bg-[var(--background-elevated)] rounded animate-pulse" />
                    <div className="h-4 w-32 bg-[var(--background-elevated)] rounded animate-pulse" />
                </div>
            </div>
            <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-[var(--background-elevated)] rounded-lg p-4 flex gap-4">
                        <div className="w-40 h-24 bg-[var(--border-color)] rounded animate-pulse shrink-0" />
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-3/4 bg-[var(--border-color)] rounded animate-pulse" />
                            <div className="h-3 w-1/2 bg-[var(--border-color)] rounded animate-pulse" />
                            <div className="h-3 w-full bg-[var(--border-color)] rounded animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
