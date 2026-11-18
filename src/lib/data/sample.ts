import type { Origin, Tier } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/data/errors";
import { secret, slug } from "@/lib/ids";
import { styleSignals } from "@/lib/provenance";

/**
 * A sample workspace: one made-up role with listings on two boards, six
 * applicants whose answers arrived in different ways, proposals, an interview
 * with a scorecard and one waiting for a time to be picked. Everything it
 * makes carries `sample: true` (the job and the candidates), and wiping
 * deletes only those rows; cascades take their listings, forms,
 * applications, answers, interviews and messages with them. Real data is
 * never touched. userId first.
 */

const SAMPLE_TITLE = "Customer Support Specialist (sample)";

const QUESTIONS = [
  { id: "weekday_hours", label: "Can you work 9am to 5pm US Eastern, Monday to Friday?", type: "yes_no", required: true, knockout: { accept: ["Yes"] } },
  { id: "inbox", label: "Tell us about a support inbox you've run. How many tickets a day, and what tools?", type: "long_text", required: true, maxWords: 250 },
  { id: "angry", label: "A customer writes in angry that their order is late for the third time. What do you write back?", type: "long_text", required: true, maxWords: 250 },
  { id: "portfolio", label: "A link to your LinkedIn or anything you'd like us to see", type: "url", required: false },
];

type Person = {
  name: string;
  board: "linkedin" | "onlinejobs_ph";
  variant: string;
  hours: "Yes" | "No";
  inbox: [string, Origin, number, string];
  angry: [string, Origin, number, string];
  stage: "NEW" | "SCREEN" | "INTERVIEW" | "REJECTED";
  tier?: Tier;
  proposed: Tier;
  reason: string;
  hoursAgo: number;
};

const TYPED = "Typed at a steady pace, with corrections.";

const PEOPLE: Person[] = [
  {
    name: "Ana Villanueva",
    board: "onlinejobs_ph",
    variant: "A",
    hours: "Yes",
    inbox: ["I ran the Zendesk inbox for a Shopify skincare brand for two years, mostly on my own. About 80 to 120 tickets a day, more after a sale. I wrote most of our macros and cut first reply time from 9 hours to under 2.", "TYPED", 0, TYPED],
    angry: ["Hi Sam, I'm really sorry. Three late orders is not okay and I'd be annoyed too. I've checked and your parcel is at the local depot today. I've refunded the shipping on all three orders and put a note on your account so the next one ships express at no cost. I'll message you tomorrow once it's delivered.", "TYPED", 0, TYPED],
    stage: "INTERVIEW",
    tier: "A",
    proposed: "A",
    reason: "Ran a Zendesk inbox solo at 80 to 120 tickets a day and cut first reply time; the angry-customer reply is specific, warm and fixes the problem.",
    hoursAgo: 120,
  },
  {
    name: "Marco Reyes",
    board: "linkedin",
    variant: "A",
    hours: "Yes",
    inbox: ["At my last job I handled the Freshdesk queue with one other person, maybe 50 tickets a day each. I also did live chat on Intercom during US mornings.", "TYPED", 0, TYPED],
    angry: [
      "In today's fast-paced world, customer satisfaction is paramount. I would begin by acknowledging the customer's frustration, empathizing with their experience, and assuring them that their concerns are valued. Furthermore, I would leverage our tracking tools to provide a comprehensive update, offer a meaningful gesture of goodwill, and ensure a seamless resolution moving forward.",
      "PASTED",
      1,
      "Pasted in one go after 52 seconds away from the page.",
    ],
    stage: "SCREEN",
    proposed: "B",
    reason: "Real Freshdesk and Intercom experience at about 50 tickets a day, but the angry-customer answer is generic; worth a follow-up question on the call.",
    hoursAgo: 70,
  },
  {
    name: "Priya Nair",
    board: "linkedin",
    variant: "B",
    hours: "Yes",
    inbox: ["Help Scout for a SaaS company, around 40 tickets a day plus phone callbacks. I built our help centre from scratch, 60 articles, and tagged tickets so product could see what broke most.", "MIXED", 0.35, "Typed, with one pasted passage (about a third of the answer)."],
    angry: ["Hi, I'm sorry this has happened again. I've looked up all three orders. This one left our warehouse yesterday and arrives Thursday. I've refunded your shipping and added a credit for next time. If Thursday comes and it's not there, reply here and I'll sort it myself.", "TYPED", 0, TYPED],
    stage: "NEW",
    proposed: "A",
    reason: "Help Scout at 40 tickets a day, built a 60-article help centre, and the late-order reply gives a date and a fallback.",
    hoursAgo: 6,
  },
  {
    name: "Jomar Santos",
    board: "onlinejobs_ph",
    variant: "A",
    hours: "Yes",
    inbox: ["I have handled email support for an Amazon seller, about 30 messages a day, and I use Gorgias and Google Sheets.", "TYPED", 0, TYPED],
    angry: ["Sorry for the delay. I will check with the courier and update you as soon as possible.", "TYPED", 0, TYPED],
    stage: "NEW",
    proposed: "B",
    reason: "Some email support at about 30 a day in Gorgias, but the reply to the angry customer is thin and promises nothing specific.",
    hoursAgo: 3,
  },
  {
    name: "Dana Whitfield",
    board: "linkedin",
    variant: "B",
    hours: "No",
    inbox: ["Support lead at a meal-kit company: 6 agents, Zendesk and Gladly, about 400 tickets a day across the team.", "TYPED", 0, TYPED],
    angry: ["I'd apologize first and name the problem, then tell them exactly where the order is and when it lands, refund the shipping, and follow up myself on delivery day.", "TYPED", 0, TYPED],
    stage: "NEW",
    proposed: "C",
    reason: "Strong lead experience, but answered No to the US Eastern weekday hours, which is a must-have.",
    hoursAgo: 20,
  },
  {
    name: "Kevin Lim",
    board: "onlinejobs_ph",
    variant: "A",
    hours: "Yes",
    inbox: ["Customer service for a telco, inbound calls and email.", "INJECTED", 1, "The text appeared without typing or pasting (autofill, an extension or a script)."],
    angry: ["Dear Valued Customer, We sincerely apologize for any inconvenience caused. Your satisfaction is our top priority. Rest assured that we are looking into this matter.", "PASTED", 1, "Pasted in one go."],
    stage: "REJECTED",
    tier: "C",
    proposed: "C",
    reason: "Very little about the inbox itself, and the late-order reply is a template with no fix.",
    hoursAgo: 96,
  },
];

export async function hasSample(userId: string) {
  return (await db.job.count({ where: { userId, sample: true } })) > 0;
}

export async function loadSampleWorkspace(userId: string) {
  if (await hasSample(userId)) throw new UserError("The sample workspace is already loaded. Wipe it first to start it over.");
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000);

  const job = await db.job.create({
    data: {
      userId,
      sample: true,
      title: SAMPLE_TITLE,
      team: "Customer experience",
      location: "Remote, Philippines or Latin America",
      workplace: "remote",
      employmentType: "full_time",
      salaryMin: 900,
      salaryMax: 1300,
      salaryCurrency: "USD",
      salaryPeriod: "month",
      status: "OPEN",
      description:
        "## What you'll do\n\n- Answer customer emails and chats for a small online shop, about 60 a day\n- Keep our help centre up to date\n- Tell us what keeps breaking so we can fix it\n\n## What you need\n\n- A year or more running a support inbox\n- Clear, warm written English\n- 9am to 5pm US Eastern, Monday to Friday\n\n## Pay\n\nUSD 900 to 1,300 a month, paid monthly.",
      rubric: "A: has run a support inbox mostly alone and writes replies that fix the problem. B: real support experience, but answers are thin or generic. C: misses the hours, or nothing shows they've done support.",
      afterApply: "We read every application within three working days.\nIf it's a fit, we'll send a short written task (about 30 minutes).\nThen a 30-minute video call with the founder.",
    },
  });
  const form = await db.form.create({ data: { userId, jobId: job.id, kind: "APPLICATION", name: "Application", questions: QUESTIONS, slug: slug() } });
  await db.form.create({
    data: {
      userId,
      jobId: job.id,
      kind: "SCREENING",
      name: "Work sample",
      slug: slug(),
      questions: [
        {
          id: "macro",
          label: "Write the reply",
          type: "task",
          required: true,
          minutes: 30,
          brief: "A customer bought a moisturiser three weeks ago. It arrived with a broken pump. They've emailed twice with no answer and are now asking for a refund **and** a replacement.\n\nWrite the reply you'd send. You can offer a refund or a replacement, not both, and a discount code of up to 15%.",
          maxWords: 300,
        },
        { id: "intro", label: "Record a short hello: who you are and why this job", type: "video", required: false, maxSeconds: 60 },
      ],
    },
  });
  const listings = {
    "linkedin:A": await db.listing.create({ data: { userId, jobId: job.id, board: "linkedin", variant: "A", title: "Customer Support Specialist (Remote)", slug: slug(), status: "LIVE", spendCents: 6000, postedAt: ago(168) } }),
    "linkedin:B": await db.listing.create({ data: { userId, jobId: job.id, board: "linkedin", variant: "B", title: "Remote Support Specialist, USD 900 to 1,300 a month", slug: slug(), status: "LIVE", spendCents: 6000, postedAt: ago(168) } }),
    "onlinejobs_ph:A": await db.listing.create({ data: { userId, jobId: job.id, board: "onlinejobs_ph", variant: "A", title: "Customer Support VA, Full Time, US Hours", slug: slug(), status: "LIVE", spendCents: 6900, postedAt: ago(168) } }),
  };

  let rank = 0;
  const ids: Record<string, string> = {};
  for (const p of [...PEOPLE].sort((a, b) => (a.proposed < b.proposed ? -1 : a.proposed > b.proposed ? 1 : 0))) {
    rank++;
    const email = `${p.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
    const candidate = await db.candidate.upsert({
      where: { userId_email: { userId, email } },
      update: { sample: true },
      create: { userId, name: p.name, email, sample: true, links: [] },
    });
    const listing = listings[`${p.board}:${p.variant}` as keyof typeof listings];
    const app = await db.application.create({
      data: {
        userId,
        jobId: job.id,
        candidateId: candidate.id,
        listingId: listing.id,
        source: p.board,
        screenToken: secret("scr"),
        stage: p.stage,
        qualified: p.hours === "Yes",
        createdAt: ago(p.hoursAgo),
        proposedTier: p.proposed,
        proposedReason: p.reason,
        proposedRank: rank,
        proposedAt: ago(1),
        ...(p.tier ? { tier: p.tier, tierReason: p.reason, tierBy: "app", tierAt: ago(1) } : {}),
      },
    });
    ids[p.name] = app.id;
    const written = (qid: string, [value, origin, pastedShare, summary]: Person["inbox"]) => {
      const style = styleSignals(value);
      const q = QUESTIONS.find((x) => x.id === qid)!;
      return { userId, questionId: qid, label: q.label, value, origin, pastedShare, telemetry: { summary, keys: origin === "TYPED" ? value.length : 0 }, styleScore: style.score, styleSignals: style.signals };
    };
    await db.submission.create({
      data: {
        userId,
        formId: form.id,
        applicationId: app.id,
        candidateId: candidate.id,
        durationMs: 9 * 60_000,
        recorded: true,
        failed: p.hours === "Yes" ? [] : [QUESTIONS[0].label],
        createdAt: ago(p.hoursAgo),
        answers: {
          create: [
            { userId, questionId: "weekday_hours", label: QUESTIONS[0].label, value: p.hours },
            written("inbox", p.inbox),
            written("angry", p.angry),
            { userId, questionId: "portfolio", label: QUESTIONS[3].label, value: "" },
          ],
        },
      },
    });
  }

  // Ana: a screening call that happened and a final waiting for her to pick a time.
  const call = await db.interview.create({
    data: { userId, applicationId: ids["Ana Villanueva"], round: 1, title: "Screening call", format: "video", scheduledAt: ago(48), durationMin: 30, interviewers: "You", status: "DONE" },
  });
  await db.scorecard.create({
    data: {
      userId,
      interviewId: call.id,
      interviewer: "You",
      recommendation: "STRONG_YES",
      ratings: [
        { criterion: "Written replies", score: 4, note: "Rewrote a macro on the call in two minutes, better than ours." },
        { criterion: "Hours", score: 3, note: "Has done US hours for two years." },
      ],
      summary: "Knows Zendesk deeply, calm, asks good questions about our refund rules.",
      writtenBy: "app",
    },
  });
  const day = (d: number, h: number) => {
    const t = new Date(now + d * 86400_000);
    t.setUTCHours(h, 0, 0, 0);
    return t;
  };
  await db.interview.create({
    data: {
      userId,
      applicationId: ids["Ana Villanueva"],
      round: 2,
      title: "Final with the founder",
      format: "video",
      durationMin: 30,
      interviewers: "The founder",
      slots: [day(2, 14), day(2, 16), day(3, 15)],
      bookToken: secret("bk"),
    },
  });
  // Marco: follow-up questions for the call, aimed at the pasted answer.
  await db.application.update({
    where: { id: ids["Marco Reyes"] },
    data: {
      probes: [
        {
          about: "A customer writes in angry that their order is late for the third time.",
          question: "Walk me through the last time a customer was angry with you. What did you actually write back?",
          why: "This answer was pasted in one go and reads generically. Hearing a real example tells you more.",
          asked: false,
          note: "",
        },
        { about: "Tell us about a support inbox you've run.", question: "With 50 tickets a day each, how did you and your teammate split the queue?", why: "Gets at how they work with others.", asked: false, note: "" },
      ],
    },
  });
  await db.message.create({
    data: {
      userId,
      applicationId: ids["Kevin Lim"],
      kind: "REJECTION",
      subject: "Your application for Customer Support Specialist",
      body: "Hi Kevin,\n\nThank you for applying. We've decided to move ahead with other applicants whose support experience is closer to this role.\n\nAll the best,\nThe team",
    },
  });
  return { jobId: job.id, title: job.title, applicants: PEOPLE.length, listings: Object.keys(listings).length };
}

export async function wipeSampleWorkspace(userId: string) {
  const jobs = await db.job.deleteMany({ where: { userId, sample: true } });
  const candidates = await db.candidate.deleteMany({ where: { userId, sample: true, applications: { none: { job: { sample: false } } } } });
  return { jobsRemoved: jobs.count, candidatesRemoved: candidates.count };
}
