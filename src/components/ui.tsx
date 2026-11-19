/**
 * Small presentational pieces shared by every screen: icons, page headers,
 * stat tiles and empty states. Server-safe; no state.
 *
 * Icons are Lucide geometry inlined, the same set the landing page uses, so
 * there is no icon package to install.
 */

const PATHS: Record<string, React.ReactNode> = {
  jobs: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </>
  ),
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  plug: (
    <>
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </>
  ),
  out: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </>
  ),
  right: (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  no: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  link: (
    <>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <path d="M8 12h8" />
    </>
  ),
  mail: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  calendar: (
    <>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </>
  ),
  file: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </>
  ),
  sparkle: (
    <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z" />
  ),
  note: (
    <>
      <path d="M12 20h9" />
      <path d="M16.38 3.62a1 1 0 0 1 3 3L7.37 18.64a2 2 0 0 1-.86.5l-2.87.84a.5.5 0 0 1-.62-.62l.84-2.87a2 2 0 0 1 .5-.86Z" />
    </>
  ),
  money: (
    <>
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  form: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  board: (
    <>
      <path d="M6 5v11" />
      <path d="M12 5v6" />
      <path d="M18 5v14" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="rise flex flex-wrap items-end gap-4">
      <div className="flex-1 min-w-[240px] space-y-1.5">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h-page">{title}</h1>
        {sub && <div className="text-rt-muted">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** A number with a label, for the strip at the top of a page. */
export function Stat({ label, value, tone, hint, i = 0 }: { label: string; value: React.ReactNode; tone?: string; hint?: string; i?: number }) {
  return (
    <div className="card rise p-4" style={{ ["--i" as string]: i }}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold tracking-tight tabular leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint && <p className="text-xs text-rt-faint mt-1.5">{hint}</p>}
    </div>
  );
}

/** A section title with an optional count and actions on the right. */
export function SectionHead({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
      <h2 className="h-section">{title}</h2>
      {count != null && <span className="chip chip-mono">{count}</span>}
      <div className="flex-1" />
      {children}
    </div>
  );
}

/** What a screen says when there's nothing on it yet, with the sentence that fills it. */
export function Empty({ icon, title, ask }: { icon: IconName; title: string; ask?: string }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-2">
      <span className="inset grid place-items-center w-10 h-10 text-rt-muted">
        <Icon name={icon} size={18} />
      </span>
      <p className="font-medium">{title}</p>
      {ask && (
        <p className="text-rt-muted text-[13px] max-w-md">
          Ask Claude: <span className="text-rt-foreground">&ldquo;{ask}&rdquo;</span>
        </p>
      )}
    </div>
  );
}

/** Initials in a circle, toned by the applicant's tier. */
export function Avatar({ name, tone, size = 30 }: { name: string; tone?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-grid place-items-center rounded-full font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        color: tone ?? "var(--rt-muted)",
        background: `color-mix(in oklch, ${tone ?? "var(--rt-muted)"} 13%, var(--rt-surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${tone ?? "var(--rt-muted)"} 22%, transparent)`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
