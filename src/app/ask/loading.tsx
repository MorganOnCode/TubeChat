export default function AskLoading() {
    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <div className="h-8 w-64 bg-[var(--background-elevated)] rounded animate-pulse mb-2" />
            <div className="h-4 w-96 bg-[var(--background-elevated)] rounded animate-pulse mb-8" />
            <div className="h-12 w-full bg-[var(--background-elevated)] rounded-lg animate-pulse mb-4" />
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 w-48 bg-[var(--background-elevated)] rounded-full animate-pulse" />
                ))}
            </div>
        </div>
    );
}
