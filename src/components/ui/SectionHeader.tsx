/** Section title row with an optional right-aligned slot (link / kicker). */
export function SectionHeader({
  title,
  right,
  style,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="row between" style={{ marginBottom: 16, ...style }}>
      <span className="section-title">{title}</span>
      {right}
    </div>
  );
}
