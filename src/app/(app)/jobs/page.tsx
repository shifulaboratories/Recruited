import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatPay, listJobs } from "@/lib/data/jobs";
import { listApplications, STAGES } from "@/lib/data/applications";
import { listInterviews } from "@/lib/data/interviews";
import { boardByKey } from "@/lib/boards";
import { createJob, loadSampleAction } from "@/server/actions";
import { dailyBrief } from "@/lib/data/brief";
import { ActionForm } from "@/components/forms";
import { Empty, Icon, PageHeader, Stat } from "@/components/ui";
import { STAGE_LABEL, STAGE_TONE, StageChip } from "@/components/provenance";

export const metadata = { title: "Jobs" };

const WEEK = 7 * 24 * 60 * 60 * 1000;

export default async function JobsPage() {
  const user = await requireUser();
  const now = new Date();
  const [jobs, { applications }, interviews, brief] = await Promise.all([
    listJobs(user.id),
    listApplications(user.id, { limit: 500 }),
    listInterviews(user.id, { from: now.toISOString(), to: new Date(now.getTime() + WEEK).toISOString(), status: "SCHEDULED" }),
    dailyBrief(user.id, { now }),
  ]);
  const today = todayItems(brief);
  const thisWeek = applications.filter((a) => now.getTime() - a.appliedAt.getTime() < WEEK).length;
  const aTier = applications.filter((a) => a.effectiveTier === "A" && a.stage !== "REJECTED" && a.stage !== "HIRED").length;
  const undecided = applications.filter((a) => a.tierIsProposal).length;
  const first = user.name?.split(/\s+/)[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={first ? `Good to see you, ${first}.` : "What you're hiring for"}
        sub={
          jobs.length
            ? `${jobs.filter((j) => j.status === "OPEN").length} open role${jobs.filter((j) => j.status === "OPEN").length === 1 ? "" : "s"}, ${undecided} tier${undecided === 1 ? "" : "s"} waiting on you.`
            : "Open your first role by telling Claude who you need."
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat i={1} label="Applied this week" value={thisWeek} hint={`${applications.length} in all`} />
        <Stat i={2} label="A tier, still open" value={aTier} tone="var(--rt-tier-a)" hint="worth a call" />
        <Stat i={3} label="Waiting on you" value={undecided} tone={undecided ? "var(--rt-primary)" : undefined} hint="proposed tiers to accept or change" />
        <Stat i={4} label="Interviews, next 7 days" value={interviews.length} hint={interviews[0]?.scheduledAt ? `next: ${interviews[0].candidate}` : "none booked"} />
      </div>

      {today.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline gap-3">
            <h2 className="h-section">Today</h2>
            <span className="text-xs text-rt-faint">Or ask Claude: &ldquo;What needs me today?&rdquo;</span>
          </div>
          <ul className="card rise divide-y divide-rt-border overflow-hidden" style={{ ["--i" as string]: 5 }}>
            {today.map((t, k) => (
              <li key={k}>
                <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-rt-subtle transition-colors">
                  <span className="inset grid place-items-center w-8 h-8 shrink-0" style={{ color: t.tone }}>
                    <Icon name={t.icon} size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium truncate">{t.title}</span>
                    <span className="block text-[12px] text-rt-muted truncate">{t.sub}</span>
                  </span>
                  <Icon name="chevron" size={14} className="text-rt-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="h-section">Roles</h2>
          <div className="flex-1" />
          <details className="relative group">
            <summary className="btn text-xs cursor-pointer">New role</summary>
            <div className="card absolute right-0 z-30 mt-2 w-[min(420px,calc(100vw-32px))] p-4 shadow-[var(--rt-shadow-raised)]">
              <ActionForm action={createJob} submit="Create job">
                <input className="field" name="title" placeholder="Job title" required />
                <textarea className="field min-h-28" name="description" placeholder="Description (markdown). Claude can write this for you." />
              </ActionForm>
            </div>
          </details>
        </div>

        {jobs.length === 0 ? (
          <div className="space-y-3">
            <Empty icon="jobs" title="No roles yet" ask="I'm hiring an operations VA, full time. Post it on OnlineJobs.ph and LinkedIn." />
            <form action={loadSampleAction} className="text-center">
              <button className="btn btn-quiet text-xs">Or look around a sample role first</button>
            </form>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {jobs.map((j, idx) => {
              const live = j.listings.filter((l) => l.status === "LIVE");
              const boards = [...new Set(j.listings.map((l) => boardByKey(l.board)?.name ?? l.board))];
              const active = STAGES.filter((s) => s !== "REJECTED");
              return (
                <Link
                  key={j.id}
                  href={`/jobs/${j.id}`}
                  className="card card-link rise p-5 flex flex-col gap-4 min-w-0"
                  style={{ ["--i" as string]: idx + 5 }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[15px] tracking-tight truncate">{j.title}</div>
                      <div className="text-rt-muted text-[12.5px] truncate">{[formatPay(j), j.location].filter(Boolean).join(" · ") || "Pay not set yet"}</div>
                    </div>
                    <StageChip stage={j.status} />
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[28px] font-semibold tracking-tight tabular leading-none">{j.applicants}</span>
                      <span className="text-rt-muted text-[12.5px]">applicant{j.applicants === 1 ? "" : "s"}</span>
                      {j.stages.NEW > 0 && (
                        <span className="chip ml-auto" style={{ ["--tone" as string]: "var(--rt-primary)" }}>
                          {j.stages.NEW} new
                        </span>
                      )}
                    </div>
                    {/* Where everyone is, as one bar: hue turns as people advance. */}
                    <div className="mt-3 flex h-2 gap-0.5 rounded-full overflow-hidden bg-rt-subtle" aria-hidden="true">
                      {active.map((s, si) =>
                        j.stages[s] ? (
                          <div key={s} className="draw" style={{ flex: j.stages[s], background: STAGE_TONE[s], ["--i" as string]: si }} />
                        ) : null,
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-rt-muted tabular">
                      {active.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5" style={{ ["--tone" as string]: STAGE_TONE[s] }}>
                          <span className="dot" />
                          {STAGE_LABEL[s]} {j.stages[s]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-rt-border text-[12px] text-rt-muted">
                    <Icon name="link" size={13} />
                    <span className="truncate">
                      {boards.length ? boards.join(", ") : "No listings yet"}
                      {j.listings.length > 0 && <span className="text-rt-faint"> · {live.length} live</span>}
                    </span>
                    <Icon name="chevron" size={14} className="ml-auto text-rt-faint" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

type Brief = Awaited<ReturnType<typeof dailyBrief>>;

/** The few things on the brief worth a row on the home screen, time-bound first. */
function todayItems(b: Brief) {
  const out: { icon: "calendar" | "clock" | "sparkle" | "note" | "mail" | "people" | "check"; tone: string; title: string; sub: string; href: string }[] = [];
  const at = (d: Date | null) => (d ? d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");
  for (const i of b.interviewsNext48h.items)
    out.push({
      icon: "calendar",
      tone: "var(--rt-primary)",
      title: `${i.title} with ${i.candidate}`,
      sub: `${at(i.at)} · ${i.job}${i.openProbes ? ` · ${i.openProbes} question${i.openProbes === 1 ? "" : "s"} to ask` : ""}`,
      href: `/applications/${i.applicationId}`,
    });
  for (const i of b.scorecardsMissing.items.slice(0, 3))
    out.push({ icon: "note", tone: "var(--rt-warning)", title: `Scorecard for ${i.candidate}`, sub: `${i.title} · ${i.job}`, href: `/applications/${i.applicationId}` });
  if (b.proposalsToDecide.count)
    out.push({
      icon: "sparkle",
      tone: "var(--rt-ai)",
      title: `${b.proposalsToDecide.count} proposed tier${b.proposalsToDecide.count === 1 ? "" : "s"} to decide`,
      sub: b.proposalsToDecide.items.slice(0, 3).map((p) => `${p.candidate} (${p.proposedTier})`).join(", "),
      href: "/applications",
    });
  if (b.unsentDrafts.count)
    out.push({
      icon: "mail",
      tone: "var(--rt-muted)",
      title: `${b.unsentDrafts.count} draft${b.unsentDrafts.count === 1 ? "" : "s"} to send`,
      sub: b.unsentDrafts.items.slice(0, 3).map((m) => m.candidate).join(", "),
      href: `/applications/${b.unsentDrafts.items[0].applicationId}`,
    });
  for (const i of b.waitingForApplicantToPickATime.items.slice(0, 2))
    out.push({ icon: "clock", tone: "var(--rt-faint)", title: `${i.candidate} hasn't picked a time yet`, sub: `${i.title} · ${i.slots} times offered`, href: `/applications/${i.applicationId}` });
  for (const r of b.referencesAnswered.items.slice(0, 2))
    out.push({ icon: "check", tone: "var(--rt-success)", title: `${r.referee} answered a reference for ${r.candidate}`, sub: r.job, href: `/applications/${r.applicationId}` });
  return out.slice(0, 7);
}
