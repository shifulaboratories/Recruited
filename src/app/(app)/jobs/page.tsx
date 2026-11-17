import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatPay, listJobs } from "@/lib/data/jobs";
import { createJob } from "@/server/actions";
import { ActionForm } from "@/components/forms";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const user = await requireUser();
  const jobs = await listJobs(user.id);
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Jobs</p>
        <h1 className="text-2xl font-semibold tracking-tight">What you&apos;re hiring for</h1>
        <p className="text-rt-muted mt-1">
          The fastest way to open a role is to ask Claude: &ldquo;I&apos;m hiring an operations VA, post it on OnlineJobs.ph and LinkedIn.&rdquo;
        </p>
      </header>

      {jobs.length > 0 && (
        <ul className="card divide-y divide-rt-border">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4 hover:bg-rt-subtle">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{j.title}</div>
                  <div className="text-rt-muted text-xs">
                    {[j.status.toLowerCase(), formatPay(j), `${j.listings.length} listing${j.listings.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-xs text-rt-muted tabular">
                  {j.applicants} applicant{j.applicants === 1 ? "" : "s"} · {j.stages.NEW} new · {j.stages.INTERVIEW} interviewing
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="card p-5 max-w-xl">
        <h2 className="font-semibold mb-3">Open a role by hand</h2>
        <ActionForm action={createJob} submit="Create job">
          <input className="field" name="title" placeholder="Job title" required />
          <textarea className="field min-h-28" name="description" placeholder="Description (markdown). Claude can write this for you." />
        </ActionForm>
      </section>
    </div>
  );
}
