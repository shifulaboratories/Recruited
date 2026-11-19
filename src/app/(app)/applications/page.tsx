import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/data/applications";
import { boardByKey } from "@/lib/boards";
import { ProvenanceBar, QualifiedChip, StageChip, TierChip, tierTone } from "@/components/provenance";
import { Avatar, Empty, Icon, PageHeader } from "@/components/ui";

export const metadata = { title: "Applicants" };

function sourceLabel(source: string) {
  const [key, variant] = source.split(" ");
  const b = boardByKey(key);
  return b ? `${b.name}${variant ? ` · ${variant}` : ""}` : source;
}

export default async function ApplicationsPage() {
  const user = await requireUser();
  const { applications, total } = await listApplications(user.id, { limit: 200, sort: "tier" });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Applicants · ${total}`} title="Everyone who applied" sub="Across every role, A tier first. Proposed tiers are striped until you decide." />
      {applications.length === 0 ? (
        <Empty icon="people" title="Nobody yet" ask="Import the applicants from this LinkedIn export." />
      ) : (
        <ul className="card divide-y divide-rt-border overflow-hidden">
          {applications.map((a, i) => (
            <li key={a.id} className="rise" style={{ ["--i" as string]: Math.min(i, 12) }}>
              <Link href={`/applications/${a.id}`} className="group grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_170px_110px_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 hover:bg-rt-subtle/60 transition-colors">
                <Avatar name={a.candidate} tone={tierTone(a.effectiveTier)} size={32} />
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.candidate}</div>
                  <div className="text-[12px] text-rt-faint truncate">
                    {a.job} · {sourceLabel(a.source)}
                  </div>
                </div>
                <div className="hidden md:block">
                  <QualifiedChip qualified={a.qualified} />
                </div>
                <div className="hidden md:block">
                  <ProvenanceBar r={a.provenance} compact />
                </div>
                <div className="hidden md:block">
                  <StageChip stage={a.stage} />
                </div>
                <div className="flex items-center gap-2">
                  <TierChip tier={a.effectiveTier} proposal={a.tierIsProposal} bare />
                  <Icon name="chevron" size={14} className="text-rt-faint group-hover:text-rt-foreground transition-colors" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
