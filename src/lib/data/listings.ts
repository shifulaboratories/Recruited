import type { ListingStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound, UserError } from "@/lib/data/errors";
import { requireJob } from "@/lib/data/jobs";
import { BOARD_KEYS, boardByKey, renderListing } from "@/lib/boards";
import { slug } from "@/lib/ids";

/**
 * Listings: one version of a job on one board. Each has its own apply link,
 * /apply/<slug>, which is how every application knows the listing that brought
 * it. Two listings of one job on one board (variant A and B) are a split test,
 * and `listingReport` is what compares them.
 */

export const LISTING_STATUSES: ListingStatus[] = ["DRAFT", "LIVE", "PAUSED", "CLOSED"];

export function applyPath(listingSlug: string) {
  return `/apply/${listingSlug}`;
}

export async function createListing(
  userId: string,
  input: { jobId: string; board: string; title: string; body: string; variant?: string; status?: ListingStatus },
) {
  const job = await requireJob(userId, input.jobId);
  if (!boardByKey(input.board)) throw new UserError(`board is one of ${BOARD_KEYS.join(", ")}.`);
  if (!input.title.trim()) throw new UserError("A listing needs a title.");
  let variant = input.variant?.trim().toUpperCase();
  if (!variant) {
    const taken = await db.listing.findMany({ where: { userId, jobId: job.id, board: input.board }, select: { variant: true } });
    const used = new Set(taken.map((t) => t.variant));
    variant = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !used.has(l));
    if (!variant) throw new UserError("This job already has 26 listings on that board.");
  }
  const clash = await db.listing.findFirst({ where: { userId, jobId: job.id, board: input.board, variant } });
  if (clash) throw new UserError(`Variant ${variant} on ${input.board} already exists for this job (listing ${clash.id}). Update it, or leave variant out to get the next free letter.`);
  return db.listing.create({
    data: {
      userId,
      jobId: job.id,
      board: input.board,
      variant,
      title: input.title.trim(),
      body: input.body,
      slug: slug(),
      status: input.status ?? "DRAFT",
      postedAt: input.status === "LIVE" ? new Date() : null,
    },
  });
}

export async function requireListing(userId: string, listingId: string) {
  const l = await db.listing.findFirst({ where: { id: listingId, userId, job: { archivedAt: null } } });
  if (!l) notFound("listing");
  return l;
}

/** Changes only the fields given. Going LIVE the first time stamps postedAt. */
export async function updateListing(
  userId: string,
  listingId: string,
  input: { title?: string; body?: string; status?: ListingStatus; externalUrl?: string; spendCents?: number },
) {
  const l = await requireListing(userId, listingId);
  if (input.title !== undefined && !input.title.trim()) throw new UserError("A listing needs a title.");
  if (input.spendCents !== undefined && input.spendCents < 0) throw new UserError("spend can't be negative.");
  if (input.externalUrl && !/^https?:\/\//.test(input.externalUrl)) throw new UserError("externalUrl must start with http.");
  const data: Prisma.ListingUpdateInput = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) (data as Record<string, unknown>)[k] = v;
  if (input.status === "LIVE" && !l.postedAt) data.postedAt = new Date();
  return db.listing.update({ where: { id: l.id }, data });
}

/** A listing plus what to paste into the board, with the apply link built in. */
export async function getListing(userId: string, listingId: string, baseUrl: string) {
  const l = await requireListing(userId, listingId);
  const url = `${baseUrl}${applyPath(l.slug)}`;
  return { ...l, applyUrl: url, rendered: renderListing(l.board, l.title, l.body, url) };
}

/**
 * Every listing of a job side by side: applicants, how many met the
 * must-haves, their tiers, how far they got, and what each cost. Tiers count
 * the person's decision where there is one and the assistant's proposal where
 * not; `proposalsOnly` says how many of the count are still proposals. This is the split-test
 * view: the listing with more applicants is often not the one that brought the
 * people worth hiring.
 */
export async function listingReport(userId: string, jobId: string) {
  const job = await requireJob(userId, jobId);
  const listings = await db.listing.findMany({
    where: { userId, jobId: job.id },
    orderBy: [{ board: "asc" }, { variant: "asc" }],
    include: { applications: { where: { archivedAt: null }, select: { stage: true, qualified: true, tier: true, proposedTier: true } } },
  });
  const unattributed = await db.application.count({ where: { userId, jobId: job.id, listingId: null, archivedAt: null } });
  const rows = listings.map((l) => {
    const apps = l.applications;
    const qualified = apps.filter((a) => a.qualified === true).length;
    const advanced = apps.filter((a) => ["INTERVIEW", "OFFER", "HIRED"].includes(a.stage)).length;
    const hired = apps.filter((a) => a.stage === "HIRED").length;
    const tiers = { A: 0, B: 0, C: 0, unranked: 0, proposalsOnly: 0 };
    for (const a of apps) {
      const t = a.tier ?? a.proposedTier;
      if (t) tiers[t]++;
      else tiers.unranked++;
      if (!a.tier && a.proposedTier) tiers.proposalsOnly++;
    }
    const spend = l.spendCents / 100;
    return {
      listingId: l.id,
      board: l.board,
      variant: l.variant,
      title: l.title,
      status: l.status,
      applicants: apps.length,
      qualified,
      reachedInterview: advanced,
      hired,
      spend,
      costPerApplicant: apps.length && spend ? Math.round((spend / apps.length) * 100) / 100 : null,
      costPerQualified: qualified && spend ? Math.round((spend / qualified) * 100) / 100 : null,
      tiers,
      costPerATier: tiers.A && spend ? Math.round((spend / tiers.A) * 100) / 100 : null,
      aTierPerHundred: spend ? Math.round((tiers.A / spend) * 100 * 100) / 100 : null,
    };
  });
  return { jobId: job.id, title: job.title, currency: job.salaryCurrency, listings: rows, unattributed };
}
