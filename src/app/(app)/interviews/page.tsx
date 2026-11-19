import { redirect } from "next/navigation";
import { requireSeat } from "@/lib/auth";
import { listInterviews } from "@/lib/data/interviews";
import { openMyScorecard } from "@/server/actions";
import { LocalTime } from "@/components/forms";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Your interviews" };

/**
 * An interviewer's whole app: the interviews they're on the panel of, and a
 * button to their own scorecard page for each. Nothing else about the
 * applicant, so every scorecard is written without seeing anyone else's.
 */
export default async function InterviewsPage() {
  const { seat, userId } = await requireSeat();
  if (!seat.panelId) redirect("/jobs");
  const interviews = await listInterviews(userId, { memberId: seat.panelId });
  const upcoming = interviews.filter((i) => i.status === "SCHEDULED");
  const past = interviews.filter((i) => i.status !== "SCHEDULED");
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader eyebrow="Interviewer" title="Your interviews" sub="The interviews you're on. Write your scorecard after each one; nobody else's verdict is shown to you first." />
      {interviews.length === 0 ? (
        <Empty icon="calendar" title="No interviews yet" ask="When you're added to an interview's panel, it shows up here." />
      ) : (
        [
          ["Coming up", upcoming],
          ["Done", past],
        ].map(([label, rows]) =>
          (rows as typeof interviews).length ? (
            <section key={label as string} className="space-y-3">
              <h2 className="h-section">{label as string}</h2>
              <ul className="card divide-y divide-rt-border overflow-hidden">
                {(rows as typeof interviews).map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="flex-1 min-w-[200px]">
                      <span className="block text-[13.5px] font-medium">
                        {i.candidate} · {i.title}
                      </span>
                      <span className="block text-[12px] text-rt-muted">
                        {i.job.title}
                        {i.scheduledAt ? (
                          <>
                            {" · "}
                            <LocalTime iso={i.scheduledAt.toISOString()} />
                          </>
                        ) : (
                          " · no time set yet"
                        )}
                        {i.location ? ` · ${i.location}` : ""}
                      </span>
                    </span>
                    {i.status !== "CANCELLED" && (
                      <form action={openMyScorecard.bind(null, i.id)}>
                        <button className="btn text-xs">Write your scorecard</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}
