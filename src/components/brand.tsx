/**
 * The mark and lockup, drawn from the brand kit's geometry (brand/BRAND.md):
 * tile rx 15, head r8 at 32,24, shoulders 32x7, a line beneath at 55%. The
 * tile is the foreground ink and the person is cut out of it, so it inverts
 * with the theme on its own.
 */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="var(--rt-foreground)" />
      <circle cx="32" cy="24" r="8" fill="var(--rt-background)" />
      <rect x="16" y="37" width="32" height="7" rx="3.5" fill="var(--rt-background)" />
      <rect x="22" y="47" width="20" height="5" rx="2.5" fill="var(--rt-background)" opacity=".55" />
    </svg>
  );
}

export function Lockup({ size = 15 }: { size?: number }) {
  return (
    <span className="inline-flex items-center font-semibold tracking-tight" style={{ fontSize: size, gap: size * 0.36 }}>
      <Mark size={Math.round(size * 1.2)} />
      <span>
        recruited<span className="text-rt-muted">.tools</span>
      </span>
    </span>
  );
}
