/** tubechat logo — two mirrored almond "eyes" (alien-eyes mark). Themes via --accent. */
export function Mark({ size = 28 }: { size?: number }) {
  const eye =
    "M2,7 Q8,3 18,13 Q12,18 2,7 Z " +
    "M6.6,7.4 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0 Z " +
    "M10.7,9.7 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0 Z";
  return (
    <svg
      width={size}
      height={size * 0.55}
      viewBox="0 0 40 22"
      fill="none"
      role="img"
      aria-label="tubechat"
    >
      <g fill="var(--accent)" fillRule="evenodd">
        <path d={eye} />
        <path d={eye} transform="translate(40,0) scale(-1,1)" />
      </g>
    </svg>
  );
}
