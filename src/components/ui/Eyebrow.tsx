/** Mono eyebrow with a pulsing signal dot. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="eyebrow">
      <span className="dot" />
      {children}
    </span>
  );
}
