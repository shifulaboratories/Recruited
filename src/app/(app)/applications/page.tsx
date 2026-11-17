import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listApplications } from "@/lib/data/applications";
import { ProvenanceBar, QualifiedChip, StageChip } from "@/components/provenance";

export const metadata = { title: "Applicants" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const { applications, total } = await listApplications(user.id, { limit: 200 });
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Applicants · {total}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Everyone who applied</h1>
      </header>
      {applications.length === 0 ? (
        <p className="text-rt-muted">Nobody yet.</p>
      ) : (
        <ul className="card divide-y divide-rt-border">
          {applications.map((a) => (
            <li key={a.id}>
              <Link href={`/applications/${a.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 hover:bg-rt-subtle">
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{a.candidate}</div>
                  <div className="text-xs text-rt-muted">
                    {a.job} · {a.source}
                  </div>
                </div>
                <QualifiedChip qualified={a.qualified} />
                <ProvenanceBar r={a.provenance} />
                <StageChip stage={a.stage} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
