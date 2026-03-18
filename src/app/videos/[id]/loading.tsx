export default function VideoDetailLoading() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="h-4 w-32 bg-[var(--background-elevated)] rounded animate-pulse mb-4" />
            <div className="w-full aspect-video bg-[var(--background-elevated)] rounded-lg animate-pulse mb-4" />
            <div className="h-6 w-3/4 bg-[var(--background-elevated)] rounded animate-pulse mb-2" />
            <div className="h-4 w-48 bg-[var(--background-elevated)] rounded animate-pulse mb-6" />
            <div className="space-y-2">
                <div className="h-4 w-full bg-[var(--background-elevated)] rounded animate-pulse" />
                <div className="h-4 w-full bg-[var(--background-elevated)] rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-[var(--background-elevated)] rounded animate-pulse" />
            </div>
        </div>
    );
}
